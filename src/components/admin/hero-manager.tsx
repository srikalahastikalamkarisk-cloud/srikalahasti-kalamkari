"use client";

import { prepareImageUpload, isSupportedImageFile } from "@/lib/admin/browser-image-optimizer";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, Image as ImageIcon, Link2, Plus, Replace, Trash2, Video } from "lucide-react";
import { heroMediaUrl } from "@/lib/hero-media-url";
import { detectVideoUrlType, embedUrl, externalSourceError, removeHeroMediaField } from "@/lib/hero-media";
import "./hero-manager.css";

type Slide = {
  id: string;
  enabled: boolean;
  sortOrder: number;
  mediaType: string;
  desktopImage: string;
  mobileImage: string;
  desktopVideo?: string | null;
  mobileVideo?: string | null;
  videoUrl?: string | null;
  desktopSourceUrl?: string | null;
  mobileSourceUrl?: string | null;
  posterImage?: string | null;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  duration: number;
  videoFallbackMs: number;
  soundControlsEnabled: boolean;
  initialMuted: boolean;
  transitionMs: number;
  animation: string;
  textPosition: string;
  overlayOpacity: number;
};

const emptySlide = {
  enabled: true,
  mediaType: "image",
  desktopImage: "",
  mobileImage: "",
  desktopVideo: "",
  mobileVideo: "",
  videoUrl: "",
  desktopSourceUrl: "",
  mobileSourceUrl: "",
  posterImage: "",
  eyebrow: "",
  title: "",
  highlight: "",
  description: "",
  primaryLabel: "",
  primaryHref: "",
  secondaryLabel: "",
  secondaryHref: "",
  duration: 5000,
  videoFallbackMs: 30000,
  soundControlsEnabled: true,
  initialMuted: true,
  transitionMs: 1100,
  animation: "fade",
  textPosition: "left",
  overlayOpacity: 0.48,
};

type ImageField = "desktopImage" | "mobileImage" | "posterImage";
type VideoField = "desktopVideo" | "mobileVideo";
const externalTypes = ["youtube", "instagram", "pinterest", "direct"] as const;

