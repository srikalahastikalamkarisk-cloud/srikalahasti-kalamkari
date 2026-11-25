"use client";

import { prepareImageUpload, isSupportedImageFile } from "@/lib/admin/browser-image-optimizer";

import { useEffect, useState } from "react";
import Link from "next/link";
import WebsiteStatusControl from "@/components/admin/website-status-control";
import "./settings.css";

type Settings = {
  storeName: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  address: string;
  instagramUrl: string;
  facebookUrl: string;
  youtubeUrl: string;
  metaTitle: string;
  metaDescription: string;
};

type PaymentConfiguration = {
  razorpayLiveReady: boolean;
  webhookSecretConfigured: boolean;
};

type Field = { key: keyof Settings; label: string; type?: string; hint?: string };
type Section = { id: string; title: string; description: string; fields: Field[] };

const defaults: Settings = {
  storeName: "Srikalahasti Kalamkari",
  description: "",
  logoUrl: "",
  faviconUrl: "",
  contactEmail: "",
  contactPhone: "",
  whatsappNumber: "",
  address: "",
  instagramUrl: "",
  facebookUrl: "",
  youtubeUrl: "",
  metaTitle: "",
  metaDescription: "",
};

const sections: Section[] = [
  {
    id: "general",
    title: "General & branding",
    description: "Your public store name and optional brand assets.",
    fields: [
      { key: "storeName", label: "Store name" },
      { key: "description", label: "Store description", type: "textarea" },
      { key: "logoUrl", label: "Logo URL", type: "url", hint: "Use an HTTPS image URL. Leave blank to keep the current logo." },
    ],
  },
  {
    id: "contact",
    title: "Contact information",
    description: "Public contact details shown to shoppers.",
    fields: [
      { key: "contactEmail", label: "Contact email", type: "email" },
      { key: "contactPhone", label: "Phone number", type: "tel" },
      { key: "whatsappNumber", label: "WhatsApp number", type: "tel", hint: "Include the country code; punctuation is ignored when building the link." },
      { key: "address", label: "Business address", type: "textarea" },
    ],
  },
  {
    id: "social",
    title: "Social media",
    description: "Only HTTPS profile links are accepted.",
    fields: [
      { key: "instagramUrl", label: "Instagram", type: "url" },
      { key: "facebookUrl", label: "Facebook", type: "url" },
      { key: "youtubeUrl", label: "YouTube", type: "url" },
    ],
  },
  {
    id: "seo",
    title: "Search & sharing",
    description: "Defaults for pages that do not define their own metadata.",
    fields: [
      { key: "metaTitle", label: "Default meta title" },
      { key: "metaDescription", label: "Default meta description", type: "textarea" },
    ],
  },
];

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value);
}

