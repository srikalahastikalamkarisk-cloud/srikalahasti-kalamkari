"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3, Plus, Search, Pencil, Trash2, X, Check,
  AlertTriangle, RefreshCw, FolderOpen, LoaderCircle,
  ImagePlus, UploadCloud, Link2, FolderTree
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import CategoryDropdown from "./category-dropdown";
import "./categories-manager.css";

type Category = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  parentId: string | null;
  sortOrder: number;
  parent: { id: string; name: string } | null;
  isActive: boolean;
  _count: { products: number; children: number };
};

type CategoryForm = {
  name: string;
  slug: string;
  parentId: string | null;
  image: string;
  isActive: boolean;
};

const emptyForm: CategoryForm = {
  name: "",
  slug: "",
  parentId: null,
  image: "",
  isActive: true,
};

function slugify(value: string) {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryDeleteImpact(categories: Category[], rootId: string) {
  const byParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const children = byParent.get(category.parentId) ?? [];
    children.push(category);
    byParent.set(category.parentId, children);
  }

  const affected: Category[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const category = categories.find(item => item.id === id);
    if (!category) return;
    affected.push(category);
    for (const child of byParent.get(id) ?? []) visit(child.id);
  };
  visit(rootId);

  return {
    categories: affected.length,
    subcategories: Math.max(0, affected.length - 1),
    products: affected.reduce((count, category) => count + category._count.products, 0),
  };
}

