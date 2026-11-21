"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, ArrowRight } from "lucide-react";
import "./forgot-password.css";

export default function AdminForgotPassword() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(false);
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      if (!response.ok) setError("Unable to process this request right now. Please try again later.");
      else setNotice(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sk-admin-recovery">
      <div className="sk-recovery-card">
        <div className="sk-recovery-brand">
          <div className="sk-recovery-logo-frame">
            <img
              src="/srikalahasti-logo.png"
              alt="Srikalahasti Kalamkari"
            />
          </div>

          <strong>SRIKALAHASTI</strong>
          <span>K A L A M K A R I</span>
        </div>

        <div className="sk-recovery-ornament" aria-hidden="true">
          ✦
        </div>

        <p className="sk-recovery-label">
          <ShieldCheck size={14} />
          SECURE ADMIN RECOVERY
        </p>

        <h1>Forgot password?</h1>

        <p className="sk-recovery-intro">
          Enter your administrator email address. If it matches an account, we’ll send a secure reset link.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="sk-recovery-email">
            Admin email address
          </label>

          <div className="sk-recovery-input">
            <Mail size={18} aria-hidden="true" />
            <input
              id="sk-recovery-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your admin email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send Reset Link"}
            <ArrowRight size={17} />
          </button>

          {notice && (
            <p className="sk-recovery-notice" role="status">
              If an administrator account matches that email, a reset link will be sent shortly. The link expires in 30 minutes.
            </p>
          )}
          {error && <p className="sk-recovery-error" role="alert">{error}</p>}
        </form>

        <Link href="/admin/login" className="sk-recovery-back">
          ← Back to Admin Login
        </Link>

        <p className="sk-recovery-copyright">
          © {new Date().getFullYear()} Srikalahasti Kalamkari.
          All rights reserved.
        </p>
      </div>
    </main>
  );
}
