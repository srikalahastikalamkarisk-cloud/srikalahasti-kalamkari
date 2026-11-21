"use client";

import { useCallback, useEffect, useState } from "react";
import "./video-stories-manager.css";

type Story = {
  id: string;
  title: string;
  enabled: boolean;
  sortOrder: number;
  sourceType: string;
  videoUrl: string | null;
  mobileUrl: string | null;
  videoFile: string | null;
  posterImage: string | null;
  fallbackMs: number;
};

type FormData = {
  title: string;
  enabled: boolean;
  sourceType: "url" | "upload";
  videoUrl: string;
  mobileUrl: string;
  videoFile: string;
  posterImage: string;
  fallbackMs: number;
};

const emptyForm: FormData = {
  title: "",
  enabled: true,
  sourceType: "url",
  videoUrl: "",
  mobileUrl: "",
  videoFile: "",
  posterImage: "",
  fallbackMs: 15000,
};

function toForm(story: Story): FormData {
  return {
    title: story.title,
    enabled: story.enabled,
    sourceType: story.sourceType === "upload" ? "upload" : "url",
    videoUrl: story.videoUrl || "",
    mobileUrl: story.mobileUrl || "",
    videoFile: story.videoFile || "",
    posterImage: story.posterImage || "",
    fallbackMs: story.fallbackMs,
  };
}