async function apiJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function SortableCategoryRow({
  category,
  disabled,
  onEdit,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  selected,
  onSelect,
}: {
  category: Category;
  disabled: boolean;
  onMove: (category: Category, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    disabled,
  });

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
      }}
    >
      <td className="skcm-select-cell">
        <input
          type="checkbox"
          aria-label={`Select ${category.name}`}
          checked={selected}
          onChange={event =>
            onSelect(category.id, event.target.checked)
          }
        />
      </td>
      <td>
        <div className={`skcm-category-cell ${category.parentId ? "skcm-subcategory-cell" : "skcm-main-category-cell"}`}>
          <button
            type="button"
            className="skcm-drag-handle"
            aria-label={`Reorder ${category.name}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={17}/>
          </button>
          {category.parentId && <span className="skcm-tree-branch">↳</span>}
          <div className="skcm-category-icon">
            {category.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={category.image} alt="" className="skcm-thumb"/>
            ) : <Layers3 size={19}/>}
          </div>
          <div>
            <strong>{category.name}</strong>
            <small className="skcm-category-slug">{category.slug}</small>
          </div>
        </div>
      </td>
      <td>
        <span className="skcm-type">
          {category.parentId ? "Subcategory" : "Main Category"}
        </span>
        {category.parent && (
          <small className="skcm-parent-name">{category.parent.name}</small>
        )}
      </td>
      <td>{category._count.products}</td>
      <td>
        <span className={`skcm-status ${category.isActive ? "active" : "inactive"}`}>
          <span/>
          {category.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td>
        <div className="skcm-row-actions">
          <div className="skcm-mobile-order-controls">
            <button
              type="button"
              aria-label={`Move ${category.name} up`}
              disabled={disabled || !canMoveUp}
              onClick={() => onMove(category, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${category.name} down`}
              disabled={disabled || !canMoveDown}
              onClick={() => onMove(category, 1)}
            >
              ↓
            </button>
          </div>
          <button aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}>
            <Pencil size={16}/>
          </button>
          <button className="danger" aria-label={`Delete ${category.name}`} onClick={() => onDelete(category)}>
            <Trash2 size={16}/>
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveDestination, setMoveDestination] = useState("");
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [changedGroups, setChangedGroups] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [imageMode, setImageMode] = useState<"file" | "url">("file");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/categories", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await apiJson(response);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  function toggleCategorySelection(id: string, checked: boolean) {
    setSelectedIds(current =>
      checked
        ? [...new Set([...current, id])]
        : current.filter(value => value !== id)
    );
  }

  async function bulkMoveCategories() {
    if (
      !moveDestination ||
      selectedIds.length === 0 ||
      busy ||
      savingOrder ||
      orderDirty
    ) {
      if (orderDirty) {
        setError("Save your category order before moving categories.");
      }
      return;
    }

    const selected = categories.filter(c =>
      selectedIds.includes(c.id)
    );

    if (
      selected.length !== selectedIds.length ||
      selected.some(c => c.parentId === null)
    ) {
      setError("Only subcategories can be bulk moved.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/categories/bulk-move",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            categoryIds: selectedIds,
            destinationParentId: moveDestination,
          }),
        }
      );

      await apiJson(response);
      setSelectedIds([]);
      setMoveDestination("");
      await loadCategories();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to move selected categories"
      );
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpdateStatus(isActive: boolean) {
    if (
      selectedIds.length === 0 ||
      busy ||
      savingOrder ||
      orderDirty
    ) {
      if (orderDirty) {
        setError("Save your category order before bulk editing.");
      }
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/categories/bulk",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            categoryIds: selectedIds,
            isActive,
          }),
        }
      );

      await apiJson(response);
      setSelectedIds([]);
      await loadCategories();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update selected categories"
      );
    } finally {
      setBusy(false);
    }
  }

  const mainCategories = useMemo(
    () => categories
      .filter(c => c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [categories]
  );

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...categories]
      .sort((a, b) => {
        const aRoot = a.parentId
          ? categories.find(c => c.id === a.parentId)
          : a;
        const bRoot = b.parentId
          ? categories.find(c => c.id === b.parentId)
          : b;

        const rootCompare =
          (aRoot?.sortOrder ?? 0) - (bRoot?.sortOrder ?? 0);

        if (rootCompare !== 0) return rootCompare;

        if (aRoot?.id !== bRoot?.id) {
          return (aRoot?.name ?? "").localeCompare(bRoot?.name ?? "");
        }

        if (a.parentId === null && b.parentId !== null) return -1;
        if (b.parentId === null && a.parentId !== null) return 1;

        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      })
      .filter(c => {
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.parent?.name.toLowerCase().includes(q) ?? false);

      const matchesStatus =
        filter === "all" ||
        (filter === "active" && c.isActive) ||
        (filter === "inactive" && !c.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, filter]);

  const reorderEnabled =
    !loading &&
    !busy &&
    !savingOrder &&
    search.trim() === "" &&
    filter === "all";

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!reorderEnabled || !over || active.id === over.id) return;

    const source = categories.find(c => c.id === active.id);
    const target = categories.find(c => c.id === over.id);

    if (!source || !target) return;

    // Categories can only move among siblings.
    if (source.parentId !== target.parentId) return;

    const siblings = categories
      .filter(c => c.parentId === source.parentId)
      .sort((a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
      );

    const oldIndex = siblings.findIndex(c => c.id === source.id);
    const newIndex = siblings.findIndex(c => c.id === target.id);

    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);

    const positions = new Map(
      reordered.map((c, index) => [c.id, index + 1])
    );

    setCategories(current =>
      current.map(c =>
        positions.has(c.id)
          ? { ...c, sortOrder: positions.get(c.id)! }
          : c
      )
    );

    setOrderDirty(true);

    const groupKey = source.parentId ?? "__root__";

    setChangedGroups(current =>
      current.includes(groupKey)
        ? current
        : [...current, groupKey]
    );
  }

  function moveCategory(
    category: Category,
    direction: -1 | 1
  ) {
    if (!reorderEnabled) return;

    const siblings = categories
      .filter(c => c.parentId === category.parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name)
      );

    const currentIndex = siblings.findIndex(
      c => c.id === category.id
    );

    const nextIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= siblings.length
    ) return;

    const reordered = arrayMove(
      siblings,
      currentIndex,
      nextIndex
    );

    const positions = new Map(
      reordered.map((c, index) => [c.id, index + 1])
    );

    setCategories(current =>
      current.map(c =>
        positions.has(c.id)
          ? { ...c, sortOrder: positions.get(c.id)! }
          : c
      )
    );

    setOrderDirty(true);

    const groupKey = category.parentId ?? "__root__";

    setChangedGroups(current =>
      current.includes(groupKey)
        ? current
        : [...current, groupKey]
    );
  }

  async function saveCategoryOrder() {
    if (
      !orderDirty ||
      savingOrder ||
      busy ||
      loading ||
      changedGroups.length === 0
    ) return;

    setSavingOrder(true);
    setError("");

    try {
      const groups = new Map<string | null, Category[]>();

      for (const category of categories) {
        const group = groups.get(category.parentId) ?? [];
        group.push(category);
        groups.set(category.parentId, group);
      }

      const changed = [...groups.entries()]
        .filter(([parentId]) =>
          changedGroups.includes(parentId ?? "__root__")
        )
        .map(([parentId, group]) => ({
          parentId,
          categoryIds: [...group]
            .sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.name.localeCompare(b.name)
            )
            .map(category => category.id),
        }));

      if (changed.length === 0) {
        throw new Error("No category groups available to save");
      }

      const response = await fetch(
        "/api/admin/categories/reorder",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ groups: changed }),
        }
      );

      await apiJson(response);
      await loadCategories();
      setOrderDirty(false);
      setChangedGroups([]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save category order"
      );
    } finally {
      setSavingOrder(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setSlugEdited(false);
    setImageMode("file");
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      image: category.image ?? "",
      isActive: category.isActive,
    });
    setSlugEdited(true);
    setImageMode(category.image?.startsWith("https://") ? "url" : "file");
    setFormError("");
    setFormOpen(true);
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setFormError("Choose a JPG, PNG or WebP image smaller than 5 MB.");
      return;
    }

    setUploading(true);
    setFormError("");

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/admin/categories/upload", {
        method: "POST",
        credentials: "same-origin",
        body,
      });

      const data = await apiJson(response);

      setForm(current => ({ ...current, image: data.image }));
      setImageMode("file");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading) return;

    setBusy(true);
    setFormError("");

    try {
      const response = await fetch(
        editing
          ? `/api/admin/categories/${encodeURIComponent(editing.id)}`
          : "/api/admin/categories",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim(),
            parentId: form.parentId,
            image: form.image.trim() || null,
            isActive: form.isActive,
          }),
        }
      );

      await apiJson(response);
      setFormOpen(false);
      setEditing(null);
      await loadCategories();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory() {
    if (!deleteTarget || busy || deleteConfirmName.trim() !== deleteTarget.name) return;

    const impact = getCategoryDeleteImpact(categories, deleteTarget.id);
    if (impact.categories === 0) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/categories/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmName: deleteConfirmName.trim(),
            expectedCategoryCount: impact.categories,
            expectedProductCount: impact.products,
          }),
        }
      );

      await apiJson(response);
      setDeleteTarget(null);
      setDeleteConfirmName("");
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function openCategoryDelete(category: Category) {
    setDeleteConfirmName("");
    setDeleteTarget(category);
  }

  const activeCount = categories.filter(c => c.isActive).length;
  const subCount = categories.filter(c => c.parentId !== null).length;
  const deleteImpact = deleteTarget
    ? getCategoryDeleteImpact(categories, deleteTarget.id)
    : null;

  return (
    <div className="skcm-content">
      <div className="skcm-page-head">
        <div>
          <span className="skad-eyebrow">YOUR COLLECTIONS</span>
          <h1>Category Management</h1>
          <p>Organise main categories and subcategories for your Kalamkari store.</p>
        </div>
        <button className="skcm-primary-btn" onClick={openAdd}>
          <Plus size={18}/> Add Category
        </button>
      </div>

      <div className="skcm-stats">
        <div className="skcm-stat">
          <span>Total Categories</span>
          <strong>{categories.length}</strong>
          <small>All collections</small>
        </div>
        <div className="skcm-stat">
          <span>Main Categories</span>
          <strong>{mainCategories.length}</strong>
          <small>Top-level collections</small>
        </div>
        <div className="skcm-stat">
          <span>Subcategories</span>
          <strong>{subCount}</strong>
          <small>{activeCount} total active categories</small>
        </div>
      </div>

      {error && (
        <div className="skcm-error" role="alert">
          <AlertTriangle size={18}/>
          <span>{error}</span>
          <button aria-label="Dismiss" onClick={() => setError("")}><X size={16}/></button>
        </div>
      )}

      <section className="skcm-panel">
        <div className="skcm-panel-head">
          <div>
            <span className="skad-eyebrow">COLLECTION LIBRARY</span>
            <h2>All Categories</h2>
          </div>
          <button
            className="skcm-icon-btn"
            aria-label="Refresh categories"
            onClick={() => void loadCategories()}
          >
            <RefreshCw size={18}/>
          </button>
        </div>

        <div className="skcm-order-toolbar">
          <span>
            Drag categories to reorder. Save to update the storefront.
          </span>
          <button
            type="button"
            className="skcm-primary-btn"
            disabled={!orderDirty || savingOrder || busy}
            onClick={() => void saveCategoryOrder()}
          >
            {savingOrder ? "Saving Order..." : "Save Order"}
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="skcm-bulk-toolbar">
            <strong>
              {selectedIds.length} selected
            </strong>

            <div className="skcm-bulk-actions">
              <div className="skcm-bulk-destination">
                <CategoryDropdown
                  label="Move selected categories to"
                  value={moveDestination}
                  disabled={busy || savingOrder || orderDirty}
                  searchable
                  options={[
                    { value: "", label: "Move to Main Category..." },
                    ...mainCategories.map(category => ({
                      value: category.id,
                      label: category.name,
                    })),
                  ]}
                  onChange={setMoveDestination}
                />
              </div>

              <button
                type="button"
                disabled={
                  busy ||
                  savingOrder ||
                  orderDirty ||
                  !moveDestination ||
                  selectedIds.some(id =>
                    categories.find(c => c.id === id)?.parentId === null
                  )
                }
                onClick={() => void bulkMoveCategories()}
              >
                Move Selected
              </button>
              <button
                type="button"
                disabled={busy || savingOrder || orderDirty}
                onClick={() => void bulkUpdateStatus(true)}
              >
                Activate
              </button>

              <button
                type="button"
                disabled={busy || savingOrder || orderDirty}
                onClick={() => void bulkUpdateStatus(false)}
              >
                Deactivate
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        <div className="skcm-toolbar">
          <div className="skcm-search">
            <Search size={18}/>
            <input
              aria-label="Search categories"
              placeholder="Search categories..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="skcm-status-dropdown">
            <CategoryDropdown
              label="Filter category status"
              value={filter}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              onChange={setFilter}
            />
          </div>
        </div>

        {loading ? (
          <div className="skcm-empty">
            <LoaderCircle className="skcm-spin" size={28}/>
            <p>Loading categories...</p>
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="skcm-empty">
            <div className="skcm-empty-icon"><FolderOpen size={30}/></div>
            <h3>{categories.length ? "No matching categories" : "Create your first category"}</h3>
            <p>{categories.length ? "Try a different search or filter." : "Start with a main category such as Sarees."}</p>
            {!categories.length && (
              <button className="skcm-primary-btn" onClick={openAdd}>
                <Plus size={17}/> Create Category
              </button>
            )}
          </div>
        ) : (
          <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="skcm-table-scroll">
                <table className="skcm-table">
                  <thead>
                    <tr>
                      <th className="skcm-select-cell">
                        <input
                          type="checkbox"
                          aria-label="Select all visible categories"
                          checked={
                            visibleCategories.length > 0 &&
                            visibleCategories.every(c =>
                              selectedIds.includes(c.id)
                            )
                          }
                          onChange={event => {
                            const ids = visibleCategories.map(c => c.id);
                            setSelectedIds(current =>
                              event.target.checked
                                ? [...new Set([...current, ...ids])]
                                : current.filter(id => !ids.includes(id))
                            );
                          }}
                        />
                      </th>
                      <th>CATEGORY</th>
                      <th>TYPE / PARENT</th>
                      <th>PRODUCTS</th>
                      <th>STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext
                      items={visibleCategories.map(category => category.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {visibleCategories.map(category => (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          disabled={!reorderEnabled}
                          onEdit={openEdit}
                          onDelete={openCategoryDelete}
                          onMove={moveCategory}
                          selected={selectedIds.includes(category.id)}
                          onSelect={toggleCategorySelection}
                          canMoveUp={categories
                            .filter(c => c.parentId === category.parentId)
                            .some(c => c.sortOrder < category.sortOrder)}
                          canMoveDown={categories
                            .filter(c => c.parentId === category.parentId)
                            .some(c => c.sortOrder > category.sortOrder)}
                        />
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
              </div>
            </DndContext>
        )}
        <div className="skcm-panel-footer">
          Showing {visibleCategories.length} of {categories.length} categories
        </div>
      </section>

      {formOpen && (
        <div className="skcm-modal-backdrop">
          <div className="skcm-modal" role="dialog" aria-modal="true" aria-labelledby="skcm-form-title">
            <div className="skcm-modal-head">
              <div>
                <span className="skad-eyebrow">COLLECTION DETAILS</span>
                <h2 id="skcm-form-title">{editing ? "Edit Category" : "Add New Category"}</h2>
              </div>
              <button
                className="skcm-icon-btn"
                aria-label="Close"
                disabled={busy || uploading}
                onClick={() => setFormOpen(false)}
              ><X size={20}/></button>
            </div>

            <form onSubmit={saveCategory}>
              <div className="skcm-modal-body">
                {formError && (
                  <div className="skcm-error" role="alert">
                    <AlertTriangle size={17}/>{formError}
                  </div>
                )}

                <div className="skcm-field">
                  <span>Category Type *</span>
                  <div className="skcm-type-picker">
                    <button
                      type="button"
                      className={form.parentId === null ? "selected" : ""}
                      onClick={() => setForm(c => ({ ...c, parentId: null }))}
                    >
                      <Layers3 size={19}/>
                      Main Category
                    </button>
                    <button
                      type="button"
                      className={form.parentId !== null ? "selected" : ""}
                      disabled={
                        mainCategories.filter(c => c.id !== editing?.id).length === 0 ||
                        (editing?._count.children ?? 0) > 0
                      }
                      onClick={() => {
                        const first = mainCategories.find(c => c.id !== editing?.id);
                        if (first) setForm(c => ({ ...c, parentId: first.id }));
                      }}
                    >
                      <FolderTree size={19}/>
                      Subcategory
                    </button>
                  </div>
                </div>

                {form.parentId !== null && (
                  <div className="skcm-field">
                    <span>Parent Category *</span>
                    <CategoryDropdown
                      label="Parent Category"
                      value={form.parentId}
                      searchable
                      options={mainCategories
                        .filter(c => c.id !== editing?.id)
                        .map(c => ({
                          value: c.id,
                          label: c.name,
                        }))}
                      onChange={value =>
                        setForm(c => ({ ...c, parentId: value }))
                      }
                    />
                  </div>
                )}

                <label className="skcm-field">
                  <span>Category Name *</span>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Kalamkari Cotton Sarees"
                    value={form.name}
                    onChange={e => {
                      const name = e.target.value;
                      setForm(c => ({
                        ...c,
                        name,
                        slug: slugEdited ? c.slug : slugify(name),
                      }));
                    }}
                  />
                </label>

                <label className="skcm-field">
                  <span>URL Slug *</span>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={form.slug}
                    onChange={e => {
                      setSlugEdited(true);
                      setForm(c => ({ ...c, slug: slugify(e.target.value) }));
                    }}
                  />
                  <small>Unique URL identifier for this category.</small>
                </label>

                <div className="skcm-field">
                  <span>Category Image</span>
                  <div className="skcm-image-modes">
                    <button
                      type="button"
                      className={imageMode === "file" ? "selected" : ""}
                      onClick={() => setImageMode("file")}
                    ><UploadCloud size={16}/> Choose File</button>
                    <button
                      type="button"
                      className={imageMode === "url" ? "selected" : ""}
                      onClick={() => setImageMode("url")}
                    ><Link2 size={16}/> Image URL</button>
                  </div>

                  {imageMode === "file" ? (
                    <div className="skcm-upload-area">
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={e => void uploadFile(e.target.files?.[0])}
                      />
                      <ImagePlus size={29}/>
                      <strong>{uploading ? "Uploading image..." : "Upload category image"}</strong>
                      <small>JPG, PNG or WebP · Maximum 5 MB</small>
                      <button
                        type="button"
                        className="skcm-secondary-btn"
                        disabled={uploading || busy}
                        onClick={() => fileInput.current?.click()}
                      >
                        {uploading ? "Uploading..." : "Choose File"}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="url"
                      placeholder="https://example.com/category.webp"
                      value={form.image.startsWith("https://") ? form.image : ""}
                      onChange={e => setForm(c => ({ ...c, image: e.target.value }))}
                    />
                  )}

                  {form.image && (
                    <div className="skcm-image-preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.image} alt="Category preview"/>
                      <div>
                        <strong>Image selected</strong>
                        <small>{form.image.startsWith("/") ? "Uploaded file" : "External image URL"}</small>
                      </div>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => setForm(c => ({ ...c, image: "" }))}
                      ><Trash2 size={16}/> Remove</button>
                    </div>
                  )}
                </div>

                <label className="skcm-switch-row">
                  <span>
                    <strong>Active Category</strong>
                    <small>Enable this category for storefront use.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(c => ({ ...c, isActive: e.target.checked }))}
                  />
                </label>
              </div>

              <div className="skcm-modal-footer">
                <button
                  type="button"
                  className="skcm-secondary-btn"
                  disabled={busy || uploading}
                  onClick={() => setFormOpen(false)}
                >Cancel</button>
                <button className="skcm-primary-btn" type="submit" disabled={busy || uploading}>
                  {busy ? <LoaderCircle className="skcm-spin" size={17}/> : <Check size={17}/>}
                  {busy ? "Saving..." : editing ? "Save Changes" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="skcm-modal-backdrop">
          <div className="skcm-modal skcm-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="skcm-delete-title">
            <div className="skcm-modal-body">
              <div className="skcm-warning-icon"><AlertTriangle size={27}/></div>
              <h2 id="skcm-delete-title">Permanently Delete Category Tree?</h2>
              <p>Deleting <strong>{deleteTarget.name}</strong> affects this category and its nested subcategories.</p>
              <p className="skcm-delete-warning">
                {deleteImpact?.products ?? 0} products and {deleteImpact?.subcategories ?? 0} subcategories will be permanently deleted.
                Order history and purchase snapshots will remain intact.
              </p>
              <p className="skcm-delete-warning">
                Products have one category in this store. Products assigned to this category tree will be deleted; products in other categories will remain.
              </p>
              <label className="skcm-field">
                Type the exact category name to confirm: <strong>{deleteTarget.name}</strong>
                <input
                  value={deleteConfirmName}
                  disabled={busy}
                  onChange={event => setDeleteConfirmName(event.target.value)}
                />
              </label>
            </div>
            <div className="skcm-modal-footer">
              <button className="skcm-secondary-btn" disabled={busy} onClick={() => { setDeleteTarget(null); setDeleteConfirmName(""); }}>
                Cancel
              </button>
              <button
                className="skcm-danger-btn"
                disabled={busy || deleteConfirmName.trim() !== deleteTarget.name}
                onClick={() => void deleteCategory()}
              >{busy ? "Deleting..." : "Delete Permanently"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
