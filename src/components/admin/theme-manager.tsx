"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, Eye, Monitor, RotateCcw, Search, Smartphone, Sparkles } from "lucide-react";
import {
  ORIGINAL_THEME_ID,
  STORE_THEMES,
  THEME_FAMILIES,
  resolveStoreTheme,
  themeCssVariables,
  type StoreTheme,
} from "@/lib/store-themes";
import "./theme-manager.css";

export default function ThemeManager() {
  const [previewId, setPreviewId] = useState(ORIGINAL_THEME_ID);
  const [publishedId, setPublishedId] = useState(ORIGINAL_THEME_ID);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/admin/appearance", { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Unable to load published theme"); return response.json(); })
      .then(data => setPublishedId(data.themeId || ORIGINAL_THEME_ID))
      .catch(error => setMessage(error.message));
  }, []);

  async function applyTheme(method: "POST" | "PUT" | "DELETE", themeId?: string) {
    setBusy(true); setMessage("");
    const storefrontWindow = window.open("about:blank", "_blank");
    try {
      const response = await fetch("/api/admin/appearance", {
        method,
        headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ themeId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Theme action failed");
      if (method === "PUT" && themeId) setPublishedId(themeId);
      if (storefrontWindow) storefrontWindow.location.href = "/";
      if (method === "POST") {
        setMessage("Private preview opened in a new tab for one hour.");
      } else {
        setMessage(method === "PUT" ? "Theme published. The updated storefront is open in a new tab." : "Private preview cleared. The published storefront is open in a new tab.");
      }
    } catch (error) {
      storefrontWindow?.close();
      setMessage(error instanceof Error ? error.message : "Theme action failed");
    }
    finally { setBusy(false); }
  }
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const preview = resolveStoreTheme(previewId);

  const filteredThemes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return STORE_THEMES.filter(
      theme =>
        (family === "all" || theme.familyId === family) &&
        (!needle ||
          `${theme.name} ${theme.familyName} ${theme.description}`
            .toLowerCase()
            .includes(needle))
    );
  }, [family, query]);

  return (
    <div className="sk-theme-admin">
      <header className="sk-theme-admin-head">
        <div>
          <p className="sk-theme-eyebrow">
            <Sparkles size={15} /> STOREFRONT PERSONALIZATION
          </p>
          <h1>Appearance &amp; Themes</h1>
          <p>Explore 50 heritage-inspired gradients. Preview privately, then publish when ready.</p>
        </div>
        <div className="sk-theme-published-pill">
          <span /> Published: {resolveStoreTheme(publishedId).name}
        </div>
      </header>

      <section className="sk-theme-workspace" aria-label="Theme preview">
        <div className="sk-theme-preview-column">
          <div className="sk-theme-preview-head">
            <div>
              <span className="sk-theme-small-label">
                <Eye size={14} /> PRIVATE PREVIEW
              </span>
              <h2>{preview.name}</h2>
              <p>{preview.description}</p>
            </div>
            <div className="sk-theme-device-toggle" role="group" aria-label="Preview size">
              <button
                type="button"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <Monitor size={16} /> Desktop
              </button>
              <button
                type="button"
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                <Smartphone size={16} /> Mobile
              </button>
            </div>
          </div>

          <ThemePreview theme={preview} device={device} />

          <div className="sk-theme-preview-actions">
            <button
              type="button"
              className="sk-theme-button sk-theme-secondary"
              onClick={() => setPreviewId(ORIGINAL_THEME_ID)}
              disabled={previewId === ORIGINAL_THEME_ID}
            >
              <RotateCcw size={16} /> Reset Preview
            </button>
            <button type="button" className="sk-theme-button sk-theme-secondary" disabled={busy} onClick={() => applyTheme("POST", previewId)}>
              <Eye size={16} /> Preview Full Website
            </button>
            <button type="button" className="sk-theme-button" disabled={busy || previewId === publishedId} onClick={() => { if (window.confirm(`Publish ${preview.name} to all visitors?`)) void applyTheme("PUT", previewId); }}>
              <Check size={16} /> Publish Theme
            </button>
            <button type="button" className="sk-theme-button sk-theme-secondary" disabled={busy} onClick={() => applyTheme("DELETE")}>Clear Private Preview</button>
            <span className="sk-theme-small-label" role="status">{message}</span>
          </div>
        </div>

        <aside className="sk-theme-controls">
          <div className="sk-theme-control-heading">
            <div>
              <span className="sk-theme-small-label">ORIGINAL PALETTE</span>
              <h2>Navy &amp; Gold</h2>
            </div>
            <button
              type="button"
              className="sk-theme-button sk-theme-secondary"
              onClick={() => setPreviewId(ORIGINAL_THEME_ID)}
            >
              <RotateCcw size={15} /> Preview Original
            </button>
          </div>
          <button type="button" className="sk-theme-button sk-theme-secondary" disabled={busy || publishedId === ORIGINAL_THEME_ID} onClick={() => { if (window.confirm("Restore original Navy & Gold for all visitors?")) void applyTheme("PUT", ORIGINAL_THEME_ID); }}>
            <RotateCcw size={15} /> Restore Original (Publish)
          </button>
          <p className="sk-theme-small-label">
            Selecting a palette changes this preview panel only. Full Website Preview is private to your authenticated browser; Publish changes the storefront for all visitors.
          </p>
        </aside>
      </section>

      <section className="sk-theme-library" aria-labelledby="sk-theme-library-title">
        <div className="sk-theme-library-head">
          <div>
            <span className="sk-theme-small-label">CURATED COLLECTION</span>
            <h2 id="sk-theme-library-title">50 Gradient Palettes</h2>
            <p>Ten families, each with five distinctive expressions.</p>
          </div>
          <label className="sk-theme-search">
            <Search size={17} />
            <span className="sk-visually-hidden">Search palettes</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search palettes"
            />
          </label>
        </div>

        <div className="sk-theme-families" aria-label="Filter theme families">
          <button
            type="button"
            className={family === "all" ? "is-active" : ""}
            onClick={() => setFamily("all")}
          >
            All 50
          </button>
          {THEME_FAMILIES.map(item => (
            <button
              type="button"
              key={item.id}
              className={family === item.id ? "is-active" : ""}
              onClick={() => setFamily(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <p className="sk-theme-result-count" aria-live="polite">
          Showing {filteredThemes.length} of 50 palettes
        </p>

        <div className="sk-theme-grid">
          {filteredThemes.map(theme => {
            const selected = previewId === theme.id;
            return (
              <button
                type="button"
                key={theme.id}
                className={`sk-theme-card ${selected ? "is-selected" : ""}`}
                onClick={() => setPreviewId(theme.id)}
                aria-pressed={selected}
              >
                <span
                  className="sk-theme-card-swatch"
                  style={{ background: theme.gradients.primary }}
                >
                  <i style={{ background: theme.gradients.secondary }} />
                  <b>{selected ? "PREVIEWING" : theme.familyName.toUpperCase()}</b>
                </span>
                <span className="sk-theme-card-copy">
                  <strong>{theme.name}</strong>
                  <small>Variation {theme.variation} · {theme.familyName}</small>
                </span>
                {selected && (
                  <span className="sk-theme-card-check" aria-label="Selected for preview">
                    <Check size={15} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ThemePreview({
  theme,
  device,
}: {
  theme: StoreTheme;
  device: "desktop" | "mobile";
}) {
  return (
    <div
      className={`sk-theme-demo ${device === "mobile" ? "is-mobile" : ""}`}
      data-storefront-theme={theme.id}
      style={themeCssVariables(theme) as CSSProperties}
    >
      <div className="sk-theme-demo-announce">
        ✦ &nbsp; HANDCRAFTED HERITAGE · THOUGHTFULLY MADE
      </div>
      <header>
        <div>
          <span className="sk-theme-demo-mark">✦</span>
          <strong>SRIKALAHASTI</strong>
        </div>
        <nav>
          <span>COLLECTIONS</span>
          <span>OUR STORY</span>
          <span>CONTACT</span>
        </nav>
        <b>♡　 BAG</b>
      </header>
      <section className="sk-theme-demo-hero">
        <span>THE ART OF SRIKALAHASTI</span>
        <h3>Heritage, woven into every detail.</h3>
        <p>A living tradition, painted by hand and treasured for generations.</p>
        <button type="button">Explore the collection →</button>
        <i aria-hidden="true">✧</i>
      </section>
      <section className="sk-theme-demo-product">
        <div className="sk-theme-demo-photo">
          <span>HAND-PAINTED</span>
        </div>
        <div>
          <small>THE ATELIER EDIT</small>
          <h4>Temple Garden Kalamkari</h4>
          <p>A timeless expression of craft and color.</p>
          <strong>₹ 4,850</strong>
          <button type="button">Discover the piece</button>
        </div>
      </section>
      <footer>CRAFTED WITH CARE · ROOTED IN HERITAGE</footer>
    </div>
  );
}