export default function VideoStoriesManager() {
  const [stories, setStories] = useState<Story[]>([]);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/video-stories", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load stories");
      setStories(result.stories);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load stories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  async function uploadVideo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setError("Only MP4 and WebM videos are supported.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("Maximum video size is 50 MB.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/admin/video-stories/upload-video", {
        method: "POST",
        credentials: "same-origin",
        body,
      });

      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Video upload failed.");
      }

      setForm(previous => ({
        ...previous,
        sourceType: "upload",
        videoFile: result.url,
      }));

      setNotice("Video uploaded. Click Add Story or Save Changes to publish it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveStory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      title: form.title.trim(),
      enabled: form.enabled,
      sourceType: form.sourceType,
      videoUrl: form.videoUrl.trim() || null,
      mobileUrl: form.mobileUrl.trim() || null,
      videoFile: form.videoFile.trim() || null,
      posterImage: form.posterImage.trim() || null,
      fallbackMs: Number(form.fallbackMs),
    };

    try {
      const response = await fetch(
        editingId
          ? `/api/admin/video-stories/${encodeURIComponent(editingId)}`
          : "/api/admin/video-stories",
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save story");

      resetForm();
      setNotice(editingId ? "Story updated successfully." : "Story created successfully.");
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save story");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStory(story: Story) {
    if (!window.confirm(`Permanently delete "${story.title}"?`)) return;
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/video-stories/${encodeURIComponent(story.id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Delete failed");
      setNotice("Story deleted. Uploaded media files were not deleted.");
      if (editingId === story.id) resetForm();
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleStory(story: Story) {
    setError("");
    try {
      const response = await fetch(
        `/api/admin/video-stories/${encodeURIComponent(story.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !story.enabled }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Status update failed");
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  }

  async function moveStory(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= stories.length) return;

    const ids = stories.map(story => story.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];

    setError("");
    try {
      const response = await fetch("/api/admin/video-stories/reorder", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Reorder failed");
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  return (
    <main className="vsm-page">
      <header className="vsm-header">
        <div>
          <span className="vsm-eyebrow">CONTENT MANAGEMENT</span>
          <h1>Video Stories</h1>
          <p>Manage the videos displayed in the homepage Stories in Motion section.</p>
        </div>
        <a href="/#stories-in-motion" target="_blank" rel="noopener noreferrer">
          View Storefront ↗
        </a>
      </header>

      {error && <div className="vsm-message vsm-error" role="alert">{error}</div>}
      {notice && <div className="vsm-message vsm-success" role="status">{notice}</div>}

      <div className="vsm-layout">
        <section className="vsm-panel">
          <h2>{editingId ? "Edit Video Story" : "Add Video Story"}</h2>

          <form onSubmit={saveStory} className="vsm-form">
            <label>
              Story Title
              <input required maxLength={191} value={form.title}
                onChange={event => update("title", event.target.value)}
                placeholder="The Artisan's Touch" />
            </label>

            <label>
              Video Source
              <select value={form.sourceType}
                onChange={event => update("sourceType", event.target.value as "url" | "upload")}>
                <option value="url">Universal Video URL</option>
                <option value="upload">Uploaded Video File</option>
              </select>
            </label>

            {form.sourceType === "url" ? (
              <label>
                Video URL
                <input required value={form.videoUrl}
                  onChange={event => update("videoUrl", event.target.value)}
                  placeholder="YouTube, Instagram, Pinterest or HTTPS MP4/WebM" />
              </label>
            ) : (
              <label>
                Uploaded Video Path
                <input required value={form.videoFile}
                  onChange={event => update("videoFile", event.target.value)}
                  placeholder="/api/media/... or /uploads/..."/>
                <div className="vsm-upload">
                  <label className="vsm-upload-button">
                    {uploading ? "Uploading video..." : "Choose MP4 / WebM Video"}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,.mp4,.webm"
                      disabled={uploading || saving}
                      onChange={event => void uploadVideo(event)}
                    />
                  </label>

                  {form.videoFile && (
                    <button
                      type="button"
                      className="vsm-secondary"
                      onClick={() => update("videoFile", "")}
                      disabled={uploading}
                    >
                      Remove Video
                    </button>
                  )}
                </div>

                {form.videoFile && (
                  <video
                    className="vsm-video-preview"
                    src={form.videoFile}
                    controls
                    playsInline
                    preload="metadata"
                  />
                )}

                <small>Maximum 50 MB. Replace by uploading another video. Remove only detaches the video from this form.</small>
              </label>
            )}

            <label>
              Mobile Video URL (optional)
              <input value={form.mobileUrl}
                onChange={event => update("mobileUrl", event.target.value)}
                placeholder="Optional mobile-specific video" />
            </label>

            <label>
              Poster Image URL (optional)
              <input value={form.posterImage}
                onChange={event => update("posterImage", event.target.value)}
                placeholder="/uploads/poster.webp or HTTPS image URL" />
            </label>

            <label>
              Fallback Duration (milliseconds)
              <input type="number" min={5000} max={120000} step={1000}
                value={form.fallbackMs}
                onChange={event => update("fallbackMs", Number(event.target.value))} />
            </label>

            <label className="vsm-check">
              <input type="checkbox" checked={form.enabled}
                onChange={event => update("enabled", event.target.checked)} />
              Show on storefront
            </label>

            <div className="vsm-actions">
              <button type="submit" disabled={saving || uploading}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Story"}
              </button>
              {editingId && <button type="button" className="vsm-secondary"
                onClick={resetForm}>Cancel Edit</button>}
            </div>
          </form>
        </section>

        <section className="vsm-panel">
          <div className="vsm-list-header">
            <h2>Stories ({stories.length})</h2>
            <button type="button" className="vsm-secondary"
              onClick={() => void loadStories()}>Refresh</button>
          </div>

          {loading ? <p>Loading stories...</p> :
            stories.length === 0 ? (
              <p>No stories yet. Add your first video story.</p>
            ) : (
              <div className="vsm-list">
                {stories.map((story, index) => (
                  <article className="vsm-item" key={story.id}>
                    <div className="vsm-item-info">
                      <strong>{String(index + 1).padStart(2, "0")}. {story.title}</strong>
                      <span>{story.sourceType === "upload" ? "Uploaded Video" : "Video URL"}</span>
                      <span>{story.enabled ? "Visible on storefront" : "Hidden"}</span>
                    </div>
                    <div className="vsm-item-actions">
                      <button type="button" disabled={index === 0}
                        onClick={() => void moveStory(index, -1)}
                        aria-label={`Move ${story.title} up`}>↑</button>
                      <button type="button" disabled={index === stories.length - 1}
                        onClick={() => void moveStory(index, 1)}
                        aria-label={`Move ${story.title} down`}>↓</button>
                      <button type="button" onClick={() => {
                        setEditingId(story.id);
                        setForm(toForm(story));
                        setError("");
                      }}>Edit</button>
                      <button type="button" onClick={() => void toggleStory(story)}>
                        {story.enabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="vsm-danger"
                        onClick={() => void deleteStory(story)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
