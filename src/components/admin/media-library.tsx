"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Folder = { id: string; name: string; parentId: string | null; _count?: { assets: number; children: number } };
type Asset = { id: string; filename: string; storageKey: string; sizeBytes: number; photoNumber: string | null; folderId: string | null; folder: { id: string; name: string } | null; references: Array<{ id: string; placement: string; product: { id: string; name: string; slug: string } | null }> };
type DeletePreview = { products: Array<{ id: string; name: string }>; otherLocations: Array<{ type: string; name: string }>; unsupportedPlacements: string[]; untrackedProductReferences: Array<{ id: string; name: string }>; canDelete: boolean };

export default function MediaLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState("Checking persistent storage…");

  async function load() {
    const [mediaResponse, foldersResponse] = await Promise.all([
      fetch(`/api/admin/media?q=${encodeURIComponent(query)}${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ""}`),
      fetch("/api/admin/media/folders"),
    ]);
    if (!mediaResponse.ok || !foldersResponse.ok) { setNotice("Unable to load media. Please refresh."); return; }
    const media = await mediaResponse.json(); const folderData = await foldersResponse.json();
    setAssets(media.assets); setFolders(folderData.folders);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [query, folderId]); // eslint-disable-line react-hooks/exhaustive-deps
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
      const body = new FormData(); body.set("file", file); if (folderId) body.set("folderId", folderId);
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const data = await response.json(); setNotice(response.ok ? "Image uploaded to Media Library." : data.error || "Upload failed");
      if (response.ok) await load();
    } catch { setNotice("Upload failed. Check storage and retry."); }
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
      if (!preview.canDelete) { setNotice(`Global deletion blocked; untracked references: ${blockers.join(", ")}`); return; }
      if (!window.confirm(`Delete permanently? This removes the image from:\n${refs}\nThe physical file will be deleted after database updates.`)) return;
      const response = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const result = await response.json(); setNotice(response.ok ? "Image deleted globally." : result.error || "Deletion incomplete"); await load();
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

  return <section style={{ padding: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><h1>Media Library</h1><p>Manage uploaded images and their product references.</p></div>
      <label style={{ cursor: "pointer", padding: "10px 16px", background: "#10213b", color: "white", borderRadius: 8 }}>{busy ? "Uploading…" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
    </div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search filename or photo number" aria-label="Search media" />
      <select value={folderId} onChange={event => setFolderId(event.target.value)}><option value="">All folders</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
      <button onClick={createFolder}>New folder / subfolder</button>
      {folderId && <>{folders.find(folder => folder.id === folderId) && <button onClick={() => void renameFolder(folders.find(folder => folder.id === folderId)!)}>Rename folder</button>}<button onClick={() => { const folder = folders.find(item => item.id === folderId); if (folder) void deleteFolder(folder); }}>Delete folder</button></>}
      <button disabled={!selected.length} onClick={() => void bulkDelete()}>Delete selected ({selected.length})</button>
      <button onClick={async () => { const response = await fetch("/api/admin/media/deletion-jobs/retry", { method: "POST" }); const data = await response.json(); setNotice(response.ok ? `Deletion retries complete: ${data.removed} removed, ${data.remaining} remain.` : data.error); }}>Retry failed file deletions</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    <p role="status">{storageMessage}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(225px,1fr))", gap: 16 }}>
      {assets.map(asset => <article key={asset.id} style={{ background: "white", border: "1px solid #e4e0d8", borderRadius: 12, padding: 12, minWidth: 0 }}>
        <label><input type="checkbox" checked={selected.includes(asset.id)} onChange={event => setSelected(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))} /> Select</label>
        <a href={`/api/media/products/${asset.storageKey}`} target="_blank" rel="noreferrer"><Image src={`/api/media/products/${asset.storageKey}`} alt={asset.filename} width={320} height={220} unoptimized style={{ width: "100%", height: 180, objectFit: "contain", background: "#f7f5f0" }} /></a>
        <strong style={{ display: "block", overflowWrap: "anywhere" }}>{asset.filename}</strong>
        <small>{(asset.sizeBytes / 1024).toFixed(0)} KB{asset.photoNumber ? ` · Photo ${asset.photoNumber}` : ""}</small>
        <p>{asset.references.length ? `Used by ${asset.references.filter(ref => ref.product).map(ref => ref.product!.name).join(", ")}` : "Unused"}</p>
        <a href={`/api/media/products/${asset.storageKey}`} download={asset.filename}>Download</a>
        <label style={{ display: "block", marginTop: 8 }}>Move to <select value={asset.folderId ?? ""} onChange={event => void move(asset, event.target.value)}><option value="">All / unfiled</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        {asset.references.filter(ref => ref.product).map(ref => <button key={ref.id} onClick={() => void removeFromProduct(asset, ref.product!.id)}>Remove from {ref.product!.name}</button>)}
        <button onClick={() => void deletePermanently(asset)}>Delete permanently</button>
      </article>)}
    </div>
    {!assets.length && <p>No media found. Upload an image or import products with images.</p>}
  </section>;
}
