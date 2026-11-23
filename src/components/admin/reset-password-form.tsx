"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { getPasswordRequirements, isAdminResetTokenFormatValid } from "@/lib/admin/password-reset-validation";

export default function ResetPasswordForm() {
  const [token, setToken] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const requirements = getPasswordRequirements(password);
  const validToken = isAdminResetTokenFormatValid(token);

  useEffect(() => {
    const tokenFromFragment = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(tokenFromFragment);
    window.history.replaceState(null, "", window.location.pathname);
    setInitialized(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error || "This reset link is invalid or expired. Request a new link.");
      } else setSuccess(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally { setLoading(false); }
  }

  const items: [keyof typeof requirements, string][] = [
    ["length", "At least 12 characters"], ["lowercase", "A lowercase letter"],
    ["uppercase", "An uppercase letter"], ["number", "A number"], ["symbol", "A symbol"],
  ];

  return (
    <main className="sk-admin-recovery">
      <section className="sk-recovery-card">
        <div className="sk-recovery-brand"><div className="sk-recovery-logo-frame"><img src="/srikalahasti-logo.png" alt="Srikalahasti Kalamkari" /></div><strong>SRIKALAHASTI</strong><span>K A L A M K A R I</span></div>
        <div className="sk-recovery-ornament" aria-hidden="true">✦</div>
        <p className="sk-recovery-label"><ShieldCheck size={14} /> SECURE ADMIN RECOVERY</p>
        <h1>Reset password</h1>
        {success ? <><p className="sk-recovery-notice" role="status">Your password has been updated. Sign in with your new password.</p><Link href="/admin/login" className="sk-recovery-back">Return to Admin Login</Link></> : !initialized ? <p className="sk-recovery-intro" role="status">Checking your secure reset link…</p> : !validToken ? <><p className="sk-recovery-error" role="alert">This reset link is missing or invalid. Request a new link to continue.</p><Link href="/admin/forgot-password" className="sk-recovery-back">Request a new link</Link></> : <>
          <p className="sk-recovery-intro">Choose a new password for your administrator account.</p>
          <form onSubmit={submit}>
            <label htmlFor="reset-password">New password</label>
            <div className="sk-recovery-input"><LockKeyhole size={18} aria-hidden="true" /><input id="reset-password" type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /><button className="sk-reset-toggle" type="button" onClick={() => setShow(value => !value)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            <ul className="sk-reset-requirements">{items.map(([key, label]) => <li key={key} data-met={requirements[key]}>{label}</li>)}</ul>
            <label htmlFor="reset-confirm">Confirm new password</label>
            <div className="sk-recovery-input"><LockKeyhole size={18} aria-hidden="true" /><input id="reset-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
            {error && <p className="sk-recovery-error" role="alert">{error}</p>}
            <button type="submit" disabled={loading || !Object.values(requirements).every(Boolean) || password !== confirmation}>{loading ? "Updating…" : "Reset Password"}</button>
          </form>
          <Link href="/admin/login" className="sk-recovery-back">← Return to Admin Login</Link>
        </>}
        <p className="sk-recovery-copyright">© {new Date().getFullYear()} Srikalahasti Kalamkari. All rights reserved.</p>
      </section>
    </main>
  );
}
