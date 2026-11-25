"use client";

import { prepareImageUpload, isSupportedImageFile } from "@/lib/admin/browser-image-optimizer";

import { useRef, useState } from "react";
import {
  ImagePlus, Star, Trash2, ArrowLeft, ArrowRight,
  LoaderCircle
} from "lucide-react";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

export default function ProductImageGallery({
  images,
  onChange,
  onUploadingChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length || uploading) return;

    setError("");

    const selected = Array.from(files);

    if (images.length + selected.length > 20) {
      setError("Maximum 20 product images allowed.");
      return;
    }

    for (const file of selected) {
      if (!isSupportedImageFile(file)) {
        setError("Only JPG, PNG and WebP images are allowed.");
        return;
      }

      if (file.size === 0) {
        setError("The selected image is empty.");
        return;
      }
    }

    setUploading(true);
    onUploadingChange?.(true);

    const uploaded: string[] = [];

    try {
      for (const file of selected) {
        const body = new FormData();
        body.append("file", await prepareImageUpload(file, "product"));

        const response = await fetch("/api/admin/products/upload", {
          method: "POST",
          credentials: "same-origin",
          body,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Image upload failed");
        }

        if (typeof data.image !== "string") {
          throw new Error("Invalid image upload response");
        }

        uploaded.push(data.image);
      }

      onChange([...images, ...uploaded]);
    } catch (err) {
      if (uploaded.length) {
        onChange([...images, ...uploaded]);
      }

      setError(
        err instanceof Error ? err.message : "Unable to upload images"
      );
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;

    const next = [...images];
    [next[index], next[nextIndex]] =
      [next[nextIndex], next[index]];

    onChange(next);
  }

  function makePrimary(index: number) {
    if (index === 0) return;

    const next = [...images];
    const [selected] = next.splice(index, 1);
    next.unshift(selected);

    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <section className="skpm-form-section skpm-gallery">
      <h2>Product Images</h2>
      <p className="skpm-gallery-hint">
        Upload up to 20 images. The first image is the primary product image.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif"
        multiple
        hidden
        disabled={uploading}
        onChange={e => void upload(e.target.files)}
      />

      <button
        type="button"
        className="skpm-gallery-upload"
        disabled={uploading || images.length >= 20}
        onClick={() => inputRef.current?.click()}
      >
        {uploading
          ? <LoaderCircle size={24} className="skpm-spin" />
          : <ImagePlus size={24} />}
        <strong>{uploading ? "Uploading images..." : "Upload Product Images"}</strong>
        <span>JPG, PNG, WebP, BMP, TIFF or AVIF · Automatic image optimization</span>
      </button>

      {error && <p className="skpm-error" role="alert">{error}</p>}

      <p className="skpm-gallery-count">{images.length} / 20 images</p>

      {images.length > 0 && (
        <div className="skpm-gallery-grid">
          {images.map((src, index) => (
            <div className="skpm-gallery-item" key={src}>
              <div className="skpm-gallery-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Product image ${index + 1}`} />
                {index === 0 && (
                  <span className="skpm-gallery-primary">Primary</span>
                )}
              </div>

              <div className="skpm-gallery-actions">
                <button
                  type="button"
                  title="Set as primary"
                  aria-label="Set as primary"
                  disabled={index === 0 || uploading}
                  onClick={() => makePrimary(index)}
                >
                  <Star size={15} />
                </button>
                <button
                  type="button"
                  title="Move left"
                  aria-label="Move left"
                  disabled={index === 0 || uploading}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  type="button"
                  title="Move right"
                  aria-label="Move right"
                  disabled={index === images.length - 1 || uploading}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  title="Remove image"
                  aria-label="Remove image"
                  disabled={uploading}
                  onClick={() => remove(index)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
