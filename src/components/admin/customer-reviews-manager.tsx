"use client";

import "./customer-content-actions.css";

import { useCallback, useEffect, useState } from "react";
import { Check, Save, Star, Trash2, X } from "lucide-react";

type Review = {
  id: string;
  customerName: string;
  rating: number;
  reviewText: string;
  isVerified: boolean;
  isApproved: boolean;
  sortOrder: number;
};

type ReviewForm = Omit<Review, "id">;

const emptyForm: ReviewForm = {
  customerName: "",
  rating: 5,
  reviewText: "",
  isVerified: false,
  isApproved: false,
  sortOrder: 0,
};

export default function CustomerReviewsManager() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/customer-reviews");

      if (!response.ok) throw new Error("Unable to load reviews.");

      const data = await response.json();
      setReviews(data.reviews ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function edit(review: Review) {
    setEditingId(review.id);
    setForm({
      customerName: review.customerName,
      rating: review.rating,
      reviewText: review.reviewText,
      isVerified: review.isVerified,
      isApproved: review.isApproved,
      sortOrder: review.sortOrder,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (form.customerName.trim().length < 2 || form.reviewText.trim().length < 10) {
      setNotice("Enter a customer name and review of at least 10 characters.");
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        editingId
          ? `/api/admin/customer-reviews/${editingId}`
          : "/api/admin/customer-reviews",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save review.");
      }

      reset();
      setNotice("Customer review saved successfully.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(review: Review, field: "isApproved" | "isVerified") {
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/customer-reviews/${review.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: !review[field] }),
        }
      );

      if (!response.ok) {
        throw new Error("Unable to update review status.");
      }

      setNotice("Review status updated.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(review: Review) {
    if (!window.confirm(`Permanently delete the review from ${review.customerName}?`)) {
      return;
    }

    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/customer-reviews/${review.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to delete review.");
      }

      if (editingId === review.id) reset();
      setNotice("Customer review deleted.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed.");
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

  const actionStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 12px",
    border: "1px solid #ded7c9",
    borderRadius: 9,
    background: "#fff",
    color: "#17243b",
    cursor: "pointer",
  };

  return (
    <section style={{ padding: 24, color: "#17243b" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: "#aa8441", fontWeight: 700, letterSpacing: 2 }}>
          CONTENT MANAGEMENT
        </p>
        <h1 style={{ fontSize: 30, margin: "8px 0" }}>Customer Reviews</h1>
        <p>Manage authentic customer feedback. Only approved reviews appear on the homepage.</p>
      </header>

      <div style={{
        background: "#faf8f3",
        border: "1px solid #e7dfcf",
        borderRadius: 18,
        padding: 22,
        marginBottom: 28,
      }}>
        <h2 style={{ marginBottom: 18 }}>
          {editingId ? "Edit Customer Review" : "Add Customer Review"}
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}>
          <label>
            <strong>Customer Name</strong>
            <input
              style={{ ...fieldStyle, marginTop: 8 }}
              value={form.customerName}
              maxLength={120}
              placeholder="Customer name"
              onChange={event => setForm(current => ({
                ...current,
                customerName: event.target.value,
              }))}
            />
          </label>

          <label>
            <strong>Star Rating</strong>
            <select
              style={{ ...fieldStyle, marginTop: 8 }}
              value={form.rating}
              onChange={event => setForm(current => ({
                ...current,
                rating: Number(event.target.value),
              }))}
            >
              {[5, 4, 3, 2, 1].map(rating => (
                <option key={rating} value={rating}>
                  {rating} Star{rating !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
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

        <label style={{ display: "block", marginTop: 18 }}>
          <strong>Customer Review (English)</strong>
          <textarea
            style={{ ...fieldStyle, marginTop: 8, minHeight: 120, resize: "vertical" }}
            value={form.reviewText}
            maxLength={3000}
            placeholder="Enter genuine customer feedback..."
            onChange={event => setForm(current => ({
              ...current,
              reviewText: event.target.value,
            }))}
          />
        </label>

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          margin: "18px 0",
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isVerified}
              onChange={event => setForm(current => ({
                ...current,
                isVerified: event.target.checked,
              }))}
            />
            Verified Customer
          </label>
        </div>

        <p style={{ fontSize: 13, color: "#746d61", marginBottom: 18 }}>
          Mark Verified only after confirming the feedback came from a real customer.
        </p>

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
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            <Save size={17} />
            {busy ? "Saving..." : editingId ? "Update Review" : "Add Review"}
          </button>

          {editingId && (
            <button type="button" disabled={busy} onClick={reset} style={actionStyle}>
              <X size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      {notice && <p role="status" style={{ marginBottom: 18 }}>{notice}</p>}

      <h2 style={{ marginBottom: 16 }}>Customer Reviews ({reviews.length})</h2>

      {loading && <p>Loading reviews...</p>}

      {!loading && reviews.length === 0 && (
        <p>No reviews yet. Add genuine customer feedback above.</p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
        gap: 18,
      }}>
        {reviews.map(review => (
          <article key={review.id} style={{
            background: "#fff",
            border: "1px solid #e6dfd3",
            borderRadius: 16,
            padding: 20,
            minWidth: 0,
          }}>
            <div style={{ display: "flex", gap: 4, color: "#b68b44", marginBottom: 12 }}>
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  size={18}
                  fill={index < review.rating ? "currentColor" : "none"}
                />
              ))}
            </div>

            <p style={{ lineHeight: 1.7, overflowWrap: "anywhere" }}>
              “{review.reviewText}”
            </p>

            <strong style={{ display: "block", marginTop: 14 }}>
              {review.customerName}
            </strong>

            <p style={{ fontSize: 13, color: "#766e61", margin: "8px 0 16px" }}>
              Order: {review.sortOrder}
              {" · "}
              {review.isApproved ? "Approved" : "Unapproved"}
              {" · "}
              {review.isVerified ? "Verified" : "Not Verified"}
            </p>

            <div className="sk-content-actions">
              <button type="button" disabled={busy} className="sk-content-btn is-edit" onClick={() => edit(review)}>
                <svg width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <path d="m15 5 4 4M4 20l4-1 12-12-4-4L4 15z"/>
                </svg>
                Edit
              </button>

              <button type="button" disabled={busy} className={`sk-content-btn ${review.isApproved ? "is-warning" : "is-success"}`} onClick={() => void updateStatus(review, "isApproved")}>
                <Check size={15} />
                {review.isApproved ? "Unapprove" : "Approve"}
              </button>

              <button type="button" disabled={busy} className={`sk-content-btn ${review.isVerified ? "is-warning" : "is-success"}`} onClick={() => void updateStatus(review, "isVerified")}>
                {review.isVerified ? "Unverify" : "Verify"}
              </button>

              <button type="button" disabled={busy} className="sk-content-btn is-delete" onClick={() => void remove(review)}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
