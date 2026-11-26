"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import "@/components/customer-auth.css";

function passwordStrength(password: string) {
  return {
    valid: password.length >= 6 && password.length <= 128
  };
}

export default function ResetPasswordPage() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const strength = passwordStrength(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setExpired(false);
    const form = new FormData(event.currentTarget);
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    const nextPassword = String(form.get("password") || "");
    if (!token) { setError("This password reset link is missing or invalid. Request a new reset email to continue."); setExpired(true); setBusy(false); return; }
    if (!strength.valid) { setError("Use a password with 6 to 128 characters."); setBusy(false); return; }
    if (nextPassword !== String(form.get("confirmPassword") || "")) { setError("Your passwords do not match."); setBusy(false); return; }
    try {
      const response = await fetch("/api/customer/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: nextPassword }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "expired" || result.code === "invalid") setExpired(true);
        throw new Error(result.error || "Unable to reset your password. Please try again.");
      }
      window.history.replaceState(null, "", window.location.pathname);
      setMessage("Your password has been updated. Sign in with your new password.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to reset your password. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="skauth-page skauth-reset-page" id="main-content">
      <section className="skauth-shell skauth-reset-shell" aria-labelledby="reset-title">
        <div className="skauth-brand">
          <div className="skauth-logo-frame"><img src="/srikalahasti-logo.png" alt="" className="skauth-logo" /></div>
          <strong>SRIKALAHASTI</strong><span>K A L A M K A R I</span>
        </div>
        <div className="skauth-ornament" aria-hidden="true">✦</div>
        <div className="skauth-heading">
          <p className="skauth-overline"><ShieldCheck size={14} /> SECURE ACCOUNT RECOVERY</p>
          <h1 id="reset-title">Choose a new password</h1>
          <p className="skauth-intro">Choose a password with at least 6 characters. Longer passwords are recommended.</p>
        </div>
        {message ? <div className="skauth-notice skauth-notice-success" role="status"><strong>Password updated</strong><span>{message}</span><Link className="skauth-submit skauth-result-button" href="/login">Continue to Sign In <ArrowRight size={17} /></Link></div> : <>
          <form className="skauth-form" onSubmit={submit}>
            <label>New password<div className="skauth-input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input name="password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={6} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Minimum 6 characters" /><button type="button" className="skauth-eye" onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <ul className="skauth-password-rules"><li className={strength.valid ? "is-met" : ""}>At least 6 characters</li><li>Longer passwords are recommended.</li></ul>
            <label>Confirm password<div className="skauth-input-wrap"><LockKeyhole size={17} aria-hidden="true" /><input name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" minLength={6} maxLength={128} required placeholder="Enter your new password again" /></div></label>
            <button className="skauth-submit" type="submit" disabled={busy}>{busy ? "Updating password…" : "Reset password"}<ArrowRight size={17} /></button>
            {error && <div className="skauth-notice skauth-notice-error" role="alert"><strong>{expired ? "Reset link unavailable" : "Unable to reset password"}</strong><span>{error}</span>{expired && <Link href="/forgot-password">Request a new reset email</Link>}</div>}
          </form>
          <div className="skauth-switch"><Link href="/login">Back to sign in</Link></div>
        </>}
        <div className="skauth-back"><Link href="/shop">Back to shop</Link><Link href="/contact">Need help?</Link></div>
      </section>
    </main>
  );
}
