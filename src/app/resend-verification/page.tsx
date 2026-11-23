"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import "@/components/customer-auth.css";

export default function ResendVerificationPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cooldown > 0) return;
    setBusy(true); setError(""); setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    try {
      const response = await fetch("/api/customer/resend-verification", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) setCooldown(Number(response.headers.get("Retry-After")) || 60);
        throw new Error(result.error || "Unable to process this request.");
      }
      setMessage("If this account needs verification, a new link will be sent. Please check your inbox and spam folder.");
      setCooldown(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process this request.");
    } finally { setBusy(false); }
  }

  return (
    <main className="skauth-page skauth-resend-page" id="main-content">
      <section className="skauth-shell" aria-labelledby="resend-title">
        <div className="skauth-brand">
          <div className="skauth-logo-frame"><img src="/srikalahasti-logo.png" alt="" className="skauth-logo" /></div>
          <strong>SRIKALAHASTI</strong><span>K A L A M K A R I</span>
        </div>
        <div className="skauth-ornament" aria-hidden="true">✦</div>
        <div className="skauth-heading">
          <p className="skauth-overline"><ShieldCheck size={14} /> ACCOUNT VERIFICATION</p>
          <h1 id="resend-title">Resend your link</h1>
          <p className="skauth-intro">Enter the email address used to create your account. We’ll send a fresh verification link if one is needed.</p>
        </div>
        <form className="skauth-form" onSubmit={submit}>
          <label>Email address<div className="skauth-input-wrap"><Mail size={17} aria-hidden="true" /><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={191} /></div></label>
          <button className="skauth-submit" type="submit" disabled={busy || cooldown > 0}>
            {busy ? "Please wait…" : cooldown > 0 ? `Try again in ${cooldown}s` : "Send verification email"}<ArrowRight size={17} />
          </button>
          {error && <div className="skauth-notice skauth-notice-error" role="alert"><strong>Unable to send link</strong><span>{error}</span></div>}
          {message && <div className="skauth-notice skauth-notice-success" role="status"><strong>Request received</strong><span>{message}</span></div>}
          {cooldown > 0 && !error && <p className="skauth-cooldown" role="status">For your security, wait {cooldown} seconds before another request.</p>}
        </form>
        <div className="skauth-switch"><Link href="/login">← Back to sign in</Link></div>
        <div className="skauth-back"><Link href="/shop">Back to shop</Link><Link href="/contact">Need help?</Link></div>
      </section>
    </main>
  );
}
