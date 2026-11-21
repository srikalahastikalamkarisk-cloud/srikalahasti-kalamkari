"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TicketPercent, Plus, Search, X, Pencil,
  RefreshCw, AlertCircle,
} from "lucide-react";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscountAmount: string | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
};

type FormData = {
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscountAmount: string;
  usageLimit: string;
  startsAt: string;
  expiresAt: string;
};

const emptyForm: FormData = {
  code: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  minimumOrderAmount: "0",
  maximumDiscountAmount: "",
  usageLimit: "",
  startsAt: "",
  expiresAt: "",
};

const money = (value: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value));

const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "No expiry";

const toLocalInput = (value: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        q: search,
      });
      const response = await fetch(
        `/api/admin/coupons?${params}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Unable to load coupons");
      const data = await response.json();
      setCoupons(data.coupons);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = (key: keyof FormData, value: string) =>
    setForm(current => ({ ...current, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description ?? "",
      discountType: coupon.discountType as FormData["discountType"],
      discountValue: String(coupon.discountValue),
      minimumOrderAmount: String(coupon.minimumOrderAmount),
      maximumDiscountAmount: coupon.maximumDiscountAmount ?? "",
      usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
      startsAt: toLocalInput(coupon.startsAt),
      expiresAt: toLocalInput(coupon.expiresAt),
    });
    setError("");
    setShowForm(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const amount = Number(form.discountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid discount amount");
      return;
    }

    const payload = {
      ...(editing ? {} : { code: form.code }),
      description: form.description || null,
      discountType: form.discountType,
      discountValue: amount,
      minimumOrderAmount: Number(form.minimumOrderAmount),
      maximumDiscountAmount: form.maximumDiscountAmount
        ? Number(form.maximumDiscountAmount) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      startsAt: form.startsAt
        ? new Date(form.startsAt).toISOString() : null,
      expiresAt: form.expiresAt
        ? new Date(form.expiresAt).toISOString() : null,
    };

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing
          ? `/api/admin/coupons/${encodeURIComponent(editing.id)}`
          : "/api/admin/coupons",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.issues?.map((i: { message: string }) => i.message).join(", ")
          || result.error || "Unable to save coupon"
        );
      }
      setShowForm(false);
      setNotice(editing ? "Coupon updated" : "Coupon created as disabled");
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (coupon: Coupon) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/coupons/${encodeURIComponent(coupon.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !coupon.isActive }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Update failed");
      setNotice(coupon.isActive ? "Coupon disabled" : "Coupon enabled");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="skcoupons-heading">
        <div>
          <span className="skad-eyebrow">MARKETING TOOLS</span>
          <h1>Coupon Management</h1>
          <p>Create and manage promotional discount codes.</p>
        </div>
        <button className="skcoupons-primary" onClick={openCreate}>
          <Plus size={17} /> Create Coupon
        </button>
      </div>

      <div className="skcoupons-stats">
        <article>
          <span>Matching Coupons</span>
          <strong>{total}</strong>
        </article>
        <article>
          <span>Enabled on This Page</span>
          <strong>{coupons.filter(c => c.isActive).length}</strong>
        </article>
        <article>
          <span>Redemptions on This Page</span>
          <strong>{coupons.reduce((n, c) => n + c.usedCount, 0)}</strong>
        </article>
      </div>

      <section className="skcoupons-panel">
        <div className="skcoupons-panel-head">
          <div>
            <span className="skad-eyebrow">PROMOTIONAL CODES</span>
            <h2>All Coupons</h2>
          </div>
          <button className="skcoupons-refresh" onClick={() => void load()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {notice && <p className="skcoupons-notice">{notice}</p>}
        {error && !showForm && (
          <p className="skcoupons-error">
            <AlertCircle size={16} /> {error}
          </p>
        )}

        <form
          className="skcoupons-search"
          onSubmit={event => {
            event.preventDefault();
            setPage(1);
            setSearch(query.trim());
          }}
        >
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search coupon code"
            />
          </label>
          <button type="submit">Search</button>
        </form>

        {loading ? (
          <div className="skcoupons-empty">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="skcoupons-empty">
            <TicketPercent size={35} />
            <h3>No coupons found</h3>
            <p>Create your first promotional coupon.</p>
          </div>
        ) : (
          <div className="skcoupons-table-wrap">
            <table className="skcoupons-table">
              <thead>
                <tr>
                  <th>COUPON</th>
                  <th>DISCOUNT</th>
                  <th>MINIMUM ORDER</th>
                  <th>USAGE</th>
                  <th>EXPIRY</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(coupon => (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                      <small>{coupon.description || "No description"}</small>
                    </td>
                    <td>
                      {coupon.discountType === "PERCENTAGE"
                        ? `${coupon.discountValue}%`
                        : money(coupon.discountValue)}
                    </td>
                    <td>{money(coupon.minimumOrderAmount)}</td>
                    <td>
                      {coupon.usedCount} / {coupon.usageLimit ?? "Unlimited"}
                    </td>
                    <td>{dateLabel(coupon.expiresAt)}</td>
                    <td>
                      <span className={
                        coupon.isActive
                          ? "skcoupons-status active"
                          : "skcoupons-status"
                      }>
                        {coupon.isActive ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <div className="skcoupons-actions">
                        <button onClick={() => openEdit(coupon)}>
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          disabled={saving}
                          onClick={() => void toggle(coupon)}
                        >
                          {coupon.isActive ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="skcoupons-pagination">
          <span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </button>
            <button
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {showForm && (
        <div className="skcoupons-overlay">
          <div className="skcoupons-dialog" role="dialog" aria-modal="true"
            aria-label={editing ? "Edit coupon" : "Create coupon"}>
            <div className="skcoupons-dialog-head">
              <div>
                <span className="skad-eyebrow">COUPON DETAILS</span>
                <h2>{editing ? "Edit Coupon" : "Create Coupon"}</h2>
              </div>
              <button aria-label="Close" onClick={() => setShowForm(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={save}>
              <div className="skcoupons-fields">
                <label className="wide">
                  Coupon Code
                  <input
                    required
                    minLength={3}
                    maxLength={64}
                    disabled={!!editing}
                    value={form.code}
                    onChange={e => update("code", e.target.value.toUpperCase())}
                    placeholder="WELCOME10"
                  />
                </label>
                <label className="wide">
                  Description
                  <input
                    maxLength={500}
                    value={form.description}
                    onChange={e => update("description", e.target.value)}
                    placeholder="Optional description"
                  />
                </label>
                <label>
                  Discount Type
                  <select
                    value={form.discountType}
                    onChange={e => update("discountType", e.target.value)}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (₹)</option>
                  </select>
                </label>
                <label>
                  Discount Value
                  <input required type="number" min="0.01" step="0.01"
                    value={form.discountValue}
                    onChange={e => update("discountValue", e.target.value)}
                  />
                </label>
                <label>
                  Minimum Order (₹)
                  <input type="number" min="0" step="0.01"
                    value={form.minimumOrderAmount}
                    onChange={e => update("minimumOrderAmount", e.target.value)}
                  />
                </label>
                <label>
                  Maximum Discount (₹)
                  <input type="number" min="0.01" step="0.01"
                    value={form.maximumDiscountAmount}
                    onChange={e => update("maximumDiscountAmount", e.target.value)}
                  />
                </label>
                <label>
                  Usage Limit
                  <input type="number" min="1" step="1"
                    value={form.usageLimit}
                    onChange={e => update("usageLimit", e.target.value)}
                    placeholder="Unlimited"
                  />
                </label>
                <label>
                  Start Date
                  <input type="datetime-local"
                    value={form.startsAt}
                    onChange={e => update("startsAt", e.target.value)}
                  />
                </label>
                <label>
                  Expiry Date
                  <input type="datetime-local"
                    value={form.expiresAt}
                    onChange={e => update("expiresAt", e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p className="skcoupons-error">
                  <AlertCircle size={16} /> {error}
                </p>
              )}

              <div className="skcoupons-dialog-footer">
                <button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button className="skcoupons-primary" type="submit"
                  disabled={saving}>
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
