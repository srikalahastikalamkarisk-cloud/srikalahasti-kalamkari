"use client";

import { prepareImageUpload } from "@/lib/admin/browser-image-optimizer";

import "./customer-content-actions.css";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, ImagePlus, Save, Trash2, X } from "lucide-react";

type Photo = {
  id: string;
  imageUrl: string;
  caption: string | null;
  altText: string | null;
  isApproved: boolean;
  sortOrder: number;
};

type Asset = {
  id: string;
  filename: string;
  storageKey: string;
};

type FormState = {
  imageUrl: string;
  caption: string;
  altText: string;
  sortOrder: number;
  isApproved: boolean;
};

const emptyForm: FormState = {
  imageUrl: "",
  caption: "",
  altText: "",
  sortOrder: 0,
  isApproved: false,
};

export default function CustomerGalleryManager() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [galleryResponse, mediaResponse] = await Promise.all([
        fetch("/api/admin/customer-gallery"),
        fetch("/api/admin/media"),
      ]);

      if (!galleryResponse.ok || !mediaResponse.ok) {
        throw new Error("Unable to load gallery or media library.");
      }

      const galleryData = await galleryResponse.json();
      const mediaData = await mediaResponse.json();

      setPhotos(galleryData.photos ?? []);
      setAssets(mediaData.assets ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load gallery.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(photo: Photo) {
    setEditingId(photo.id);
    setForm({
      imageUrl: photo.imageUrl,
      caption: photo.caption ?? "",
      altText: photo.altText ?? "",
      sortOrder: photo.sortOrder,
      isApproved: photo.isApproved,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save() {
    if (!editingId && !form.imageUrl) {
      setNotice("Choose an image first.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        editingId
          ? `/api/admin/customer-gallery/${editingId}`
          : "/api/admin/customer-gallery",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingId
              ? {
                  caption: form.caption,
                  altText: form.altText,
                  sortOrder: form.sortOrder,
                  isApproved: form.isApproved,
                }
              : form
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save gallery photo.");
      }

      reset();
      setNotice("Gallery photo saved successfully.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setNotice("");

    try {
      const body = new FormData();
      body.set("file", await prepareImageUpload(file, "gallery"));

      const response = await fetch("/api/admin/media", {
        method: "POST",
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Image upload failed.");
      }

      const imageUrl = `/api/media/products/${data.asset.storageKey}`;

      setForm(current => ({ ...current, imageUrl }));
      setNotice("Image uploaded. Add caption and save to Gallery.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: Photo) {
    if (!window.confirm("Remove this photo from Customer Gallery? The original Media Library image will remain.")) {
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/customer-gallery/${photo.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to remove photo.");
      }

      if (editingId === photo.id) reset();
      setNotice("Photo removed from Gallery. Original image retained.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleApproval(photo: Photo) {
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/customer-gallery/${photo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isApproved: !photo.isApproved }),
        }
      );

      if (!response.ok) {
        throw new Error("Unable to update approval.");
      }

      setNotice(photo.isApproved ? "Photo unpublished." : "Photo approved.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #d9d2c4",
    borderRadius: 10,
    background: "#fff",
    color: "#17243b",
  };

  return (
    <section style={{ padding: 24, color: "#17243b" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: "#aa8441", fontWeight: 700, letterSpacing: 2 }}>
          CONTENT MANAGEMENT
        </p>
        <h1 style={{ fontSize: 30, margin: "8px 0" }}>Customer Gallery</h1>
        <p>Manage customer photos displayed on the homepage. Only approved photos are published.</p>
      </header>

      <div style={{
        background: "#faf8f3",
        border: "1px solid #e7dfcf",
        borderRadius: 18,
        padding: 22,
        marginBottom: 28,
      }}>
        <h2 style={{ marginBottom: 18 }}>
          {editingId ? "Edit Gallery Photo" : "Add Gallery Photo"}
        </h2>

        {!editingId && (
          <>
            <label style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#17243b",
              color: "#fff",
              padding: "12px 18px",
              borderRadius: 10,
              cursor: busy ? "not-allowed" : "pointer",
              marginBottom: 18,
            }}>
              <ImagePlus size={18} />
              Upload New Photo
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif"
                disabled={busy}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>Or choose from Media Library</strong>
              <select
                style={{ ...fieldStyle, marginTop: 8 }}
                value={form.imageUrl}
                onChange={event => setForm(current => ({
                  ...current,
                  imageUrl: event.target.value,
                }))}
              >
                <option value="">Select an image</option>
                {assets.map(asset => (
                  <option
                    key={asset.id}
                    value={`/api/media/products/${asset.storageKey}`}
                  >
                    {asset.filename}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {form.imageUrl && (
          <div style={{ marginBottom: 18 }}>
            <Image
              src={form.imageUrl}
              alt="Gallery preview"
              width={320}
              height={240}
              unoptimized
              style={{
                width: 240,
                maxWidth: "100%",
                height: 190,
                objectFit: "cover",
                borderRadius: 12,
              }}
            />
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}>
          <label>
            <strong>Caption</strong>
            <input
              style={{ ...fieldStyle, marginTop: 8 }}
              value={form.caption}
              maxLength={255}
              onChange={event => setForm(current => ({
                ...current,
                caption: event.target.value,
              }))}
              placeholder="A beautiful Kalamkari moment"
            />
          </label>

          <label>
            <strong>Image Description</strong>
            <input
              style={{ ...fieldStyle, marginTop: 8 }}
              value={form.altText}
              maxLength={255}
              onChange={event => setForm(current => ({
                ...current,
                altText: event.target.value,
              }))}
              placeholder="Customer wearing a Kalamkari saree"
            />
          </label>

          <label>
            <strong>Display Order</strong>
            <input
              type="number"
              min={0}
              max={100000}
              style={{ ...fieldStyle, marginTop: 8 }}
              value={form.sortOrder}
              onChange={event => setForm(current => ({
                ...current,
                sortOrder: Number(event.target.value),
              }))}
            />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
          <input
            type="checkbox"
            checked={form.isApproved}
            onChange={event => setForm(current => ({
              ...current,
              isApproved: event.target.checked,
            }))}
          />
          Approved for Homepage
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#17243b",
              color: "white",
              border: 0,
              borderRadius: 10,
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            <Save size={17} />
            {busy ? "Saving..." : editingId ? "Update Photo" : "Add Photo"}
          </button>

          {editingId && (
            <button type="button" onClick={reset} disabled={busy}>
              <X size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      {notice && <p role="status" style={{ marginBottom: 18 }}>{notice}</p>}

      <h2 style={{ marginBottom: 16 }}>Gallery Photos ({photos.length})</h2>

      {loading && <p>Loading gallery...</p>}

      {!loading && photos.length === 0 && (
        <p>No gallery photos yet. Upload your first photo above.</p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
        gap: 18,
      }}>
        {photos.map(photo => (
          <article key={photo.id} style={{
            background: "white",
            border: "1px solid #e6dfd3",
            borderRadius: 16,
            overflow: "hidden",
          }}>
            <Image
              src={photo.imageUrl}
              alt={photo.altText || "Customer Gallery"}
              width={400}
              height={300}
              unoptimized
              style={{ width: "100%", height: 220, objectFit: "cover" }}
            />

            <div style={{ padding: 16 }}>
              <strong>{photo.caption || "Untitled Photo"}</strong>
              <p style={{ fontSize: 13, margin: "8px 0" }}>
                Order: {photo.sortOrder} · {photo.isApproved ? "Approved" : "Unapproved"}
              </p>

              <div className="sk-content-actions">
                <button type="button" disabled={busy} className="sk-content-btn is-edit" onClick={() => edit(photo)}>
                  <svg width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="m15 5 4 4M4 20l4-1 12-12-4-4L4 15z"/>
                </svg>
                Edit
                </button>
                <button type="button" disabled={busy} className={`sk-content-btn ${photo.isApproved ? "is-warning" : "is-success"}`} onClick={() => void toggleApproval(photo)}>
                  <Check size={14} />
                  {photo.isApproved ? "Unapprove" : "Approve"}
                </button>
                <button type="button" disabled={busy} className="sk-content-btn is-delete" onClick={() => void remove(photo)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