export default function StoreSettingsPage() {
  const [form, setForm] = useState<Settings>(defaults);
  const [savedForm, setSavedForm] = useState<Settings | null>(null);
  const [paymentConfiguration, setPaymentConfiguration] = useState<PaymentConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const dirty = savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/admin/settings", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401) {
          throw new Error("Your admin session has expired. Sign in again to load store settings.");
        }
        if (!response.ok) throw new Error("The settings service could not load saved values.");

        const data = await response.json() as {
          settings?: Partial<Record<keyof Settings, unknown>>;
          paymentConfiguration?: PaymentConfiguration;
        };
        const next = { ...defaults };
        for (const key of Object.keys(defaults) as (keyof Settings)[]) {
          const value = data.settings?.[key];
          next[key] = typeof value === "string" ? value : "";
        }

        if (active) {
          setForm(next);
          setSavedForm(next);
          setPaymentConfiguration(data.paymentConfiguration ?? null);
          setLoaded(true);
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setLoaded(false);
          setError(loadError instanceof Error ? loadError.message : "Unable to load saved settings.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const confirmInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved store settings. Leave this page and discard them?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("click", confirmInternalNavigation, true);
    return () => window.removeEventListener("click", confirmInternalNavigation, true);
  }, [dirty]);

  function update(key: keyof Settings, value: string) {
    setForm(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: undefined }));
    setMessage("");
    setError("");
  }

  async function uploadLogo(file: File) {
    if (!isSupportedImageFile(file)) {
      setError("Choose a PNG, JPG or WebP logo.");
      return;
    }

    setUploadingLogo(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();
      body.set("file", await prepareImageUpload(file, "logo"));
      body.set("purpose", "logo");

      const response = await fetch("/api/admin/media", {
        method: "POST",
        credentials: "same-origin",
        body,
      });

      const data = await response.json() as {
        error?: string;
        asset?: { storageKey?: string };
      };

      if (!response.ok || !data.asset?.storageKey) {
        throw new Error(data.error || "Logo upload failed.");
      }

      update("logoUrl", `/api/media/products/${data.asset.storageKey}`);
      setMessage("Logo uploaded. Click Save settings to activate it.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadFavicon(file: File) {
    if (!/^(image\/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon)|application\/octet-stream)$/.test(file.type) && !(file.type === "" && file.name.toLowerCase().endsWith(".ico"))) {
      setError("Choose a PNG, JPG, WebP or ICO favicon.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Favicon must be 1 MB or smaller.");
      return;
    }
    setUploadingFavicon(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("purpose", "favicon");
      const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body });
      const data = await response.json() as { error?: string; asset?: { storageKey?: string } };
      if (!response.ok || !data.asset?.storageKey) throw new Error(data.error || "Favicon upload failed.");
      update("faviconUrl", `/api/media/products/${data.asset.storageKey}`);
      setMessage("Favicon uploaded. Click Save settings to activate it.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Favicon upload failed.");
    } finally {
      setUploadingFavicon(false);
    }
  }

  function retryLoad() {
    setLoading(true);
    setError("");
    setLoadAttempt(attempt => attempt + 1);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || !loaded || !dirty) return;

    setSaving(true);
    setMessage("");
    setError("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json() as {
        error?: string;
        issues?: { field?: string; message?: string }[];
        settings?: Partial<Record<keyof Settings, unknown>>;
      };

      if (response.status === 401) {
        throw new Error("Your admin session has expired. Sign in again before saving.");
      }
      if (!response.ok) {
        const errors: Partial<Record<keyof Settings, string>> = {};
        for (const issue of data.issues ?? []) {
          if (issue.field && issue.field in defaults) {
            errors[issue.field as keyof Settings] = issue.message ?? "Invalid value.";
          }
        }
        setFieldErrors(errors);
        throw new Error(data.error || "Please correct the highlighted fields.");
      }

      const next = { ...defaults };
      for (const key of Object.keys(defaults) as (keyof Settings)[]) {
        const value = data.settings?.[key];
        next[key] = typeof value === "string" ? value : "";
      }
      setForm(next);
      setSavedForm(next);
      setMessage("Store settings saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!savedForm) return;
    setForm(savedForm);
    setFieldErrors({});
    setMessage("");
    setError("");
  }

  return (
    <main className="sk-settings-page">
      <header className="sk-settings-heading">
        <div>
          <p className="sk-settings-eyebrow">ADMINISTRATION / STORE PROFILE</p>
          <h1>Store settings</h1>
          <p>Manage the public identity, contact details and search defaults for your storefront.</p>
        </div>
        {dirty && <span className="sk-settings-dirty" role="status">Unsaved changes</span>}
      </header>

      <WebsiteStatusControl />

      {loading ? (
        <div className="sk-settings-skeleton" role="status" aria-label="Loading store settings">
          <span /><span /><span />
        </div>
      ) : !loaded ? (
        <section className="sk-settings-load-error" role="alert">
          <h2>Saved settings were not loaded</h2>
          <p>{error || "The settings request failed. No form values can be saved until the stored settings load successfully."}</p>
          <div className="sk-settings-actions">
            {error.includes("session") && <Link href="/admin/login">Sign in again</Link>}
            <button type="button" onClick={retryLoad}>Retry loading</button>
          </div>
        </section>
      ) : (
        <>
          <nav className="sk-settings-tabs" aria-label="Store settings sections">
            <a href="#favicon">Browser favicon</a>
            {sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
            <a href="#checkout-safety">Checkout & payments</a>
          </nav>

          <form onSubmit={save} noValidate>
            <section className="sk-settings-card" id="favicon" aria-labelledby="favicon-title">
              <div className="sk-settings-card-heading"><div><h2 id="favicon-title">Browser favicon</h2><p>Shown in browser tabs, bookmarks and search results. Square PNG, JPG, WebP or ICO; 16–512 pixels and up to 1 MB.</p></div></div>
              <div className="sk-settings-fields"><div className="sk-settings-field">
                <label htmlFor="settings-faviconUrl">Favicon URL</label>
                <input id="settings-faviconUrl" type="url" value={form.faviconUrl} onChange={event => update("faviconUrl", event.target.value)} aria-invalid={Boolean(fieldErrors.faviconUrl)} />
                <small>{fieldErrors.faviconUrl || "Upload an icon or use an HTTPS image URL. Clearing this field restores the default Srikalahasti icon."}</small>
                {(isHttpsUrl(form.faviconUrl) || /^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp|ico)$/.test(form.faviconUrl)) && (
                  <div className="sk-settings-logo-preview sk-settings-favicon-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.faviconUrl} alt="Favicon preview" />
                    <span>Favicon preview</span>
                  </div>
                )}
                <div className="sk-settings-logo-upload">
                  <label htmlFor="sk-favicon-file" style={{ cursor: uploadingFavicon ? "wait" : "pointer" }}>{uploadingFavicon ? "Uploading favicon…" : form.faviconUrl ? "Replace Image (PNG, JPG, WebP, ICO)" : "Choose Image (PNG, JPG, WebP, ICO)"}</label>
                  <input id="sk-favicon-file" type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico" disabled={uploadingFavicon || saving} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadFavicon(file); event.target.value = ""; }} />
                  <button type="button" className="sk-settings-secondary" disabled={!form.faviconUrl || saving || uploadingFavicon} onClick={() => { if (window.confirm("Remove the current favicon URL from the storefront? An uploaded file will remain in the media library.")) update("faviconUrl", ""); }}>Remove Image</button>
                  <small>Upload or remove, then click Save settings. Removing it from the storefront keeps the file in your media library.</small>
                </div>
              </div></div>
            </section>
            {sections.map(section => (
              <section className="sk-settings-card" id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
                <div className="sk-settings-card-heading">
                  <div>
                    <h2 id={`${section.id}-title`}>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>
                </div>
                <div className="sk-settings-fields">
                  {section.fields.map(field => {
                    const id = `settings-${field.key}`;
                    const fieldError = fieldErrors[field.key];
                    return (
                      <div className="sk-settings-field" key={field.key}>
                        <label htmlFor={id}>{field.label}{field.key === "storeName" && <span aria-hidden="true"> *</span>}</label>
                        {field.type === "textarea" ? (
                          <textarea
                            id={id}
                            rows={3}
                            value={form[field.key]}
                            onChange={event => update(field.key, event.target.value)}
                            aria-invalid={Boolean(fieldError)}
                            aria-describedby={fieldError ? `${id}-error` : field.hint ? `${id}-hint` : undefined}
                          />
                        ) : (
                          <input
                            id={id}
                            type={field.type || "text"}
                            value={form[field.key]}
                            onChange={event => update(field.key, event.target.value)}
                            required={field.key === "storeName"}
                            aria-invalid={Boolean(fieldError)}
                            aria-describedby={fieldError ? `${id}-error` : field.hint ? `${id}-hint` : undefined}
                          />
                        )}
                        {field.hint && !fieldError && <small id={`${id}-hint`}>{field.hint}</small>}
                        {fieldError && <small className="sk-settings-field-error" id={`${id}-error`}>{fieldError}</small>}
                        {field.key === "logoUrl" && (isHttpsUrl(form.logoUrl) || /^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(form.logoUrl)) && (
                          <div className="sk-settings-logo-preview">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.logoUrl} alt="Store logo preview" />
                            <span>Logo preview</span>
                          </div>
                        )}
                        {field.key === "logoUrl" && (
                          <div className="sk-settings-logo-upload">
                            <label htmlFor="sk-logo-file" style={{ cursor: uploadingLogo ? "wait" : "pointer" }}>
                              {uploadingLogo ? "Uploading logo…" : "Upload Logo (PNG, JPG, WebP)"}
                            </label>
                            <input
                              id="sk-logo-file"
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif"
                              disabled={uploadingLogo || saving}
                              onChange={event => {
                                const file = event.target.files?.[0];
                                if (file) void uploadLogo(file);
                                event.target.value = "";
                              }}
                            />
                            <small>Upload first, then click Save settings to activate your logo.</small>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="sk-settings-card" id="checkout-safety" aria-labelledby="checkout-safety-title">
              <div className="sk-settings-card-heading">
                <div>
                  <h2 id="checkout-safety-title">Checkout & payments</h2>
                  <p>Read-only status. Payment credentials are never shown here.</p>
                </div>
              </div>
              <div className="sk-settings-status-grid">
                <div><span>Razorpay</span><strong className={paymentConfiguration?.razorpayLiveReady ? "is-ready" : "is-review"}>{paymentConfiguration?.razorpayLiveReady ? "LIVE configured" : "Configuration needs review"}</strong></div>
                <div><span>Webhook secret</span><strong className={paymentConfiguration?.webhookSecretConfigured ? "is-ready" : "is-review"}>{paymentConfiguration?.webhookSecretConfigured ? "Present in runtime" : "Not configured"}</strong></div>
                <div><span>Shipping</span><strong>Free shipping · unchanged</strong></div>
                <div><span>Cash on delivery</span><strong>Disabled</strong></div>
              </div>
              <p className="sk-settings-note">Shipping totals, minimum order rules, store closure controls and refunds are not editable here. Existing payment recovery and paid-order processing remain available.</p>
            </section>

            {error && <p className="sk-settings-feedback is-error" role="alert">{error}</p>}
            {message && <p className="sk-settings-feedback is-success" role="status">{message}</p>}

            <div className="sk-settings-submit-row">
              <span>{dirty ? "Remember to save your changes." : "All changes are saved."}</span>
              <div className="sk-settings-actions">
                <button type="button" className="sk-settings-secondary" onClick={discardChanges} disabled={!dirty || saving}>Discard changes</button>
                <button type="submit" className="sk-settings-primary" disabled={!loaded || loading || saving || !dirty}>
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
