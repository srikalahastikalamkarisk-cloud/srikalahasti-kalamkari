"use client";

import { prepareImageUpload, isSupportedImageFile } from "@/lib/admin/browser-image-optimizer";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Check, LibraryBig, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { defaultAboutImageUrl, isSafeAboutButtonHref, type AboutKalamkariContent } from "@/lib/about-kalamkari-content";
import { heroMediaUrl } from "@/lib/hero-media-url";
import "./about-kalamkari-editor.css";

type Category = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean };
type MediaAsset = { id: string; filename: string; storageKey: string; mimeType: string };

export default function AboutKalamkariEditor() {
  const [form, setForm] = useState<AboutKalamkariContent | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [configured, setConfigured] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const dirty = useMemo(() => form !== null && JSON.stringify(form) !== initialSnapshot, [form, initialSnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [aboutResponse, categoryResponse] = await Promise.all([
          fetch("/api/admin/about-kalamkari", { cache: "no-store", signal: controller.signal }),
          fetch("/api/admin/categories", { cache: "no-store", signal: controller.signal }),
        ]);
        const aboutData = await aboutResponse.json();
        const categoryData = await categoryResponse.json();
        if (!aboutResponse.ok) throw new Error(aboutData.error || "Unable to load About settings.");
        if (!categoryResponse.ok) throw new Error(categoryData.error || "Unable to load categories.");
        const activeCategories = (categoryData.categories as Category[]).filter(category => category.isActive && !category.parentId);
        const activeCategoryIds = new Set(activeCategories.map(category => category.id));
        const nextForm = {
          ...(aboutData.content as AboutKalamkariContent),
          categoryIds: (aboutData.content as AboutKalamkariContent).categoryIds.filter(id => activeCategoryIds.has(id)),
        };
        setForm(nextForm);
        setInitialSnapshot(JSON.stringify(nextForm));
        setConfigured(Boolean(aboutData.configured));
        setMigrationRequired(Boolean(aboutData.migrationRequired));
        setCategories(activeCategories);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load About settings.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!libraryOpen) return;
    const dialog = document.querySelector<HTMLElement>(".about-editor__modal");
    const focusable = () => dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? [];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLibraryOpen(false);
      } else if (event.key === "Tab") {
        const nodes = [...focusable()];
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [libraryOpen]);

  function update<K extends keyof AboutKalamkariContent>(key: K, value: AboutKalamkariContent[K]) {
    setForm(current => current ? { ...current, [key]: value } : current);
    setNotice("");
  }

  function toggleCategory(id: string) {
    if (!form) return;
    const next = form.categoryIds.includes(id)
      ? form.categoryIds.filter(categoryId => categoryId !== id)
      : [...form.categoryIds, id];
    update("categoryIds", next);
  }

  function moveCategory(index: number, direction: -1 | 1) {
    if (!form) return;
    const target = index + direction;
    if (target < 0 || target >= form.categoryIds.length) return;
    const categoryIds = [...form.categoryIds];
    [categoryIds[index], categoryIds[target]] = [categoryIds[target], categoryIds[index]];
    update("categoryIds", categoryIds);
  }

  async function uploadImage(file?: File) {
    if (!file || !form) return;
    if (!isSupportedImageFile(file)) {
      setError("Choose a JPG, PNG, WebP, BMP, TIFF or AVIF image.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("file", await prepareImageUpload(file, "gallery"));
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image upload failed.");
      update("imageUrl", heroMediaUrl(data.asset.storageKey));
      setNotice("Image uploaded to Media Library. Save Changes to apply it to the homepage.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function openLibrary() {
    setLibraryOpen(true);
    setLibraryLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/media", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to open Media Library.");
      setAssets((data.assets as MediaAsset[]).filter(asset => asset.mimeType.startsWith("image/")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open Media Library.");
    } finally {
      setLibraryLoading(false);
    }
  }

  async function save() {
    if (!form || saving) return;
    if (!isSafeAboutButtonHref(form.buttonHref)) {
      setError("Enter a safe internal destination beginning with /.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/about-kalamkari", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save About settings.");
      const saved = data.content as AboutKalamkariContent;
      setForm(saved);
      setInitialSnapshot(JSON.stringify(saved));
      setConfigured(true);
      setNotice("About Kalamkari changes saved and published to the homepage.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save About settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="about-editor"><p role="status">Loading About Kalamkari settings…</p></main>;
  if (!form) return <main className="about-editor"><p className="about-editor__alert" role="alert">{error || "About settings could not be loaded."}</p></main>;

  const selected = form.categoryIds.flatMap(id => {
    const category = categories.find(item => item.id === id);
    return category ? [{ id, name: category.name }] : [];
  });

  return (
    <main className="about-editor">
      <header className="about-editor__header">
        <div><span className="about-editor__eyebrow">HOMEPAGE CONTENT</span><h1>About Kalamkari</h1><p>Edit the heritage story shown on your homepage.</p></div>
        <span className={`about-editor__save-state ${dirty ? "is-dirty" : ""}`} role="status">{dirty ? "Unsaved changes" : configured ? "Changes saved" : "Using starter content"}</span>
      </header>

      {migrationRequired && <div className="about-editor__migration" role="status">The About content table is not available yet. You can prepare edits here, but saving requires the pending About migration to be applied.</div>}
      {error && <p className="about-editor__alert" role="alert">{error}</p>}
      {notice && <p className="about-editor__notice" role="status"><Check size={16} />{notice}</p>}

      <section className="about-editor__card" aria-labelledby="about-image-title">
        <div className="about-editor__card-heading"><div><span className="about-editor__step">01</span><h2 id="about-image-title">Heritage image</h2></div><p>Choose a library image or upload a new one.</p></div>
        <div className="about-editor__image-layout">
          <div className="about-editor__image-frame">
            <Image src={form.imageUrl || defaultAboutImageUrl} alt={form.imageAlt || "About section preview"} width={500} height={640} unoptimized />
          </div>
          <div className="about-editor__image-controls">
            <label className="about-editor__upload">
              <Upload size={17} />{uploading ? "Uploading…" : "Upload image"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif" disabled={uploading} onChange={event => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
            <button type="button" className="about-editor__secondary" onClick={() => void openLibrary()}><LibraryBig size={17} />Choose from Media Library</button>
            <button type="button" className="about-editor__text-button" onClick={() => update("imageUrl", null)}><RotateCcw size={15} />Restore original image</button>
            <p>The original arch-shaped display is preserved. Removing this image from About does not delete it from Media Library.</p>
          </div>
        </div>
      </section>

      <section className="about-editor__card" aria-labelledby="about-copy-title">
        <div className="about-editor__card-heading"><div><span className="about-editor__step">02</span><h2 id="about-copy-title">Story and image details</h2></div><p>Keep the story clear and concise.</p></div>
        <div className="about-editor__field-grid">
          <label>Eyebrow / small subtitle<input maxLength={120} value={form.eyebrow} onChange={event => update("eyebrow", event.target.value)} /></label>
          <label>Main heading<input maxLength={160} value={form.heading} onChange={event => update("heading", event.target.value)} /></label>
          <label className="is-wide">Description paragraph 1<textarea maxLength={2400} rows={4} value={form.descriptionOne} onChange={event => update("descriptionOne", event.target.value)} /><small>{form.descriptionOne.length}/2400</small></label>
          <label className="is-wide">Description paragraph 2<textarea maxLength={2400} rows={4} value={form.descriptionTwo} onChange={event => update("descriptionTwo", event.target.value)} /><small>{form.descriptionTwo.length}/2400</small></label>
          <label>Image alt text<input maxLength={250} value={form.imageAlt} onChange={event => update("imageAlt", event.target.value)} /></label>
          <label>Image caption<input maxLength={250} value={form.imageCaption} onChange={event => update("imageCaption", event.target.value)} /></label>
        </div>
      </section>

      <section className="about-editor__card" aria-labelledby="about-categories-title">
        <div className="about-editor__card-heading"><div><span className="about-editor__step">03</span><h2 id="about-categories-title">Category links</h2></div><p>Choose and order active main categories.</p></div>
        {categories.length === 0 ? <p className="about-editor__empty">No active main categories are available.</p> : <div className="about-editor__category-columns">
          <fieldset><legend>Available categories</legend>{categories.map(category => <label className="about-editor__check" key={category.id}><input type="checkbox" checked={form.categoryIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />{category.name}</label>)}</fieldset>
          <div className="about-editor__order"><h3>Display order</h3>{selected.length === 0 && <p>No categories selected. Save to intentionally hide these links.</p>}{selected.map((category, index) => <div className="about-editor__order-row" key={category.id}><span>{category.name}</span><button type="button" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => moveCategory(index, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Move ${category.name} down`} disabled={index === selected.length - 1} onClick={() => moveCategory(index, 1)}><ArrowDown size={16} /></button><button type="button" aria-label={`Remove ${category.name}`} onClick={() => toggleCategory(category.id)}><Trash2 size={15} /></button></div>)}</div>
        </div>}
      </section>

      <section className="about-editor__card" aria-labelledby="about-button-title">
        <div className="about-editor__card-heading"><div><span className="about-editor__step">04</span><h2 id="about-button-title">Story button</h2></div><p>Link visitors to your story page.</p></div>
        <div className="about-editor__field-grid about-editor__button-fields">
          <label>Button text<input maxLength={100} value={form.buttonText} onChange={event => update("buttonText", event.target.value)} /></label>
          <label>Button destination<input maxLength={500} value={form.buttonHref} onChange={event => update("buttonHref", event.target.value)} aria-invalid={!isSafeAboutButtonHref(form.buttonHref)} /><small>Use an internal path such as /about.</small></label>
        </div>
      </section>

      <footer className="about-editor__footer">
        <span>{dirty ? "Your changes are not published yet." : "Homepage content is up to date."}</span>
        <button type="button" className="about-editor__save" disabled={!dirty || saving || migrationRequired} onClick={() => void save()}><Save size={17} />{saving ? "Saving…" : "Save Changes"}</button>
      </footer>

      {libraryOpen && <div className="about-editor__modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLibraryOpen(false); }}>
        <section className="about-editor__modal" role="dialog" aria-modal="true" aria-labelledby="about-library-title">
          <header><div><h2 id="about-library-title">Choose from Media Library</h2><p>Select an image already stored for the website.</p></div><button type="button" aria-label="Close media library" onClick={() => setLibraryOpen(false)}><X size={20} /></button></header>
          {libraryLoading ? <p role="status">Loading images…</p> : assets.length ? <div className="about-editor__asset-grid">{assets.map(asset => <button type="button" key={asset.id} onClick={() => { update("imageUrl", heroMediaUrl(asset.storageKey)); setLibraryOpen(false); }}><Image src={heroMediaUrl(asset.storageKey)} alt="" width={300} height={300} unoptimized /><span>{asset.filename}</span></button>)}</div> : <p className="about-editor__empty">No images are available in Media Library.</p>}
        </section>
      </div>}
    </main>
  );
}
