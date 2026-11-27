"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Package, Plus, Search, RefreshCw, Pencil, Trash2, X, Download,
  LoaderCircle, AlertTriangle, ChevronLeft,
  ChevronRight, ImageIcon, Filter
} from "lucide-react";
import ProductFilterDropdown from "./product-filter-dropdown";
import "./products-manager.css";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: string | number;
  originalPrice: string | number | null;
  stock: number;
  images: unknown;
  isActive: boolean;
  pricingMode: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  _count: {
    variants: number;
  };
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

function firstImage(images: unknown): string | null {
  if (Array.isArray(images)) {
    return images.find(
      (item): item is string =>
        typeof item === "string" && item.length > 0
    ) ?? null;
  }

  return typeof images === "string" && images.length > 0
    ? images
    : null;
}

function money(value: string | number | null) {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

const PRODUCTS_VIEW_KEY = "sk-admin-products-view-v1";
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const BULK_SETTINGS_FIELDS = [
  { key: "isActive", label: "Active Product",
    description: "Control product visibility on the website." },
  { key: "isNewArrival", label: "New Arrivals",
    description: "Mark selected products as new arrivals." },
  { key: "isFeatured", label: "Featured Products",
    description: "Include products in featured collections." },
  { key: "allowCOD", label: "Cash on Delivery",
    description: "Control the product COD setting." },
  { key: "allowEnquiry", label: "Product Enquiry",
    description: "Enable or disable product enquiry." },
] as const;

type BulkSettingKey =
  typeof BULK_SETTINGS_FIELDS[number]["key"];

type BulkSettingValue = "keep" | "enable" | "disable";

type BulkSettingsDraft =
  Record<BulkSettingKey, BulkSettingValue>;

const EMPTY_BULK_SETTINGS: BulkSettingsDraft = {
  isActive: "keep",
  isNewArrival: "keep",
  isFeatured: "keep",
  allowCOD: "keep",
  allowEnquiry: "keep",
};

export default function ProductsManager() {
  const [viewReady, setViewReady] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const requestVersion = useRef(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIds, setSettingsIds] = useState<string[]>([]);
  const [settingsDraft, setSettingsDraft] =
    useState<BulkSettingsDraft>(EMPTY_BULK_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const settingsLock = useRef(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategoryId, setMoveCategoryId] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceOperation, setPriceOperation] = useState("set");
  const [priceValue, setPriceValue] = useState("");
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [stockOpen, setStockOpen] = useState(false);
  const [stockOperation, setStockOperation] = useState("set");
  const [stockValue, setStockValue] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [stockError, setStockError] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("");
  const [deleteAllCount, setDeleteAllCount] = useState<number | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Restore the previous catalogue view for this browser tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PRODUCTS_VIEW_KEY);

      if (raw) {
        const saved = JSON.parse(raw);

        if (typeof saved.search === "string")
          setSearch(saved.search);

        if (typeof saved.categoryId === "string")
          setCategoryId(saved.categoryId);

        if (typeof saved.subcategoryId === "string")
          setSubcategoryId(saved.subcategoryId);

        if (["all", "active", "inactive"].includes(saved.status))
          setStatus(saved.status);

        if (Number.isSafeInteger(saved.page) && saved.page > 0)
          setPage(saved.page);

        if (PAGE_SIZE_OPTIONS.includes(saved.pageSize))
          setPageSize(saved.pageSize);
      }
    } catch {
      // Invalid or unavailable storage: use defaults.
    } finally {
      setViewReady(true);
    }
  }, []);

  useEffect(() => {
    if (!viewReady) return;

    try {
      sessionStorage.setItem(
        PRODUCTS_VIEW_KEY,
        JSON.stringify({
          search,
          categoryId,
          subcategoryId,
          status,
          page,
          pageSize
        })
      );
    } catch {
      // Catalogue remains usable without storage.
    }
  }, [
    viewReady, search, categoryId,
    subcategoryId, status, page, pageSize
  ]);

  const loadCategories = useCallback(async () => {
    const response = await fetch("/api/admin/categories", {
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load categories");
    }

    const data = await response.json();
    setCategories(data.categories ?? []);
  }, []);

  const loadProducts = useCallback(async () => {
    if (!viewReady) return;

    const version = ++requestVersion.current;

    setLoading(true);
    setSelectedIds([]);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        status,
      });

      if (search.trim()) params.set("q", search.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (subcategoryId) params.set("subcategoryId", subcategoryId);

      const response = await fetch(
        `/api/admin/products?${params.toString()}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load products");
      }

      if (version !== requestVersion.current) return;

      const lastPage = Math.max(
        1, Number(data.pagination?.pages) || 1
      );

      if (page > lastPage) {
        setProducts([]);
        setSelectedIds([]);
        setPage(lastPage);
        return;
      }

      setProducts(data.products ?? []);
      setSelectedIds([]);
      setPagination(data.pagination);
    } catch (err) {
      if (version !== requestVersion.current) return;

      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      if (version === requestVersion.current)
        setLoading(false);
    }
  }, [
    viewReady, page, pageSize, search,
    categoryId, subcategoryId, status
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCategories().catch(err => {
        setError(
          err instanceof Error ? err.message : "Unable to load categories"
        );
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  useEffect(() => {
    if (!viewReady) return;

    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      requestVersion.current++;
    };
  }, [loadProducts, viewReady]);

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds(current =>
      checked
        ? [...new Set([...current, id])]
        : current.filter(value => value !== id)
    );
  }

  function togglePageSelection(checked: boolean) {
    setSelectedIds(checked ? products.map(product => product.id) : []);
  }

  async function confirmBulkSettings() {
    if (
      settingsLock.current ||
      loading ||
      settingsIds.length === 0 ||
      settingsIds.length > 100
    ) return;

    if (
      settingsIds.length !== selectedIds.length ||
      !settingsIds.every(id => selectedIds.includes(id))
    ) {
      setSettingsError(
        "Product selection changed. Close and select again."
      );
      return;
    }

    const changes: Partial<Record<BulkSettingKey, boolean>> = {};

    for (const field of BULK_SETTINGS_FIELDS) {
      const value = settingsDraft[field.key];

      if (value !== "keep") {
        changes[field.key] = value === "enable";
      }
    }

    if (Object.keys(changes).length === 0) {
      setSettingsError("Choose at least one setting to change.");
      return;
    }

    settingsLock.current = true;
    setSettingsBusy(true);
    setSettingsError("");
    setSettingsNotice("");

    try {
      const response = await fetch(
        "/api/admin/products/bulk-settings",
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productIds: settingsIds,
            changes
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.error || "Unable to update product settings"
        );
      }

      setSettingsOpen(false);
      setSelectedIds([]);
      setSettingsNotice(
        `Settings updated for ${result.updatedCount} products.`
      );

      await loadProducts();
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Unable to update product settings"
      );
    } finally {
      settingsLock.current = false;
      setSettingsBusy(false);
    }
  }

  async function confirmBulkMove() {
    if (!moveCategoryId || selectedIds.length === 0 || moving) return;

    setMoving(true);
    setMoveError("");

    try {
      const response = await fetch("/api/admin/products/bulk-move", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          categoryId: moveCategoryId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to move products");
      }

      setMoveOpen(false);
      setMoveCategoryId("");
      setSelectedIds([]);
      await loadProducts();
    } catch (err) {
      setMoveError(
        err instanceof Error ? err.message : "Unable to move products"
      );
    } finally {
      setMoving(false);
    }
  }

  async function confirmBulkPrice() {
    const value = Number(priceValue);

    if (
      priceBusy ||
      selectedIds.length === 0 ||
      selectedIds.length > 100 ||
      !priceValue.trim() ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (priceOperation !== "set" && value > 100)
    ) return;

    setPriceBusy(true);
    setPriceError("");

    try {
      const response = await fetch("/api/admin/products/bulk-price", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          operation: priceOperation,
          value,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to update prices");
      }

      setPriceOpen(false);
      setPriceValue("");
      setSelectedIds([]);
      await loadProducts();
    } catch (err) {
      setPriceError(
        err instanceof Error ? err.message : "Unable to update prices"
      );
    } finally {
      setPriceBusy(false);
    }
  }

  async function confirmBulkStock() {
    const value = Number(stockValue);

    if (
      stockBusy ||
      selectedIds.length === 0 ||
      selectedIds.length > 100 ||
      !stockValue.trim() ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 1000000
    ) return;

    setStockBusy(true);
    setStockError("");

    try {
      const response = await fetch("/api/admin/products/bulk-stock", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          operation: stockOperation,
          value,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to update stock");
      }

      setStockOpen(false);
      setStockValue("");
      setSelectedIds([]);
      await loadProducts();
    } catch (err) {
      setStockError(
        err instanceof Error ? err.message : "Unable to update stock"
      );
    } finally {
      setStockBusy(false);
    }
  }

  async function confirmBulkDelete() {
    if (
      bulkDeleting ||
      bulkDeleteConfirm !== "DELETE" ||
      selectedIds.length === 0 ||
      selectedIds.length > 100
    ) return;

    setBulkDeleting(true);
    setBulkDeleteError("");

    try {
      const response = await fetch("/api/admin/products/bulk-delete", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selectedIds,
          confirmation: "DELETE",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete products");
      }

      setBulkDeleteOpen(false);
      setBulkDeleteConfirm("");
      setSelectedIds([]);
      await loadProducts();
    } catch (err) {
      setBulkDeleteError(
        err instanceof Error ? err.message : "Unable to delete products"
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  async function openDeleteAll() {
    setDeleteAllConfirm("");
    setDeleteAllError("");
    setDeleteAllCount(null);
    setDeleteAllOpen(true);
    try {
      const response = await fetch("/api/admin/products/bulk-delete", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to count products");
      setDeleteAllCount(result.count);
    } catch (err) {
      setDeleteAllError(err instanceof Error ? err.message : "Unable to count products");
    }
  }

  async function confirmDeleteAll() {
    if (deleteAllBusy || deleteAllCount === null || deleteAllConfirm !== "DELETE ALL PRODUCTS") return;
    setDeleteAllBusy(true);
    setDeleteAllError("");
    try {
      const response = await fetch("/api/admin/products/bulk-delete", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteAll: true,
          expectedCount: deleteAllCount,
          confirmation: "DELETE ALL PRODUCTS",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete all products");
      setDeleteAllOpen(false);
      setDeleteAllConfirm("");
      setSelectedIds([]);
      await loadProducts();
    } catch (err) {
      setDeleteAllError(err instanceof Error ? err.message : "Unable to delete all products");
    } finally {
      setDeleteAllBusy(false);
    }
  }

  function openDelete(product: Product) {
    setDeleteTarget(product);
    setDeleteName("");
    setDeleteError("");
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteName("");
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteName.trim() !== deleteTarget.name || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmName: deleteName.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete product");
      }

      setDeleteTarget(null);
      setDeleteName("");
      await loadProducts();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Unable to delete product"
      );
    } finally {
      setDeleting(false);
    }
  }

  function updateFilter(
    setter: (value: string) => void,
    value: string
  ) {
    setter(value);
    setPage(1);
  }

  function productsExportHref() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (subcategoryId) params.set("subcategoryId", subcategoryId);
    if (status !== "all") params.set("status", status);
    const query = params.toString();
    return `/api/admin/products/export${query ? `?${query}` : ""}`;
  }

  return (
    <div className="skpm-page">
      <div className="skpm-heading">
        <div>
          <span className="skpm-eyebrow">STORE CATALOGUE</span>
          <h1>Products</h1>
          <p>Manage your Kalamkari product collection.</p>
        </div>

        <div className="skpm-heading-actions">
          <a className="skpm-export-btn" href={productsExportHref()}>
            <Download size={16} /> Export Products
          </a>
          <button type="button" className="skpm-delete-all-btn" onClick={() => void openDeleteAll()}>
            <Trash2 size={16} /> Delete All Products
          </button>
          <Link href="/admin/products/new" className="skpm-add-btn">
            <Plus size={18} />
            Add Product
          </Link>
        </div>
      </div>

      <div className="skpm-summary">
        <div className="skpm-summary-card">
          <span className="skpm-summary-icon">
            <Package size={21} />
          </span>
          <div>
            <small>Matching Products</small>
            <strong>{pagination.total}</strong>
          </div>
        </div>

        <div className="skpm-summary-card">
          <span className="skpm-summary-icon">
            <Filter size={21} />
          </span>
          <div>
            <small>Current Page</small>
            <strong>{pagination.pages ? page : 0} / {pagination.pages}</strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="skpm-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => void loadProducts()}>Retry</button>
        </div>
      )}

      <section className="skpm-panel">
        <div className="skpm-panel-heading">
          <div>
            <h2>All Products</h2>
            <p>Search, filter and manage your catalogue.</p>
          </div>

          <button
            className="skpm-refresh"
            type="button"
            disabled={loading}
            onClick={() => void loadProducts()}
            aria-label="Refresh products"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="skpm-filters">
          <label className="skpm-search">
            <Search size={18} />
            <input
              aria-label="Search products"
              placeholder="Search product name, SKU..."
              value={search}
              onChange={e => updateFilter(setSearch, e.target.value)}
            />
          </label>

          <ProductFilterDropdown
            label="Filter by main category"
            value={categoryId}
            searchable
            options={[
              { value: "", label: "All Categories" },
              ...categories
                .filter(category => !category.parentId)
                .map(category => ({
                  value: category.id,
                  label: category.name,
                })),
            ]}
            onChange={value => {
              setCategoryId(value);
              setSubcategoryId("");
              setPage(1);
            }}
          />

          <ProductFilterDropdown
            label="Filter by subcategory"
            value={subcategoryId}
            searchable
            options={[
              { value: "", label: "All Subcategories" },
              ...categories
                .filter(category =>
                  category.parentId !== null &&
                  (!categoryId || category.parentId === categoryId)
                )
                .map(category => ({
                  value: category.id,
                  label: category.name,
                })),
            ]}
            onChange={value => {
              setSubcategoryId(value);
              setPage(1);
            }}
          />

          <ProductFilterDropdown
            label="Filter product status"
            value={status}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            onChange={value => updateFilter(setStatus, value)}
          />
        </div>

        {settingsNotice && (
          <div className="skpm-settings-notice" role="status">
            {settingsNotice}
            <button
              type="button"
              onClick={() => setSettingsNotice("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="skpm-view-controls">
          <label className="skpm-page-size">
            <span>Products per page</span>
            <select
              aria-label="Products per page"
              value={pageSize}
              onChange={event => {
                setSelectedIds([]);
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size} Products
                </option>
              ))}
            </select>
          </label>

          <label className="skpm-page-select">
            <input
              type="checkbox"
              disabled={loading || products.length === 0}
              checked={
                products.length > 0 &&
                products.every(product =>
                  selectedIds.includes(product.id)
                )
              }
              onChange={event =>
                togglePageSelection(event.target.checked)
              }
            />
            Select all {loading ? "" : products.length} on this page
          </label>
        </div>

        {selectedIds.length > 0 && (
          <div className="skpm-bulk-toolbar">
            <div className="skpm-bulk-summary">
              <strong>{selectedIds.length} selected</strong>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </button>
            </div>
            <div className="skpm-bulk-actions">
              <button
                type="button"
                className="skpm-bulk-settings-trigger"
                disabled={
                  loading ||
                  settingsBusy ||
                  selectedIds.length > 100
                }
                onClick={() => {
                  setSettingsIds([...selectedIds]);
                  setSettingsDraft({ ...EMPTY_BULK_SETTINGS });
                  setSettingsError("");
                  setSettingsNotice("");
                  setSettingsOpen(true);
                }}
              >
                Product Settings
              </button>
              <button
                type="button"
                disabled={moving || selectedIds.length > 100}
                onClick={() => {
                  setMoveCategoryId("");
                  setMoveError("");
                  setMoveOpen(true);
                }}
              >
                Move Category
              </button>
              <button
                type="button"
                disabled={priceBusy || selectedIds.length > 100}
                onClick={() => {
                  setPriceOperation("set");
                  setPriceValue("");
                  setPriceError("");
                  setPriceOpen(true);
                }}
              >
                Edit Prices
              </button>
              <button
                type="button"
                disabled={stockBusy || selectedIds.length > 100}
                onClick={() => {
                  setStockOperation("set");
                  setStockValue("");
                  setStockError("");
                  setStockOpen(true);
                }}
              >
                Edit Stock
              </button>
              <button
                type="button"
                className="skpm-bulk-delete-trigger"
                disabled={bulkDeleting || selectedIds.length > 100}
                onClick={() => {
                  setBulkDeleteConfirm("");
                  setBulkDeleteError("");
                  setBulkDeleteOpen(true);
                }}
              >
                Bulk Delete
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="skpm-state">
            <LoaderCircle className="skpm-spin" size={30} />
            <p>Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="skpm-state">
            <Package size={38} />
            <h3>{pagination.total ? "No matching products" : "No products yet"}</h3>
            <p>
              {pagination.total
                ? "Try changing your search or filters."
                : "Add your first Kalamkari product to get started."}
            </p>
            {!pagination.total && (
              <Link href="/admin/products/new" className="skpm-add-btn">
                <Plus size={17} /> Add First Product
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="skpm-table-scroll">
              <table className="skpm-table">
                <thead>
                  <tr>
                    <th className="skpm-select-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all products on this page"
                        checked={
                          products.length > 0 &&
                          products.every(product => selectedIds.includes(product.id))
                        }
                        onChange={event => togglePageSelection(event.target.checked)}
                      />
                    </th>
                    <th>PRODUCT</th>
                    <th>SKU</th>
                    <th>CATEGORY</th>
                    <th>SELLING PRICE</th>
                    <th>STOCK</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id}>
                      <td className="skpm-select-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${product.name}`}
                          checked={selectedIds.includes(product.id)}
                          onChange={event =>
                            toggleSelected(product.id, event.target.checked)
                          }
                        />
                      </td>
                      <td>
                        <div className="skpm-product">
                          <div className="skpm-product-image">
                            {firstImage(product.images) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={firstImage(product.images)!}
                                alt={product.name}
                              />
                            ) : (
                              <ImageIcon size={23} />
                            )}
                          </div>
                          <div>
                            <strong>{product.name}</strong>
                            <small>{product.slug}</small>
                          </div>
                        </div>
                      </td>
                      <td>{product.sku || "—"}</td>
                      <td>{product.category?.name || "—"}</td>
                      <td>
                        <strong>{money(product.price)}</strong>
                        {product.originalPrice && (
                          <small className="skpm-original">
                            {money(product.originalPrice)}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className={product.stock > 0 ? "skpm-stock" : "skpm-stock-empty"}>
                          {product.stock}
                        </span>
                      </td>
                      <td>
                        <span className={`skpm-status ${product.isActive ? "active" : "inactive"}`}>
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="skpm-edit-btn"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil size={16} />
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="skpm-delete-btn"
                          onClick={() => openDelete(product)}
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="skpm-mobile-cards">
              {products.map(product => (
                <article className="skpm-mobile-card" key={product.id}>
                  <label className="skpm-mobile-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={event =>
                        toggleSelected(product.id, event.target.checked)
                      }
                    />
                    Select Product
                  </label>
                  <div className="skpm-mobile-card-top">
                    <div className="skpm-product-image">
                      {firstImage(product.images) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={firstImage(product.images)!} alt={product.name} />
                      ) : (
                        <ImageIcon size={23} />
                      )}
                    </div>
                    <div className="skpm-mobile-card-title">
                      <strong>{product.name}</strong>
                      <small>SKU: {product.sku || "—"}</small>
                      <span className={`skpm-status ${product.isActive ? "active" : "inactive"}`}>
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="skpm-mobile-card-details">
                    <div><small>Category</small><strong>{product.category?.name || "—"}</strong></div>
                    <div><small>Price</small><strong>{money(product.price)}</strong></div>
                    <div><small>Stock</small><strong>{product.stock}</strong></div>
                  </div>
                  <div className="skpm-mobile-actions">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="skpm-mobile-edit"
                    >
                      <Pencil size={16} /> Edit Product
                    </Link>
                    <button
                      type="button"
                      className="skpm-mobile-delete"
                      onClick={() => openDelete(product)}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="skpm-pagination">
              <span>
                Showing {(page - 1) * pagination.limit + 1}–
                {Math.min(page * pagination.limit, pagination.total)}
                {" "}of {pagination.total}
              </span>

              <div>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <strong>{page} / {Math.max(1, pagination.pages)}</strong>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {settingsOpen && (
        <div className="skpm-modal-backdrop">
          <div
            className="skpm-bulk-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-settings-title"
          >
            <div className="skpm-settings-header">
              <div>
                <span>CATALOGUE MANAGEMENT</span>
                <h2 id="skpm-settings-title">
                  Bulk Product Settings
                </h2>
                <p>{settingsIds.length} selected products</p>
              </div>
              <button
                type="button"
                disabled={settingsBusy}
                onClick={() => setSettingsOpen(false)}
                aria-label="Close product settings"
              >
                <X size={20} />
              </button>
            </div>

            <div className="skpm-settings-fields">
              {BULK_SETTINGS_FIELDS.map(field => (
                <label
                  className="skpm-settings-row"
                  key={field.key}
                >
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.description}</small>
                  </span>
                  <select
                    disabled={settingsBusy}
                    value={settingsDraft[field.key]}
                    onChange={event => {
                      const value =
                        event.target.value as BulkSettingValue;

                      setSettingsDraft(current => ({
                        ...current,
                        [field.key]: value
                      }));
                    }}
                  >
                    <option value="keep">No Change</option>
                    <option value="enable">Enable</option>
                    <option value="disable">Disable</option>
                  </select>
                </label>
              ))}
            </div>

            <p className="skpm-settings-info">
              Only changed settings will be applied.
              Other product details remain unchanged.
            </p>

            {settingsError && (
              <div className="skpm-error" role="alert">
                {settingsError}
              </div>
            )}

            <div className="skpm-settings-footer">
              <button
                type="button"
                disabled={settingsBusy}
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="skpm-settings-apply"
                disabled={
                  settingsBusy ||
                  loading ||
                  Object.values(settingsDraft)
                    .every(value => value === "keep")
                }
                onClick={() => void confirmBulkSettings()}
              >
                {settingsBusy
                  ? "Applying..."
                  : `Apply to ${settingsIds.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="skpm-modal-backdrop">
          <div
            className="skpm-bulk-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-bulk-delete-title"
          >
            <div className="skpm-bulk-delete-icon" aria-hidden="true">
              !
            </div>

            <h2 id="skpm-bulk-delete-title">
              Permanently Delete Products?
            </h2>

            <p>
              You are about to permanently delete
              <strong> {selectedIds.length} selected products</strong>.
            </p>

            <div className="skpm-bulk-delete-warning">
              This action cannot be undone. Product variants will also
              be deleted. Historical orders, payments, customer data,
              and purchase snapshots will be preserved.
            </div>

            <label className="skpm-bulk-delete-field">
              Type <strong>DELETE</strong> to confirm
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Type DELETE"
                value={bulkDeleteConfirm}
                disabled={bulkDeleting}
                onChange={event =>
                  setBulkDeleteConfirm(event.target.value)
                }
              />
            </label>

            {bulkDeleteError && (
              <p className="skpm-bulk-delete-error" role="alert">
                {bulkDeleteError}
              </p>
            )}

            <div className="skpm-bulk-delete-actions">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={
                  bulkDeleting ||
                  bulkDeleteConfirm !== "DELETE" ||
                  selectedIds.length === 0
                }
                onClick={() => void confirmBulkDelete()}
              >
                {bulkDeleting
                  ? "Deleting..."
                  : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAllOpen && (
        <div className="skpm-modal-backdrop">
          <div className="skpm-bulk-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="skpm-delete-all-title">
            <div className="skpm-bulk-delete-icon" aria-hidden="true">!</div>
            <h2 id="skpm-delete-all-title">Delete All Products?</h2>
            <p>
              {deleteAllCount === null
                ? "Counting products…"
                : <>This will permanently delete exactly <strong>{deleteAllCount} products</strong> and their variants.</>}
            </p>
            <div className="skpm-bulk-delete-warning">
              All categories, orders, order items, customer data, payment attempts, webhook events, invoices, and purchase snapshots are preserved. Product media files are not removed.
            </div>
            <label className="skpm-bulk-delete-field">
              Type <strong>DELETE ALL PRODUCTS</strong> to confirm
              <input
                value={deleteAllConfirm}
                disabled={deleteAllBusy}
                autoComplete="off"
                spellCheck={false}
                onChange={event => setDeleteAllConfirm(event.target.value)}
              />
            </label>
            {deleteAllError && <p className="skpm-bulk-delete-error" role="alert">{deleteAllError}</p>}
            <div className="skpm-bulk-delete-actions">
              <button type="button" disabled={deleteAllBusy} onClick={() => setDeleteAllOpen(false)}>Cancel</button>
              <button
                type="button"
                className="danger"
                disabled={deleteAllBusy || deleteAllCount === null || deleteAllConfirm !== "DELETE ALL PRODUCTS"}
                onClick={() => void confirmDeleteAll()}
              >{deleteAllBusy ? "Deleting…" : "Delete All Products"}</button>
            </div>
          </div>
        </div>
      )}

      {stockOpen && (
        <div className="skpm-modal-backdrop">
          <div
            className="skpm-bulk-stock-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-bulk-stock-title"
          >
            <h2 id="skpm-bulk-stock-title">Bulk Edit Stock</h2>
            <p>
              Update inventory for
              <strong> {selectedIds.length} selected products</strong>.
            </p>

            <div className="skpm-bulk-stock-field">
              <span>Stock Operation</span>
              <ProductFilterDropdown
                label="Stock Operation"
                value={stockOperation}
                options={[
                  { value: "set", label: "Set Stock Quantity" },
                  { value: "add", label: "Add Stock Quantity" },
                  { value: "subtract", label: "Reduce Stock Quantity" },
                ]}
                onChange={value => {
                  if (!stockBusy) {
                    setStockOperation(value);
                    setStockError("");
                  }
                }}
              />
            </div>

            <label className="skpm-bulk-stock-field">
              Quantity
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                placeholder="Example: 50"
                value={stockValue}
                disabled={stockBusy}
                onChange={event => setStockValue(event.target.value)}
              />
            </label>

            <div className="skpm-bulk-stock-note">
              {stockOperation === "set"
                ? "Every selected product will receive this stock quantity."
                : stockOperation === "add"
                  ? "This quantity will be added to each selected product."
                  : "This quantity will be deducted from each selected product."}
              <br />
              Negative stock is not allowed. Products with variants
              require variant-level stock editing.
            </div>

            {stockError && (
              <p className="skpm-bulk-stock-error" role="alert">
                {stockError}
              </p>
            )}

            <div className="skpm-bulk-stock-actions">
              <button
                type="button"
                disabled={stockBusy}
                onClick={() => setStockOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  stockBusy ||
                  !stockValue.trim() ||
                  !Number.isInteger(Number(stockValue)) ||
                  Number(stockValue) < 0 ||
                  Number(stockValue) > 1000000
                }
                onClick={() => void confirmBulkStock()}
              >
                {stockBusy ? "Updating..." : "Confirm Stock Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {priceOpen && (
        <div className="skpm-modal-backdrop">
          <div
            className="skpm-bulk-price-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-bulk-price-title"
          >
            <h2 id="skpm-bulk-price-title">Bulk Edit Prices</h2>
            <p>
              Update selling prices for
              <strong> {selectedIds.length} selected products</strong>.
            </p>

            <div className="skpm-bulk-price-field">
              <span>Price Operation</span>
              <ProductFilterDropdown
                label="Price Operation"
                value={priceOperation}
                options={[
                  { value: "set", label: "Set Fixed Price" },
                  { value: "increase", label: "Increase by Percentage" },
                  { value: "decrease", label: "Decrease by Percentage" },
                ]}
                onChange={value => {
                  if (!priceBusy) {
                    setPriceOperation(value);
                    setPriceError("");
                  }
                }}
              />
            </div>

            <label className="skpm-bulk-price-field">
              {priceOperation === "set"
                ? "New Selling Price (₹)"
                : "Percentage (%)"}
              <input
                type="number"
                min="0.01"
                max={priceOperation === "set" ? "99999999.99" : "100"}
                step="0.01"
                placeholder={
                  priceOperation === "set" ? "Example: 2000" : "Example: 10"
                }
                value={priceValue}
                disabled={priceBusy}
                onChange={event => setPriceValue(event.target.value)}
              />
            </label>

            <div className="skpm-bulk-price-note">
              {priceOperation === "set"
                ? "All selected products will receive this selling price."
                : priceOperation === "increase"
                  ? "Each selected product price will increase by this percentage."
                  : "Each selected product price will decrease by this percentage."}
              <br />
              Only FIXED pricing products are supported.
              Variant prices and previous orders stay unchanged.
            </div>

            {priceError && (
              <p className="skpm-bulk-price-error" role="alert">
                {priceError}
              </p>
            )}

            <div className="skpm-bulk-price-actions">
              <button
                type="button"
                disabled={priceBusy}
                onClick={() => setPriceOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  priceBusy ||
                  !priceValue.trim() ||
                  !Number.isFinite(Number(priceValue)) ||
                  Number(priceValue) <= 0 ||
                  (priceOperation !== "set" && Number(priceValue) > 100)
                }
                onClick={() => void confirmBulkPrice()}
              >
                {priceBusy ? "Updating..." : "Confirm Price Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="skpm-modal-backdrop">
          <div
            className="skpm-bulk-move-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-bulk-move-title"
          >
            <h2 id="skpm-bulk-move-title">Move Products</h2>
            <p>
              Move <strong>{selectedIds.length}</strong> selected
              products to another category.
            </p>

            <div className="skpm-bulk-move-field">
              <span>Destination Category</span>
              <ProductFilterDropdown
                label="Destination Category"
                value={moveCategoryId}
                searchable
                options={[
                  { value: "", label: "Select Category" },
                  ...categories.map(category => ({
                    value: category.id,
                    label: `${category.parentId ? "↳ " : ""}${category.name}`,
                  })),
                ]}
                onChange={value => {
                  if (!moving) {
                    setMoveCategoryId(value);
                    setMoveError("");
                  }
                }}
              />
            </div>

            {moveError && (
              <p className="skpm-bulk-move-error" role="alert">
                {moveError}
              </p>
            )}

            <div className="skpm-bulk-move-actions">
              <button
                type="button"
                disabled={moving}
                onClick={() => setMoveOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!moveCategoryId || moving}
                onClick={() => void confirmBulkMove()}
              >
                {moving ? "Moving..." : "Move Products"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="skpm-delete-backdrop">
          <div
            className="skpm-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="skpm-delete-title"
          >
            <div className="skpm-delete-header">
              <h2 id="skpm-delete-title">Permanently Delete Product?</h2>
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <p>
              This permanently deletes the product and its variants.
              This action cannot be undone.
            </p>

            <p className="skpm-delete-product-name">{deleteTarget.name}</p>

            <label className="skpm-delete-label">
              Type the exact product name to confirm:
              <input
                autoFocus
                value={deleteName}
                disabled={deleting}
                onChange={event => setDeleteName(event.target.value)}
                placeholder="Enter product name"
              />
            </label>

            {deleteError && (
              <p className="skpm-delete-error" role="alert">
                {deleteError}
              </p>
            )}

            <div className="skpm-delete-actions">
              <button type="button" onClick={closeDelete} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="skpm-delete-confirm"
                disabled={deleting || deleteName.trim() !== deleteTarget.name}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
