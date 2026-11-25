"use client";

import { prepareImageUpload } from "@/lib/admin/browser-image-optimizer";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Upload, Search, FolderPlus, FolderOpen,
  Pencil, Trash2, Download, RefreshCw,
  CheckCircle2, Info, ImageIcon, FolderInput,
  Unlink
} from "lucide-react";
import "./media-library.css";

type Folder = { id: string; name: string; parentId: string | null; _count?: { assets: number; children: number } };
type Asset = { id: string; filename: string; storageKey: string; sizeBytes: number; photoNumber: string | null; folderId: string | null; folder: { id: string; name: string } | null; references: Array<{ id: string; placement: string; product: { id: string; name: string; slug: string } | null }> };
type DeletePreview = { products: Array<{ id: string; name: string }>; otherLocations: Array<{ type: string; name: string }>; unsupportedPlacements: string[]; untrackedProductReferences: Array<{ id: string; name: string }>; canDelete: boolean };

export default function MediaLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState("Checking persistent storage…");


  const requestRef = useRef<AbortController | null>(null);
  const latestFilter = useRef({ query, folderId, page });

  useEffect(() => {
    latestFilter.current = { query, folderId, page };
  }, [query, folderId, page]);

  async function load() {
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);

    const filters = latestFilter.current;

    try {
      const [mediaResponse, foldersResponse] = await Promise.all([
        fetch(
          `/api/admin/media?page=${filters.page}&q=${encodeURIComponent(filters.query)}${filters.folderId ? `&folderId=${encodeURIComponent(filters.folderId)}` : ""}`,
          {
            signal: controller.signal,
            cache: "no-store"
          }
        ),
        fetch("/api/admin/media/folders", {
          signal: controller.signal,
          cache: "no-store"
        }),
      ]);

      if (controller.signal.aborted) return;

      if (!mediaResponse.ok || !foldersResponse.ok) {
        setNotice("Unable to load media. Please refresh.");
        return;
      }

      const [media, folderData] = await Promise.all([
        mediaResponse.json(),
        foldersResponse.json()
      ]);

      if (controller.signal.aborted) return;

      setAssets(media.assets);
      setHasMore(Boolean(media.hasMore));

      if (!media.assets.length && filters.page > 1) {
        setPage(filters.page - 1);
      }
      setFolders(folderData.folders);

      const visibleIds = new Set<string>(
        (media.assets as Asset[]).map(asset => asset.id)
      );

      setSelected(previous =>
        previous.filter(id => visibleIds.has(id))
      );

    } catch {
      if (!controller.signal.aborted) {
        setNotice("Unable to load media. Please retry.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    requestRef.current?.abort();

    const timer = window.setTimeout(
      () => { void load(); },
      query.trim() ? 350 : 0
    );

    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
    };
  }, [query, folderId, page]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/media/storage-status").then(async response => {
      const data = await response.json();
      if (active) setStorageMessage(data.ready ? `Persistent storage ready: ${data.storage}` : data.error || "Persistent storage is unavailable");
    }).catch(() => { if (active) setStorageMessage("Could not check persistent storage"); });
    return () => { active = false; };
  }, []);

  async function upload(file: File) {
    setBusy(true); setNotice("");
    try {
      const body = new FormData(); body.set("file", await prepareImageUpload(file, "general")); if (folderId) body.set("folderId", folderId);
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const data = await response.json(); setNotice(response.ok ? "Image uploaded to Media Library." : data.error || "Upload failed");
      if (response.ok) await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed. Check storage and retry."); }
    finally { setBusy(false); }
  }

  async function createFolder() {
    const name = window.prompt("Folder name"); if (!name) return;
    const response = await fetch("/api/admin/media/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name, parentId: folderId || null }) });
    const data = await response.json(); setNotice(response.ok ? "Folder created." : data.error || "Could not create folder"); await load();
  }
  async function renameFolder(folder: Folder) {
    const name = window.prompt("New folder name", folder.name); if (!name || name === folder.name) return;
    const response = await fetch("/api/admin/media/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", id: folder.id, name }) });
    const data = await response.json(); setNotice(response.ok ? "Folder renamed." : data.error || "Rename failed"); await load();
  }
  async function deleteFolder(folder: Folder) {
    if (!window.confirm(`Delete empty folder “${folder.name}”?`)) return;
    const response = await fetch("/api/admin/media/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: folder.id, name: folder.name }) });
    const data = await response.json(); setNotice(response.ok ? "Folder deleted." : data.error || "Delete failed"); if (folderId === folder.id) setFolderId(""); await load();
  }

  async function action(asset: Asset, payload: Record<string, unknown>) {
    const response = await fetch(`/api/admin/media/${asset.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Media action failed"); return data;
  }
  async function removeFromProduct(asset: Asset, productId: string) {
    if (!window.confirm("Remove this image from this product only? The library file will remain.")) return;
    try { await action(asset, { action: "remove-product", productId }); setNotice("Image removed from product; library file retained."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not detach image"); }
  }
  async function deletePermanently(asset: Asset) {
    try {
      const preview = await action(asset, { action: "preview-delete" }) as DeletePreview;
      const refs = [...preview.products.map(item => `• Product: ${item.name}`), ...preview.otherLocations.map(item => `• ${item.type}: ${item.name}`)].join("\n") || "• No tracked references";
      const blockers = [...preview.unsupportedPlacements, ...preview.untrackedProductReferences.map(item => `untracked product: ${item.name}`)];
      if (!preview.canDelete) {
        const references = [
          ...preview.products.map(item => `product: ${item.name}`),
          ...preview.otherLocations.map(item => `${item.type}: ${item.name}`),
          ...blockers,
        ];
        setNotice(`Deletion blocked; media is still referenced or protected: ${references.join(", ") || "Media Library folder or active cleanup claim"}`);
        return;
      }
      if (!window.confirm(`Queue this unreferenced file for deletion?\n${refs}\nThe background worker will remove it after a final reference check.`)) return;
      const response = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const result = await response.json(); setNotice(response.ok ? "Unreferenced image queued for safe background cleanup." : result.error || "Deletion incomplete"); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete image"); }
  }
  async function move(asset: Asset, value: string) {
    try { await action(asset, { action: "move", folderId: value || null }); setNotice("Image moved."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Move failed"); }
  }
  async function bulkDelete() {
    if (!selected.length || !window.confirm(`Permanently delete ${selected.length} selected image(s)? Each image will be checked for references.`)) return;
    for (const id of selected) { const asset = assets.find(item => item.id === id); if (asset) await deletePermanently(asset); }
    setSelected([]);
  }

  return <section className="skml-page">
    <div className="skml-header">
      <div><h1>Media Library</h1><p>Manage uploaded images and their product references.</p></div>
      <label className="skml-upload"><Upload size={18}/>{busy ? "Uploading…" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/x-ms-bmp,image/tiff,image/avif,.bmp,.tif,.tiff,.avif" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
    </div>
    <div className="skml-toolbar">
      <div className="skml-search"><Search size={18}/><input value={query} onChange={event => {
          setPage(1);
          setSelected([]);
          setQuery(event.target.value);
        }} placeholder="Search filename or photo number" aria-label="Search media" /></div>
      <div className="skml-folder-filter"><FolderOpen size={17}/><select aria-label="Filter by folder" value={folderId} onChange={event => {
          setPage(1);
          setSelected([]);
          setFolderId(event.target.value);
        }}><option value="">All folders</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div>
      <button className="skml-btn" onClick={createFolder}><FolderPlus size={16}/>New folder / subfolder</button>
      {folderId && <>{folders.find(folder => folder.id === folderId) && <button onClick={() => void renameFolder(folders.find(folder => folder.id === folderId)!)}><Pencil size={15}/>Rename folder</button>}<button onClick={() => { const folder = folders.find(item => item.id === folderId); if (folder) void deleteFolder(folder); }}><Trash2 size={15}/>Delete folder</button></>}
      <button className="skml-danger" disabled={!selected.length} onClick={() => void bulkDelete()}><Trash2 size={16}/>Delete selected ({selected.length})</button>
      <button onClick={async () => { const response = await fetch("/api/admin/media/deletion-jobs/retry", { method: "POST" }); const data = await response.json(); setNotice(response.ok ? `Deletion retries complete: ${data.removed} removed, ${data.remaining} remain.` : data.error); }}><RefreshCw size={15}/>Retry failed deletions</button>
      <button onClick={async () => { const response = await fetch("/api/admin/media/storage-audit", { cache: "no-store" }); const data = await response.json(); setNotice(response.ok ? `Storage audit: ${data.totalManagedFiles} files, ${data.unreferencedCandidates} unreferenced candidates (${(data.recoverableBytes / 1048576).toFixed(1)} MB), ${data.missingFiles.length} missing references.` : data.error); }}><Info size={15}/>Audit storage</button>
    </div>
    {notice && <p className="skml-notice" role="status"><Info size={17}/>{notice}</p>}
    <div className="skml-summary">
      <span className="skml-storage" role="status">
        {storageMessage.startsWith("Persistent storage ready:")
          ? <><CheckCircle2 size={17}/> Media storage connected</>
          : <><Info size={17}/>{storageMessage}</>}
      </span>
      <span className="skml-count">{loading ? "Loading media…" : `${assets.length} files · Page ${page}`}</span>
    </div>
    <div className="skml-grid">
      {assets.map(asset => <article key={asset.id} className={`skml-card ${selected.includes(asset.id) ? "is-selected" : ""}`}>
        <label className="skml-select"><input type="checkbox" checked={selected.includes(asset.id)} onChange={event => setSelected(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))} /> Select</label>
        <a href={`/api/media/products/${asset.storageKey}`} target="_blank" rel="noreferrer" className="skml-preview"><Image src={`/api/media/products/${asset.storageKey}`} alt={asset.filename} width={320} height={220} loading="lazy" decoding="async" unoptimized className="skml-image" /></a>
        <strong className="skml-filename" title={asset.filename}>{asset.filename}</strong>
        <small className="skml-size">{(asset.sizeBytes / 1024).toFixed(0)} KB{asset.photoNumber ? ` · Photo ${asset.photoNumber}` : ""}</small>
        <p className={`skml-usage ${asset.references.length ? "is-used" : ""}`}>{asset.references.length ? `Used by ${asset.references.filter(ref => ref.product).map(ref => ref.product!.name).join(", ")}` : "Unused"}</p>
        <a href={`/api/media/products/${asset.storageKey}`} download={asset.filename} className="skml-download"><Download size={16}/>Download</a>
        <label className="skml-move"><span><FolderInput size={15}/>Move to folder</span><select value={asset.folderId ?? ""} onChange={event => void move(asset, event.target.value)}><option value="">All / unfiled</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        {asset.references.filter(ref => ref.product).map(ref => <button className="skml-detach" key={ref.id} onClick={() => void removeFromProduct(asset, ref.product!.id)}><Unlink size={15}/>Remove from {ref.product!.name}</button>)}
        <button className="skml-danger skml-delete" onClick={() => void deletePermanently(asset)}><Trash2 size={16}/>Delete permanently</button>
      </article>)}
    </div>
    <div className="skml-toolbar" style={{ marginTop: 20, justifyContent: "center" }}>
      <button
        className="skml-btn"
        disabled={loading || page <= 1}
        onClick={() => {
          setSelected([]);
          setPage(current => Math.max(1, current - 1));
        }}
      >Previous</button>

      <span>Page {page}</span>

      <button
        className="skml-btn"
        disabled={loading || !hasMore}
        onClick={() => {
          setSelected([]);
          setPage(current => current + 1);
        }}
      >Next</button>
    </div>

    {!loading && !assets.length && <div className="skml-empty">
      <ImageIcon size={42} strokeWidth={1.3}/>
      <h2>No media found</h2>
      <p>Upload an image or import products with images.</p>
    </div>}
  </section>;
}
