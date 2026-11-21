"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, History, Save, ChevronLeft, ChevronRight, LoaderCircle, AlertTriangle } from "lucide-react";
import "./inventory-manager.css";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  availabilityStatus: "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";
  pricingMode: string;
  updatedAt: string;
  category: { id: string; name: string };
  _count: { variants: number };
};

type Movement = {
  id: string;
  productName: string;
  productSku: string | null;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string | null;
  performedBy: string | null;
  createdAt: string;
};

const statuses = ["IN_STOCK", "OUT_OF_STOCK", "COMING_SOON"] as const;

export default function InventoryManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [statusValues, setStatusValues] = useState<Record<string, Product["availabilityStatus"]>>({});
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", availability });
      if (search.trim()) params.set("q", search.trim());
      if (lowStockOnly) params.set("lowStock", "true");
      const response = await fetch(`/api/admin/inventory?${params}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load inventory");
      setProducts(result.products);
      setTotal(result.pagination.total);
      setPages(Math.max(1, result.pagination.pages));
      setLowStockCount(result.lowStockCount);
      setThreshold(result.lowStockThreshold);
      setStocks(Object.fromEntries(result.products.map((product: Product) => [product.id, String(product.stock)])));
      setStatusValues(Object.fromEntries(result.products.map((product: Product) => [product.id, product.availabilityStatus])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inventory");
    } finally {
      setLoading(false);
    }
  }, [page, availability, search, lowStockOnly]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(product: Product) {
    const stock = Number(stocks[product.id]);
    if (!Number.isSafeInteger(stock) || stock < 0 || busyId) return;
    setBusyId(product.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          stock,
          ...(statusValues[product.id] !== product.availabilityStatus
            ? { availabilityStatus: statusValues[product.id] }
            : {}),
          note: "Admin inventory update",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save inventory");
      setMessage(`${product.name}: inventory saved.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save inventory");
    } finally {
      setBusyId("");
    }
  }

  async function showHistory(product: Product) {
    setHistoryProduct(product);
    setHistoryLoading(true);
    setMovements([]);
    try {
      const response = await fetch(`/api/admin/inventory?productId=${encodeURIComponent(product.id)}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load stock history");
      setMovements(result.movements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load stock history");
      setHistoryProduct(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="skin-page">
      <header className="skin-heading">
        <div>
          <span className="skad-eyebrow">STORE OPERATIONS</span>
          <h1>Inventory Management</h1>
          <p>Update product stock and availability, review low stock, and inspect movement history.</p>
        </div>
        <button type="button" className="skin-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <div className="skin-stats">
        <article><span>Products</span><strong>{total}</strong></article>
        <article className={lowStockCount ? "skin-alert" : ""}><span>Low stock (≤ {threshold})</span><strong>{lowStockCount}</strong></article>
      </div>

      <section className="skin-panel">
        <div className="skin-filters">
          <label className="skin-search"><Search size={17} /><input value={search} placeholder="Search name, SKU, category" onChange={event => { setPage(1); setSearch(event.target.value); }} /></label>
          <select aria-label="Filter availability" value={availability} onChange={event => { setPage(1); setAvailability(event.target.value); }}>
            <option value="all">All availability</option>
            <option value="IN_STOCK">In stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="COMING_SOON">Coming soon</option>
          </select>
          <label className="skin-low-stock"><input type="checkbox" checked={lowStockOnly} onChange={event => { setPage(1); setLowStockOnly(event.target.checked); }} /> Low stock only</label>
        </div>

        {error && <p className="skin-error" role="alert"><AlertTriangle size={16} />{error}</p>}
        {message && <p className="skin-success" role="status">{message}</p>}
        {loading ? <div className="skin-empty"><LoaderCircle className="skin-spin" />Loading inventory…</div> : products.length === 0 ? <div className="skin-empty">No products match these inventory filters.</div> : (
          <div className="skin-table-wrap">
            <table className="skin-table">
              <thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>STOCK</th><th>AVAILABILITY</th><th>UPDATED</th><th>ACTIONS</th></tr></thead>
              <tbody>{products.map(product => (
                <tr key={product.id}>
                  <td data-label="Product"><strong>{product.name}</strong><small>{product.sku || "No SKU"}{product._count.variants ? ` · ${product._count.variants} variants` : ""}</small></td>
                  <td data-label="Category">{product.category.name}</td>
                  <td data-label="Stock"><input className="skin-stock-input" aria-label={`Stock for ${product.name}`} type="number" min="0" max="2147483647" value={stocks[product.id] ?? product.stock} onChange={event => setStocks(current => ({ ...current, [product.id]: event.target.value }))} /></td>
                  <td data-label="Availability"><select value={statusValues[product.id] ?? product.availabilityStatus} aria-label={`Availability for ${product.name}`} onChange={event => setStatusValues(current => ({ ...current, [product.id]: event.target.value as Product["availabilityStatus"] }))}>{statuses.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></td>
                  <td data-label="Updated">{new Date(product.updatedAt).toLocaleDateString("en-IN")}</td>
                  <td data-label="Actions"><div className="skin-actions"><button type="button" onClick={() => void save(product)} disabled={busyId === product.id}><Save size={15} />{busyId === product.id ? "Saving" : "Save"}</button><button type="button" className="skin-history" onClick={() => void showHistory(product)}><History size={15} />History</button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="skin-pagination"><span>{total} products · page {page} of {pages}</span><div><button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><button type="button" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></div></div>
      </section>

      {historyProduct && <div className="skin-backdrop"><section className="skin-history-dialog" role="dialog" aria-modal="true" aria-labelledby="skin-history-title"><header><div><span className="skad-eyebrow">AUDIT TRAIL</span><h2 id="skin-history-title">{historyProduct.name}</h2></div><button type="button" onClick={() => setHistoryProduct(null)}>Close</button></header>{historyLoading ? <p>Loading movements…</p> : movements.length === 0 ? <p>No stock movements have been recorded yet.</p> : <div className="skin-movements">{movements.map(movement => <article key={movement.id}><div><strong>{movement.movementType.replaceAll("_", " ")}</strong><small>{new Date(movement.createdAt).toLocaleString("en-IN")}{movement.performedBy ? ` · ${movement.performedBy}` : ""}</small>{movement.note && <small>{movement.note}</small>}</div><span>{movement.quantityBefore} → {movement.quantityAfter} ({movement.quantityChange > 0 ? "+" : ""}{movement.quantityChange})</span></article>)}</div>}</section></div>}
    </div>
  );
}
