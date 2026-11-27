"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDownToLine, ArrowRight, Check, CheckCircle2, CircleAlert,
  CloudUpload, FileArchive, FileSpreadsheet, Image as ImageIcon,
  LoaderCircle, PackageCheck, RefreshCw, ShieldCheck, Sparkles,
} from "lucide-react";
import { validateCsvImportFile, validateZipImportFile } from "@/lib/admin/import-file-validation";
import {
  uploadImportFile,
  type StagedSelection
} from "@/lib/admin/import-upload-client";
import "./product-import.css";

type PreviewImage = { number: string; filename: string; mime: string; preview: string; external?: boolean };
type PreviewProduct = {
  row: number; name: string; sku: string | null; category: string; pricingMode: string; imageStatus: string;
  price: number; stock: number; photoNumbers: string[]; imageCount: number; action: "Create" | "Update"; warnings: string[];
  validationStatus: "Ready"; images: PreviewImage[]; urlCount: number;
};
type ImportError = { row: number; error: string };
type Result = {
  created?: number; updated?: number; skipped?: number; failed?: number;
  totalRows?: number; newProducts?: number; updates?: number; newCategories?: number; newSubcategories?: number;
  outcomes?: Array<{ row: number; slug: string; status: string }>;
  errors?: ImportError[];
  skippedImageRows?: ImportError[];
  error?: string;
  preview?: PreviewProduct[];
  previewToken?: string;
};
type FileKind = "csv" | "zip";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadErrorReport(errors: ImportError[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = ["row,error", ...errors.map(item => `${item.row},${escape(item.error)}`)].join("\r\n");
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "product-import-errors.csv";
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function ProductImport() {
  const [file, setFile] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [autoDownloadImages, setAutoDownloadImages] = useState(true);
  const [fileErrors, setFileErrors] = useState<{ csv?: string; zip?: string }>({});
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const uploadRequest = useRef<AbortController | null>(null);
  const staged = useRef<
    Partial<Record<FileKind, StagedSelection>>
  >({});
  const running = useRef(false);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const totalPreview = result?.preview?.length ?? 0;
  const totalPages = Math.max(
    1, Math.ceil(totalPreview / pageSize)
  );

  const visiblePage = Math.min(page, totalPages);

  const visibleProducts = useMemo(
    () => (result?.preview ?? []).slice(
      (visiblePage - 1) * pageSize,
      visiblePage * pageSize
    ),
    [result, visiblePage, pageSize]
  );

  const step = useMemo(() => {
    if (result?.created !== undefined) return 3;
    if (result?.preview) return 2;
    if (file) return 1;
    return 0;
  }, [file, result]);

  function choose(kind: FileKind, selected?: File) {
    if (!selected || running.current) return;

    delete staged.current[kind];

    if (kind === "csv") {
      delete staged.current.zip;
    }

    setPage(1);
    const error = kind === "csv" ? validateCsvImportFile(selected) : validateZipImportFile(selected);
    setResult(null);
    if (kind === "csv") {
      setFileErrors(current => ({ ...current, csv: error }));
      setFile(error ? null : selected);

      // A new CSV must not reuse a previous ZIP accidentally.
      setZip(null);
      setFileErrors(current => ({
        ...current,
        zip: ""
      }));

      if (zipInput.current) {
        zipInput.current.value = "";
      }
    } else {
      setFileErrors(current => ({ ...current, zip: error }));
      setZip(error ? null : selected);
    }
  }

  function drop(kind: FileKind, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragging");
    choose(kind, event.dataTransfer.files[0]);
  }


  async function send(mode: "preview" | "confirm") {
    if (!file || running.current) return;

    const validationError =
      validateCsvImportFile(file) ||
      (zip ? validateZipImportFile(zip) : "");

    if (validationError) {
      setFileErrors({
        csv: validateCsvImportFile(file),
        zip: zip ? validateZipImportFile(zip) : ""
      });

      return;
    }

    const previewToken = result?.previewToken;

    const allowPartialImages =
      mode === "confirm" &&
      Boolean(result?.skippedImageRows?.length);

    if (mode === "confirm" && !previewToken) {
      setResult({
        error: "Preview authorization missing. Preview again."
      });
      return;
    }

    running.current = true;

    const controller = new AbortController();
    uploadRequest.current = controller;

    setBusy(true);
    setResult(null);
    setPage(1);
    setUploadPercent(0);
    setProcessing(false);

    try {
      const totalBytes = file.size + (zip?.size ?? 0);

      const report = (bytes: number) =>
        setUploadPercent(
          Math.min(
            100,
            Math.round(bytes * 100 / totalBytes)
          )
        );

      const csvId = await uploadImportFile(
        "csv",
        file,
        staged.current,
        report,
        controller.signal
      );

      const zipId = zip
        ? await uploadImportFile(
            "zip",
            zip,
            staged.current,
            bytes => report(file.size + bytes),
            controller.signal
          )
        : null;

      const form = new FormData();

      form.set("csvUploadId", csvId);

      if (zipId) {
        form.set("zipUploadId", zipId);
      }

      form.set("mode", mode);

      form.set(
        "allowPartialImages",
        String(allowPartialImages)
      );

      form.set(
        "downloadImages",
        String(autoDownloadImages)
      );

      if (previewToken && mode === "confirm") {
        form.set("previewToken", previewToken);
      }

      setUploadPercent(100);
      setProcessing(true);

      const response = await fetch(
        "/api/admin/products/import",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          body: form,
          signal: controller.signal
        }
      );

      const data = await response.json() as Result;

      if (
        response.ok &&
        mode === "preview" &&
        data.preview &&
        !data.previewToken
      ) {
        throw new Error(
          "Preview authorization was not returned by the server."
        );
      }

      setResult(
        response.ok
          ? data
          : {
              ...data,
              error: data.error || "Import failed."
            }
      );
    } catch (error) {
      setResult({
        error: controller.signal.aborted
          ? "Upload paused. Retry with the same selected files to resume."
          : error instanceof Error
            ? error.message
            : "Import service unavailable. Retry preview."
      });
    } finally {
      running.current = false;
      setBusy(false);
      uploadRequest.current = null;
      setProcessing(false);
      setUploadPercent(null);
    }
  }

  const countCreated = result?.created ?? result?.outcomes?.length ?? 0;
  const countSkipped = result?.skipped ?? result?.errors?.filter(item => /already exists|create-only import skipped/i.test(item.error)).length ?? 0;
  const countFailed = result?.failed ?? Math.max(0, (result?.errors?.length ?? 0) - countSkipped);

  return <section className="skad-import" aria-labelledby="import-title">
    <header className="skad-import-header">
      <div>
        <div className="skad-import-eyebrow"><Sparkles size={14} /> PRODUCT CATALOG</div>
        <h1 id="import-title">Bulk Product Import</h1>
        <p>Add new products, variants, and their images from one reviewed CSV batch.</p>
      </div>
      <div className="skad-import-header-actions">
        <Link className="skad-import-export" href="/api/admin/products/export"><ArrowDownToLine size={17} /> Export Products</Link>
        <Link className="skad-import-template" href="/api/admin/products/import/template"><ArrowDownToLine size={17} /> Download CSV Template</Link>
      </div>
    </header>

    <nav className="skad-import-steps" aria-label="Import steps">
      {[
        { title: "Upload Files", detail: "CSV and optional ZIP" },
        { title: "Match Images", detail: "Photo numbers and URLs" },
        { title: "Preview Products", detail: "Review before import" },
        { title: "Import Results", detail: "Created, skipped, failed" },
      ].map((item, index) => <div className={`skad-import-step ${index < step ? "is-complete" : ""} ${index === step ? "is-current" : ""}`} key={item.title}>
        <span className="skad-import-step-icon">{index < step ? <Check size={16} /> : `0${index + 1}`}</span>
        <span className="skad-import-step-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
        {index < 3 && <span className="skad-import-step-line" aria-hidden="true" />}
      </div>)}
    </nav>

    <div className="skad-import-section-heading">
      <div><span className="skad-import-kicker">STEP 01</span><h2>Upload your files</h2><p>Start with the product spreadsheet. A numbered image ZIP is optional.</p></div>
      <span className="skad-import-create-only"><ShieldCheck size={15} /> Review before applying changes</span>
    </div>

    <div className="skad-import-upload-grid">
        <UploadCard
        kind="csv" title="CSV Product File" description="Product details, pricing, options and image references."
        icon={<FileSpreadsheet size={22} />} selected={file} error={fileErrors.csv} disabled={busy}
        inputRef={csvInput} accept=".csv,text/csv" limit="Maximum file size · 100 MB"
        onSelect={selected => choose("csv", selected)} onDrop={event => drop("csv", event)}
      />
      <UploadCard
        kind="zip" title="Product Images ZIP" description="Match photos using exact numeric filenames from your CSV."
        icon={<FileArchive size={22} />} selected={zip} error={fileErrors.zip} disabled={busy}
        inputRef={zipInput} accept=".zip,application/zip" limit="Optional · Maximum 500 MB"
        onSelect={selected => choose("zip", selected)} onDrop={event => drop("zip", event)}
        onRemove={() => {
          if (running.current) return;
          delete staged.current.zip;
          setZip(null); setResult(null); setFileErrors(current => ({ ...current, zip: "" })); if (zipInput.current) zipInput.current.value = ""; }}
      />
    </div>

    <label className="skad-import-auto-download">
      <input type="checkbox" checked={autoDownloadImages} disabled={busy} onChange={event => { setAutoDownloadImages(event.target.checked); setResult(null); }} />
      <span className="skad-import-auto-download-mark"><Check size={13} /></span>
      <span><strong>Automatically Download Images</strong><small>{autoDownloadImages ? "HTTPS image URLs are checked, downloaded, and stored with the product." : "External HTTPS URLs remain linked as-is; no server download is performed. Source URLs must remain available."}</small></span>
    </label>

    {busy && <div className="skad-import-progress" role="status">
      <div className="skad-import-progress-icon"><LoaderCircle size={18} className="skad-import-spin" /></div>
      <div className="skad-import-progress-copy">
        <strong>{processing ? "Processing your import" : "Uploading your files"}</strong>
        <span>{processing ? "Validating images and preparing product records…" : `Sending files${uploadPercent === null ? "…" : ` · ${uploadPercent}%`}`}</span>
        {!processing && <progress max={100} value={uploadPercent ?? 0} aria-label="File upload progress" />}
      </div>
      {!processing && <button className="skad-import-cancel" type="button" onClick={() => uploadRequest.current?.abort()}>Pause upload</button>}
    </div>}

    <div className="skad-import-actions">
      <div className="skad-import-small-note"><ShieldCheck size={15} /> Blank cells preserve existing values. New rows can be created as inactive drafts when price is missing.{!autoDownloadImages && " External URL images will remain remote links."}</div>
      <button className="skad-import-primary" type="button" disabled={!file || busy || Boolean(fileErrors.csv || fileErrors.zip)} onClick={() => send("preview")}>
        {busy ? <><LoaderCircle size={17} className="skad-import-spin" /> Working…</> : <>{result?.errors?.length ? "Retry validation & preview" : "Match images & preview"} <ArrowRight size={17} /></>}
      </button>
    </div>

    {result?.error && <div className="skad-import-alert" role="alert"><CircleAlert size={19} /><div><strong>We couldn’t complete this step</strong><p>{result.error}</p></div></div>}

    {!!result?.errors?.length && <div className="skad-import-errors">
      <div><CircleAlert size={18} /><div><strong>Rows need attention</strong><span>Fix the listed rows, then upload the corrected files.</span></div></div>
      <ul>{result.errors.map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row || "—"}: {item.error}</li>)}</ul>
      <button type="button" className="skad-import-secondary" onClick={() => downloadErrorReport(result.errors!)}>Download CSV Error Report <ArrowDownToLine size={15} /></button>
    </div>}

    {!!result?.skippedImageRows?.length && (
      <div className="skad-import-errors">
        <div>
          <CircleAlert size={18} />
          <div>
            <strong>
              {result.skippedImageRows.length} product row(s)
              excluded because images are missing
            </strong>
            <span>
              Other matched products remain available.
              Excluded products will not be modified.
            </span>
          </div>
        </div>

        <ul>
          {result.skippedImageRows.map(item => (
            <li key={item.row}>
              Row {item.row}: {item.error}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="skad-import-secondary"
          onClick={() =>
            downloadErrorReport(result.skippedImageRows!)
          }
        >
          Download Missing Images Report
          <ArrowDownToLine size={15} />
        </button>
      </div>
    )}

    {result?.preview && <>
      <div className="skad-import-section-heading skad-import-preview-heading">
        <div><span className="skad-import-kicker">STEP 02 — 03</span><h2>Review image matches &amp; products</h2><p>Review creates, updates, category additions and warnings before confirming.</p></div>
        <span className="skad-import-ready"><CheckCircle2 size={15} /> {result.totalRows ?? result.preview.length} CSV rows</span>
      </div>

      <div className="skad-import-result-cards">
        <ResultCard title="New products" value={result.newProducts ?? 0} icon={<PackageCheck size={19} />} tone="success" />
        <ResultCard title="Product updates" value={result.updates ?? 0} icon={<RefreshCw size={19} />} tone="neutral" />
        <ResultCard title="New categories" value={result.newCategories ?? 0} icon={<CheckCircle2 size={19} />} tone="neutral" />
        <ResultCard title="New subcategories" value={result.newSubcategories ?? 0} icon={<CheckCircle2 size={19} />} tone="neutral" />
      </div>

      <div className="skad-import-pagination">
        <span>
          Showing {totalPreview ? (visiblePage - 1) * pageSize + 1 : 0}
          {" – "}
          {Math.min(visiblePage * pageSize, totalPreview)}
          {" of "}{totalPreview} ready products
        </span>

        <div>
          <label>
            Products per page
            <select
              value={pageSize}
              onChange={event => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <button
            type="button"
            disabled={visiblePage <= 1}
            onClick={() => setPage(visiblePage - 1)}
          >Previous</button>

          <strong>{visiblePage} / {totalPages}</strong>

          <button
            type="button"
            disabled={visiblePage >= totalPages}
            onClick={() => setPage(visiblePage + 1)}
          >Next</button>
        </div>
      </div>

      <div className="skad-import-matches">
        {visibleProducts.map(product => <article className="skad-import-match" key={product.row}>
          <div className="skad-import-match-head">
            <div><span className="skad-import-row-label">CSV ROW {product.row}</span><h3>{product.name}</h3><p>SKU: {product.sku || "Not provided"}</p></div>
            <span className="skad-import-ready"><CheckCircle2 size={14} /> {product.action}</span>
          </div>
          <div className="skad-import-photo-numbers"><ImageIcon size={15} /><strong>Photo numbers</strong><span>{product.photoNumbers.length ? product.photoNumbers.join(" · ") : "No numbered photos"}</span></div>
          {!!product.warnings.length && <div className="skad-import-small-note"><CircleAlert size={15} /> {product.warnings.join(" ")}</div>}
          <div className="skad-import-thumbnails">
            {product.images.map((image, index) => <figure key={`${image.number}-${index}`}>
              <div className="skad-import-thumb-frame">{image.preview ? <Image src={image.preview} alt={`${product.name} image ${index + 1}`} width={112} height={92} unoptimized /> : <span className="skad-import-external-thumb"><ImageIcon size={19} />
                {image.external ? "REMOTE URL" : "PREVIEW UNAVAILABLE"}</span>}{index === 0 && <span className="skad-import-primary-badge">PRIMARY</span>}</div>
              <figcaption>{image.number.startsWith("URL") ? "Image URL" : `Photo ${image.number}`}</figcaption>
            </figure>)}
            {!product.images.length && <div className="skad-import-no-images">{product.imageStatus}</div>}
          </div>
        </article>)}
      </div>

      <div className="skad-import-table-wrap">
        <table className="skad-import-table">
          <thead><tr><th>Action</th><th>Name / SKU</th><th>Category</th><th>Pricing mode</th><th>Price</th><th>Stock</th><th>Images</th><th>Validation</th></tr></thead>
          <tbody>{visibleProducts.map(product => <tr key={product.row}>
            <td>{product.action}</td>
            <td><strong>{product.name}</strong><small>{product.sku || "No SKU"}</small></td>
            <td>{product.category}</td><td>{product.pricingMode.replaceAll("_", " ")}</td><td>₹{product.price.toLocaleString("en-IN")}</td><td>{product.stock}</td><td>{product.imageStatus} · {product.imageCount} / 20</td>
            <td><span className="skad-import-ready"><CheckCircle2 size={14} /> {product.validationStatus}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="skad-import-confirm-bar">
        <div><strong>Ready to apply changes to {result.preview.length} row{result.preview.length === 1 ? "" : "s"}?</strong><span>Products absent from this CSV remain unchanged.</span></div>
        <button className="skad-import-primary" type="button" disabled={busy || !file || !result.previewToken} onClick={() => send("confirm")}>
          {busy ? <><LoaderCircle size={17} className="skad-import-spin" /> Importing…</> : <><PackageCheck size={17} />
            {result.skippedImageRows?.length
              ? `Import ${result.preview.length} Ready Products`
              : "Confirm & Import"}</>}
        </button>
      </div>
    </>}

    {result?.created !== undefined && <section className="skad-import-results" aria-labelledby="import-results-title">
      <div className="skad-import-results-heading"><div><span className="skad-import-kicker">STEP 04</span><h2 id="import-results-title">Import results</h2><p>{countFailed ? "The batch finished with rows that need attention." : "Your product import is complete."}</p></div><span className={countFailed ? "skad-import-result-state is-warning" : "skad-import-result-state"}>{countFailed ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}{countFailed ? "Completed with issues" : "Completed"}</span></div>
      <div className="skad-import-result-cards">
        <ResultCard title="Created" value={countCreated} icon={<CheckCircle2 size={19} />} tone="success" />
        <ResultCard title="Updated" value={result.updated ?? 0} icon={<RefreshCw size={19} />} tone="neutral" />
        <ResultCard title="Skipped" value={countSkipped} icon={<RefreshCw size={19} />} tone="neutral" />
        <ResultCard title="Failed" value={countFailed} icon={<CircleAlert size={19} />} tone="warning" />
      </div>
      {!!result.outcomes?.length && <div className="skad-import-outcomes"><h3>Processed products</h3>{result.outcomes.map(item => <div key={`${item.row}-${item.slug}`}><span>Row {item.row}</span><strong>{item.slug}</strong><span className="skad-import-created-label"><CheckCircle2 size={14} /> {item.status === "updated" ? "Updated" : "Created"}</span></div>)}</div>}
      {!!result.errors?.length && <button type="button" className="skad-import-secondary" onClick={() => downloadErrorReport(result.errors!)}>Download CSV Error Report <ArrowDownToLine size={15} /></button>}
      {!countFailed && <p className="skad-import-success-note"><CheckCircle2 size={16} /> Products were added to your catalog. Review them in Products before publishing.</p>}
      <button type="button" className="skad-import-start-over" onClick={() => {
          staged.current = {};
          setPage(1);
          setFile(null); setZip(null); setResult(null); setFileErrors({}); if (csvInput.current) csvInput.current.value = ""; if (zipInput.current) zipInput.current.value = ""; }}>Start another import <ArrowRight size={15} /></button>
    </section>}

    <details className="skad-import-help">
      <summary>How CSV Import Works <span>CSV · Images · Variants · Safety</span></summary>
      <div className="skad-import-help-content">
        <p>One CSV row represents one product. Use the authenticated template and an active category name, slug, or ID. Optional JSON columns use the same data shapes as the existing product and variant forms. Prices, stock, and SKUs must come from approved catalog data.</p>
        <p>Enter numbered photos as comma-separated exact numbers, for example <code>1281, 1282, 1286</code>. These are three photos for that product. Files may be in nested folders; supported formats are JPG, JPEG, PNG, and WebP. Duplicate numeric filenames are reported as ambiguous. ZIP photos are ordered as listed and precede URL images; the first image is primary. Each product supports at most 20 images.</p>
        <p>HTTPS image URLs are checked for public addresses, redirects, content type, file signature, and the 5 MB per-image limit, then stored in configured persistent media storage. Existing matching products can be updated. Blank cells preserve existing values.</p>
        <p className="skad-import-help-limit">Upload limits: CSV 100 MB, ZIP 500 MB, URL images 500 MB, up to 1,000 products. Files upload in 2 MB chunks. Keep this page open to resume interrupted uploads. Preview is required before confirmation.</p>
      </div>
    </details>
  </section>;
}

function UploadCard({
  kind, title, description, icon, selected, error, inputRef, accept, limit, onSelect, onDrop, onRemove, disabled,
}: {
  kind: FileKind; title: string; description: string; icon: React.ReactNode; selected: File | null;
  disabled?: boolean; error?: string; inputRef: React.RefObject<HTMLInputElement | null>; accept: string; limit: string;
  onSelect: (file?: File) => void; onDrop: (event: React.DragEvent<HTMLDivElement>) => void; onRemove?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return <div className={`skad-import-upload-card ${error ? "has-error" : ""}`}>
    <div className="skad-import-upload-card-head"><span className={`skad-import-file-icon is-${kind}`}>{icon}</span><div><h3>{title}</h3><p>{description}</p></div>{kind === "zip" && <span className="skad-import-optional">OPTIONAL</span>}</div>
    <div className={`skad-import-dropzone ${dragging ? "is-dragging" : ""} ${selected ? "has-file" : ""}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) onDrop(event); }}>
      <input ref={inputRef} type="file" accept={accept} disabled={disabled} hidden onChange={event => { onSelect(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      {selected ? <div className="skad-import-selected-file"><span className="skad-import-selected-icon">{kind === "csv" ? <FileSpreadsheet size={21} /> : <FileArchive size={21} />}</span><span className="skad-import-selected-copy"><strong title={selected.name}>{selected.name}</strong><small>{formatBytes(selected.size)} · Ready to check</small></span><CheckCircle2 size={18} className="skad-import-file-check" /></div>
        : <><span className="skad-import-cloud-icon"><CloudUpload size={25} /></span><strong>Drop your {kind === "csv" ? "CSV file" : "images ZIP"} here</strong><span>or browse files from your device</span><button className="skad-import-browse" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>Choose {kind === "csv" ? "CSV file" : "ZIP file"}</button></>}
      {selected && <button className="skad-import-change-file" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>Change file</button>}
    </div>
    <div className="skad-import-card-footer"><span>{limit}</span>{selected && onRemove && <button type="button" disabled={disabled} onClick={onRemove}>Remove</button>}</div>
    {error && <p className="skad-import-file-error" role="alert"><CircleAlert size={14} /> {error}</p>}
  </div>;
}

function ResultCard({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone: string }) {
  return <div className={`skad-import-result-card is-${tone}`}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong></div></div>;
}