export default function HeroManager() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const dragIndex = useRef<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptySlide });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<"desktopImage" | "mobileImage" | "posterImage">("desktopImage");
  const [mediaAssets, setMediaAssets] = useState<{ id: string; filename: string; storageKey: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mediaNames, setMediaNames] = useState<Partial<Record<ImageField | VideoField, string>>>({});
  const imageInputs = useRef<Partial<Record<ImageField, HTMLInputElement | null>>>({});
  const videoInputs = useRef<Partial<Record<VideoField, HTMLInputElement | null>>>({});
  const urlInputs = useRef<Partial<Record<"desktopSourceUrl" | "mobileSourceUrl", HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hero", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load slides");
      setSlides(data.slides);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // HERO_MEDIA_PICKER_V1
  async function openMedia(target: "desktopImage" | "mobileImage" | "posterImage") {
    setMediaTarget(target);
    setMediaOpen(true);
    setMediaLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/media", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Unable to load media");

      setMediaAssets(data.assets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Media loading failed");
    } finally {
      setMediaLoading(false);
    }
  }

  function chooseMedia(asset: { storageKey: string; filename?: string }) {
    const url = heroMediaUrl(asset.storageKey);
    setForm(prev => ({ ...prev, [mediaTarget]: url }));
    if (asset.filename) setMediaNames(prev => ({ ...prev, [mediaTarget]: asset.filename }));
    setMediaOpen(false);
  }

  function setVideoUrl(target: "desktopSourceUrl" | "mobileSourceUrl", value: string) {
    setForm(prev => {
      const detected = target === "desktopSourceUrl" ? detectVideoUrlType(value) : null;
      return {
        ...prev,
        [target]: value,
        ...(target === "desktopSourceUrl" && detected ? { mediaType: detected } : {}),
        ...(target === "desktopSourceUrl" ? { videoUrl: "" } : {}),
      };
    });
  }

  function removeMedia(target: ImageField | VideoField | "desktopSourceUrl" | "mobileSourceUrl") {
    setForm(prev => removeHeroMediaField(prev, target));
    if (target !== "desktopSourceUrl" && target !== "mobileSourceUrl") setMediaNames(prev => ({ ...prev, [target]: undefined }));
    setNotice("Media removed from this slide. Save the slide to apply the change; the file remains in Media Library.");
    setError("");
  }

  // HERO_IMAGE_UPLOAD_V1
  async function uploadImage(
    event: React.ChangeEvent<HTMLInputElement>,
    target: "desktopImage" | "mobileImage" | "posterImage"
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isSupportedImageFile(file)) {
      setError("Only JPG, PNG and WebP images are allowed.");
      return;
    }


    setUploading(true);
    setError("");

    try {
      const data = new FormData();
      data.append("file", await prepareImageUpload(file, "hero"));

      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: data,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Image upload failed");
      }

      if (!result.asset?.storageKey) {
        throw new Error("Uploaded image path missing");
      }

      const url = heroMediaUrl(result.asset.storageKey);

      setForm(prev => ({ ...prev, [target]: url }));
      setMediaNames(prev => ({ ...prev, [target]: result.asset.filename || file.name }));
      setNotice("Image uploaded successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // HERO_VIDEO_UPLOAD_V1
  async function uploadVideo(
    event: React.ChangeEvent<HTMLInputElement>,
    target: "desktopVideo" | "mobileVideo"
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!/\.(mp4|mov|avi|mkv|webm|m4v|mpeg|mpg|3gp|wmv)$/i.test(file.name)) {
      setError("Choose a supported video file.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("Maximum video size is 50 MB.");
      return;
    }

    setVideoUploading(true);
    setError("");

    try {
      const data = new FormData();
      data.append("file", file);
      data.set("target", target);

      const res = await fetch("/api/admin/hero/upload-video", {
        method: "POST",
        body: data,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Video upload failed");
      }

      if (!result.url) {
        throw new Error("Uploaded video URL missing");
      }

      setForm(prev => ({
        ...prev,
        mediaType: "video",
        [target]: result.url,
        posterImage: prev.posterImage || result.posterUrl || "",
      }));
      setMediaNames(prev => ({ ...prev, [target]: file.name }));

      setNotice("Video uploaded successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      setVideoUploading(false);
    }
  }

  function edit(slide: Slide) {
    setEditing(slide.id);
    setMediaNames({});
    setForm({
      enabled: slide.enabled,
      mediaType: slide.mediaType,
      desktopImage: slide.desktopImage,
      mobileImage: slide.mobileImage,
      desktopVideo: slide.desktopVideo ?? "",
      mobileVideo: slide.mobileVideo ?? "",
      videoUrl: slide.videoUrl ?? "",
      desktopSourceUrl: slide.desktopSourceUrl || (externalTypes.includes(slide.mediaType as typeof externalTypes[number]) ? slide.videoUrl : "") || "",
      mobileSourceUrl: slide.mobileSourceUrl ?? "",
      posterImage: slide.posterImage ?? "",
      eyebrow: slide.eyebrow,
      title: slide.title,
      highlight: slide.highlight,
      description: slide.description,
      primaryLabel: slide.primaryLabel,
      primaryHref: slide.primaryHref,
      secondaryLabel: slide.secondaryLabel,
      secondaryHref: slide.secondaryHref,
      duration: slide.duration,
      videoFallbackMs: slide.videoFallbackMs,
      soundControlsEnabled: slide.soundControlsEnabled,
      initialMuted: slide.initialMuted,
      transitionMs: slide.transitionMs,
      animation: slide.animation,
      textPosition: slide.textPosition,
      overlayOpacity: slide.overlayOpacity,
    });
    setNotice("");
  }

  function add() {
    setEditing("new");
    setMediaNames({});
    setForm({ ...emptySlide });
    setNotice("");
  }

  async function save() {
    if (!form.title.trim()) {
      setError("Slide title is required.");
      return;
    }
    if (["youtube", "instagram", "pinterest", "direct"].includes(form.mediaType)) {
      const mediaType = form.mediaType as "youtube" | "instagram" | "pinterest" | "direct";
      const desktopError = externalSourceError(mediaType, form.desktopSourceUrl, true);
      const mobileError = form.mobileSourceUrl ? externalSourceError(mediaType, form.mobileSourceUrl) : null;
      const mobileType = form.mobileSourceUrl ? detectVideoUrlType(form.mobileSourceUrl) : null;
      if (desktopError || mobileError || (mobileType && mobileType !== mediaType)) {
        setError(desktopError || mobileError || "Desktop and mobile video links must use the same platform.");
        return;
      }
    }
    if (form.mediaType === "image" && !form.desktopImage) {
      setError("Choose a desktop image before saving.");
      return;
    }
    if (form.mediaType === "video" && !form.desktopVideo && !form.videoUrl) {
      setError("Upload a desktop video before saving.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(
        isNew ? "/api/admin/hero" : `/api/admin/hero/${editing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setEditing(null);
      setNotice("Slide saved successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(slide: Slide) {
    setError("");
    try {
      const res = await fetch(`/api/admin/hero/${slide.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !slide.enabled }),
      });
      if (!res.ok) throw new Error("Unable to change slide status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(slide: Slide) {
    if (!window.confirm(`Permanently delete "${slide.title}"?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/hero/${slide.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Unable to delete slide");
      setNotice("Slide deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // HERO_DRAG_DROP_V1
  async function dropOn(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;

    if (from === null || from === target || reordering) return;

    const reordered = [...slides];
    const [item] = reordered.splice(from, 1);
    reordered.splice(target, 0, item);

    setReordering(true);
    setError("");

    try {
      const res = await fetch("/api/admin/hero/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map(s => s.id) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unable to reorder slides");
      }

      setSlides(reordered);
      setNotice("Slide order updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
      await load();
    } finally {
      setReordering(false);
    }
  }

  async function move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;

    const reordered = [...slides];
    [reordered[index], reordered[target]] =
      [reordered[target], reordered[index]];

    setError("");
    try {
      const res = await fetch("/api/admin/hero/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map(s => s.id) }),
      });
      if (!res.ok) throw new Error("Unable to reorder slides");
      setSlides(reordered);
      setNotice("Slide order updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  const field = (
    key: keyof typeof emptySlide,
    label: string,
    type = "text"
  ) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span>{label}</span>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(prev => ({
          ...prev,
          [key]: type === "number" ? Number(e.target.value) : e.target.value,
        }))}
        style={{ padding: 12, border: "1px solid var(--skad-border)", borderRadius: 8 }}
      />
    </label>
  );

  function mediaFilename(key: ImageField | VideoField, value: string) {
    if (mediaNames[key]) return mediaNames[key];
    try { return decodeURIComponent(value.split("/").pop() || "Selected media"); }
    catch { return "Selected media"; }
  }

  return (
    <section className="hero-manager" style={{ padding: 24, maxWidth: 1250, margin: "auto" }}>
      <header className="hero-manager__header" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>Hero Slider</h1>
          <p>Choose the images, films and stories visitors see first.</p>
        </div>
        <button
          type="button"
          onClick={add}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "var(--skad-primary-button)",
            color: "var(--skad-button-text)",
            border: "1px solid var(--skad-border)",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 12px color-mix(in srgb, var(--skad-primary) 18%, transparent)"
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add Slide
        </button>
      </header>

      {error && <p role="alert" style={{ color: "var(--skad-error)" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "var(--skad-success)" }}>{notice}</p>}
      {loading && <p>Loading slides...</p>}

      {!loading && slides.length === 0 && (
        <div className="hero-manager__empty">
          <strong>Your homepage feature is ready for its first slide.</strong>
          <span>Start with a desktop image or choose one of the supported video sources.</span>
          <button type="button" onClick={add}>Add your first slide</button>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
        {slides.map((slide, index) => (
          <article
            key={slide.id}
            className="hero-manager__slide-card"
            draggable={!reordering}
            onDragStart={e => {
              dragIndex.current = index;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", slide.id);
            }}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={e => {
              e.preventDefault();
              void dropOn(index);
            }}
            onDragEnd={() => { dragIndex.current = null; }}
            style={{
              border: "1px solid var(--skad-border)",
              borderRadius: 12,
              padding: 18,
              cursor: reordering ? "wait" : "grab",
              opacity: reordering ? 0.7 : 1
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              {(slide.desktopImage || slide.posterImage) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slide.posterImage || slide.desktopImage} alt="" style={{ width: 150, height: 90, objectFit: "cover", borderRadius: 8 }} />
              )}
              {!slide.desktopImage && !slide.posterImage && <span className="hero-manager__type-icon" aria-hidden="true"><Film size={25} /></span>}
              <div style={{ flex: 1 }}>
                <strong>{slide.title}</strong>
                <p>{slide.enabled ? "Active" : "Disabled"} · {slide.mediaType} · {slide.mediaType === "image" ? `${slide.duration} ms` : `up to ${slide.videoFallbackMs / 1000} sec`}</p>
              </div>
              <button type="button" onClick={() => void move(index, -1)} disabled={index === 0} aria-label={`Move ${slide.title} up`}><ArrowUp size={17} /></button>
              <button type="button" onClick={() => void move(index, 1)} disabled={index === slides.length - 1} aria-label={`Move ${slide.title} down`}><ArrowDown size={17} /></button>
              <button type="button" onClick={() => void toggle(slide)}>{slide.enabled ? "Disable" : "Enable"}</button>
              <button type="button" onClick={() => edit(slide)}>Edit</button>
              <button type="button" onClick={() => void remove(slide)}>Delete</button>
            </div>
          </article>
        ))}
      </div>

      {mediaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Media Library"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.65)",
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 20
          }}
        >
          <div style={{
            background: "var(--sk-theme-card)",
            color: "var(--skad-ink)",
            padding: 24,
            borderRadius: 14,
            width: "min(900px,100%)",
            maxHeight: "85vh",
            overflowY: "auto"
          }}>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ fontSize: 22 }}>Choose Image</h2>
              <button type="button" onClick={() => setMediaOpen(false)}>Close</button>
            </header>

            {mediaLoading && <p>Loading media...</p>}
            {!mediaLoading && mediaAssets.length === 0 && <p>No images found.</p>}

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))",
              gap: 14,
              marginTop: 20
            }}>
              {mediaAssets.map(asset => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => chooseMedia(asset)}
                  style={{ border: "1px solid var(--skad-border)", padding: 8, borderRadius: 10 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroMediaUrl(asset.storageKey)}
                    alt={asset.filename}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
                  />
                  <span style={{ display: "block", fontSize: 12, overflowWrap: "anywhere" }}>
                    {asset.filename}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="hero-manager__editor" style={{ marginTop: 28, padding: 24, border: "1px solid var(--skad-border)", borderRadius: 12 }}>
          {/* HERO_VIDEO_CONTROLS_V1 */}
          <div style={{
            marginTop: 22,
            padding: 20,
            border: "1px solid var(--skad-border)",
            borderRadius: 12,
            display: "grid",
            gap: 16
          }}>
            <h3 className="hero-manager__section-title">1 · Media type</h3>
            <div className="hero-manager__type-grid" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12
            }}>
              {([
                ["image", "Image", "Use desktop and mobile images", <ImageIcon size={20} key="image-icon" />],
                ["video", "Uploaded Video", "Upload optimized MP4 files", <Video size={20} key="video-icon" />],
                ["url", "Video URL", "YouTube, Instagram, Pinterest, MP4 or WebM", <Link2 size={20} key="url-icon" />],
              ] as const).map(([type, title, description, icon]) => {
                const selected = type === "url" ? externalTypes.includes(form.mediaType as typeof externalTypes[number]) : form.mediaType === type;
                const onSelect = () => setForm(prev => ({
                  ...prev,
                  mediaType: type === "url" ? (externalTypes.includes(prev.mediaType as typeof externalTypes[number]) ? prev.mediaType : "direct") : type,
                }));
                return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  onClick={onSelect}
                  className={selected ? "is-selected" : ""}
                  style={{
                    display: "grid",
                    justifyItems: "start",
                    gap: 8,
                    padding: 18,
                    textAlign: "left",
                    borderRadius: 12,
                    border: "1px solid var(--skad-border)",
                    background: "var(--sk-theme-color-surface)",
                    color: "var(--skad-ink)",
                    cursor: "pointer",
                    minHeight: 125
                  }}
                >
                  <span aria-hidden="true" className="hero-manager__type-icon">{icon}</span>
                  <strong style={{ fontSize: 15 }}>{title}</strong>
                  <span style={{ fontSize: 12, color: "var(--skad-muted)" }}>
                    {description}
                  </span>
                </button>
              );})}
            </div>

            {form.mediaType === "image" && <>
              <h4 className="hero-manager__section-title">2 · Desktop and mobile images</h4>
              {uploading && <p role="status">Uploading image to persistent media storage…</p>}
              <div className="hero-manager__asset-grid">
                {([ ["desktopImage", "Desktop image"], ["mobileImage", "Mobile image"] ] as const).map(([target, label]) => (
                  <article className="hero-manager__asset-card" key={target}>
                    <strong>{label}</strong>
                    <div className="hero-manager__asset-preview">
                      {form[target] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form[target]} alt={`${label} preview`} />
                      ) : <span>Choose an image</span>}
                    </div>
                    <span className="hero-manager__filename">{form[target] ? mediaFilename(target, form[target]) : "No image selected"}</span>
                    <div className="hero-manager__asset-actions">
                      <button type="button" onClick={() => imageInputs.current[target]?.click()}><Replace size={15} />Replace</button>
                      <button type="button" onClick={() => void openMedia(target)}>Media Library</button>
                      {form[target] && <button type="button" className="is-remove" onClick={() => removeMedia(target)}><Trash2 size={15} />Remove</button>}
                    </div>
                    <input ref={node => { imageInputs.current[target] = node; }} className="hero-manager__hidden-input" type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif" disabled={uploading} onChange={event => void uploadImage(event, target)} aria-label={`Replace ${label}`} />
                  </article>
                ))}
              </div>
              {!form.desktopImage && <p className="hero-manager__field-error">A desktop image is required before saving.</p>}
            </>}

            {form.mediaType === "video" && <>
              <h4 className="hero-manager__section-title">2 · Desktop and mobile videos</h4>
              {videoUploading && <p role="status">Uploading video to persistent media storage…</p>}
              <div className="hero-manager__asset-grid">
                {([ ["desktopVideo", "Desktop video"], ["mobileVideo", "Mobile video"] ] as const).map(([target, label]) => (
                  <article className="hero-manager__asset-card" key={target}>
                    <strong>{label}</strong>
                    <div className="hero-manager__asset-preview is-video">
                      {form[target] ? <video src={form[target]} poster={form.posterImage || undefined} controls muted playsInline preload="metadata" /> : <span>Choose an optimized MP4 video</span>}
                    </div>
                    <span className="hero-manager__filename">{form[target] ? mediaFilename(target, form[target]) : "No video selected"}</span>
                    <div className="hero-manager__asset-actions">
                      <button type="button" onClick={() => videoInputs.current[target]?.click()}><Replace size={15} />Replace</button>
                      {form[target] && <button type="button" className="is-remove" onClick={() => removeMedia(target)}><Trash2 size={15} />Remove</button>}
                    </div>
                    <input ref={node => { videoInputs.current[target] = node; }} className="hero-manager__hidden-input" type="file" accept="video/mp4,.mp4" disabled={videoUploading} onChange={event => void uploadVideo(event, target)} aria-label={`Replace ${label}`} />
                  </article>
                ))}
              </div>
              {!form.desktopVideo && !form.videoUrl && <p className="hero-manager__field-error">A desktop video is required before saving.</p>}
            </>}

            {externalTypes.includes(form.mediaType as typeof externalTypes[number]) && (
              <div className="hero-manager__source-fields">
                <h4 className="hero-manager__section-title">2 · Video URL</h4>
                <p>Paste a YouTube, Instagram, Pinterest or direct MP4/WebM link. The platform is detected automatically. Mobile can use its own link or reuse desktop.</p>
                {([ ["desktopSourceUrl", "Desktop Video URL"], ["mobileSourceUrl", "Mobile Video URL (optional)"] ] as const).map(([target, label]) => {
                  const value = form[target];
                  const detected = detectVideoUrlType(value);
                  const validation = value ? (detected ? externalSourceError(detected, value) : "Use a supported YouTube, Instagram, Pinterest Pin, or direct MP4/WebM URL.") : null;
                  const missingRequiredUrl = target === "desktopSourceUrl" && !value;
                  const platformMismatch = target === "mobileSourceUrl" && detected && detected !== form.mediaType;
                  const previewType = detected || form.mediaType as typeof externalTypes[number];
                  const embed = value && !validation && !platformMismatch && previewType !== "direct" ? embedUrl(previewType, value, typeof window === "undefined" ? "" : window.location.origin, false) : null;
                  return <article className="hero-manager__url-card" key={target}>
                    <label>{label}<input ref={node => { urlInputs.current[target] = node; }} type="url" value={value} placeholder="Paste link (https://…)" onChange={event => setVideoUrl(target, event.target.value)} aria-invalid={Boolean(validation || platformMismatch || missingRequiredUrl)} /></label>
                    <span className="hero-manager__filename">{detected ? `Detected: ${detected === "direct" ? "Direct MP4/WebM" : detected}` : value ? "Platform not recognized" : "No URL added"}</span>
                    {missingRequiredUrl && <span className="hero-manager__field-error">A desktop video URL is required.</span>}
                    {(validation || platformMismatch) && <span className="hero-manager__field-error">{validation || "Mobile video must use the same platform type as the desktop URL."}</span>}
                    {value && !validation && (previewType === "direct" ? <video className="hero-manager__url-preview" src={value} poster={form.posterImage || undefined} controls muted playsInline preload="metadata" /> : embed ? <iframe className="hero-manager__url-preview" src={embed} title={`${label} preview`} loading="lazy" allow="encrypted-media; picture-in-picture" /> : null)}
                    <div className="hero-manager__asset-actions">
                      <button type="button" onClick={() => { urlInputs.current[target]?.focus(); urlInputs.current[target]?.select(); }}><Replace size={15} />Replace URL</button>
                      {value && <button type="button" className="is-remove" onClick={() => removeMedia(target)}><Trash2 size={15} />Remove URL</button>}
                    </div>
                  </article>;
                })}
                <p>Official embeds respect platform restrictions. Instagram and Pinterest may not autoplay or report playback completion; the poster and configured maximum wait are used. Direct URLs play in the browser.</p>
              </div>
            )}

            {form.mediaType !== "image" && (
              <div style={{ display: "grid", gap: 14 }}>
                <article className="hero-manager__asset-card hero-manager__poster-card">
                  <strong>Poster image (optional)</strong>
                  <div className="hero-manager__asset-preview">{form.posterImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.posterImage} alt="Video poster preview" />
                  ) : <span>Optional image shown while video is unavailable</span>}</div>
                  {form.posterImage && <span className="hero-manager__filename">{mediaFilename("posterImage", form.posterImage)}</span>}
                  <div className="hero-manager__asset-actions">
                    <button type="button" onClick={() => imageInputs.current.posterImage?.click()}><Replace size={15} />Replace</button>
                    <button type="button" onClick={() => void openMedia("posterImage")}>Media Library</button>
                    {form.posterImage && <button type="button" className="is-remove" onClick={() => removeMedia("posterImage")}><Trash2 size={15} />Remove</button>}
                  </div>
                  <input ref={node => { imageInputs.current.posterImage = node; }} className="hero-manager__hidden-input" type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif" disabled={uploading} onChange={event => void uploadImage(event, "posterImage")} aria-label="Replace poster image" />
                </article>
              </div>
            )}
          </div>

          <h3 className="hero-manager__section-title">C · Slide content</h3>
          <div className="hero-manager__content-grid">
            {field("title", "Title")}
            {field("highlight", "Highlighted text")}
            {field("eyebrow", "Eyebrow (optional)")}
            {field("primaryLabel", "Primary button label")}
            {field("primaryHref", "Primary button link")}
            {field("secondaryLabel", "Secondary button label (optional)")}
            {field("secondaryHref", "Secondary button link")}
          </div>
          <label className="hero-manager__description-field">
            Description
            <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} rows={4} />
          </label>

          <details className="hero-manager__advanced">
            <summary>D · Advanced settings</summary>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 16,
            marginTop: 20
          }}>
            <label style={{ display: "grid", gap: 6 }}>
              Animation
              <select
                value={form.animation}
                onChange={e => setForm(p => ({ ...p, animation: e.target.value }))}
              >
                <option value="fade">Fade</option>
                <option value="zoom">Zoom</option>
                <option value="slide">Slide</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Text Position
              <select
                value={form.textPosition}
                onChange={e => setForm(p => ({ ...p, textPosition: e.target.value }))}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Overlay Opacity: {Math.round(form.overlayOpacity * 100)}%
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={form.overlayOpacity}
                onChange={e => setForm(p => ({
                  ...p,
                  overlayOpacity: Number(e.target.value)
                }))}
              />
            </label>

            {form.mediaType === "image" ? (
              <label style={{ display: "grid", gap: 6 }}>Image duration: {form.duration} ms
                <input type="range" min="1000" max="30000" step="500" value={form.duration} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} />
              </label>
            ) : (
              <label style={{ display: "grid", gap: 6 }}>Maximum video wait: {Math.round(form.videoFallbackMs / 1000)} sec
                <input type="range" min="5000" max="120000" step="5000" value={form.videoFallbackMs} onChange={e => setForm(p => ({ ...p, videoFallbackMs: Number(e.target.value) }))} />
              </label>
            )}

            <label className="hero-manager__check"><input type="checkbox" checked={form.soundControlsEnabled} disabled={["instagram", "pinterest"].includes(form.mediaType)} onChange={e => setForm(p => ({ ...p, soundControlsEnabled: e.target.checked }))} /> Allow visitors to control video sound</label>
            {["instagram", "pinterest"].includes(form.mediaType) && <p className="hero-manager__note">Audio for Instagram and Pinterest embeds is controlled by the platform player.</p>}
            <label className="hero-manager__check"><input type="checkbox" checked={form.initialMuted} onChange={e => setForm(p => ({ ...p, initialMuted: e.target.checked }))} /> Start muted (recommended for autoplay)</label>
          </div>
          <label className="hero-manager__advanced-field">Transition duration
            <input type="number" min="100" max="5000" value={form.transitionMs} onChange={e => setForm(p => ({ ...p, transitionMs: Number(e.target.value) }))} />
          </label>
          </details>

          {form.mediaType === "image" && <div className="hero-manager__preview-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 16,
            marginTop: 20
          }}>
            {(["desktopImage", "mobileImage"] as const).map(key => (
              <div key={key}>
                <strong>{key === "desktopImage" ? "Desktop Preview" : "Mobile Preview"}</strong>
                <div style={{
                  marginTop: 10,
                  background: "var(--skad-primary)",
                  borderRadius: 12,
                  overflow: "hidden",
                  aspectRatio: key === "desktopImage" ? "16 / 9" : "9 / 16",
                  maxHeight: 320
                }}>
                  {form[key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form[key]}
                      alt={key === "desktopImage" ? "Desktop preview" : "Mobile preview"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      display: "grid",
                      placeItems: "center",
                      height: "100%",
                      color: "var(--skad-on-dark)"
                    }}>
                      No image selected
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>}

          <div className="hero-manager__actions">
            <button type="button" disabled={saving || uploading || videoUploading} onClick={() => void save()}>{saving ? "Saving…" : "Save slide"}</button>
            <button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
