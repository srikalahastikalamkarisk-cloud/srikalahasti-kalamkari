"use client";

import { useEffect, useState } from "react";

export default function CustomerMobileLink({ phone, verified, refresh }: { phone: string | null; verified: boolean; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(phone?.replace(/^\+?91/, "") ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [stage, setStage] = useState<"number" | "code">("number");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { if (cooldown < 1) return; const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  useEffect(() => { let active = true; void fetch("/api/customer/otp/status", { cache: "no-store" }).then(response => response.json()).then(result => { if (active) setEnabled(result.mobileOtp === true); }).catch(() => { if (active) setEnabled(false); }); return () => { active = false; }; }, []);
  async function send() {
    const national = number.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(national)) { setError("Enter a valid 10-digit Indian mobile number."); return; }
    setBusy(true); setError("");
    try {
      const send = await fetch("/api/customer/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `91${national}`, action: "send" }) });
      const result = await send.json(); if (!send.ok || typeof result.requestId !== "string") throw new Error(result.error || "Unable to send code.");
      setRequestId(result.requestId);
      setNumber(national); setStage("code"); setCooldown(60);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send code."); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/customer/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `+91${number}`, otp: code, requestId, currentPassword: password }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to link this number.");
      setMessage("Mobile number verified and linked."); setEditing(false); setStage("number"); setCode(""); setPassword(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify this number."); }
    finally { setBusy(false); }
  }
  if (!enabled) return null;
  return <div className="skauth-otp">
    <p>{verified ? "Verified mobile number" : "Mobile number not verified"}: <strong>{phone || "Not added"}</strong></p>
    {!editing ? <button type="button" onClick={() => { setEditing(true); setMessage(""); setError(""); }}>{verified ? "Change mobile number" : "Add and verify mobile number"}</button> : <>
      <label>Confirm your account password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      {stage === "number" ? <><label>Indian mobile number <span>+91</span><input type="tel" inputMode="numeric" autoComplete="tel-national" value={number} onChange={event => setNumber(event.target.value)} /></label><button type="button" disabled={busy || password.length < 1} onClick={send}>{busy ? "Sending…" : "Send verification code"}</button></> : <><label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button type="button" disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Verify and link"}</button><button type="button" disabled={busy || cooldown > 0} onClick={async () => { try { const gate = await fetch("/api/customer/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `91${number}`, action: "resend", requestId }) }); const payload = await gate.json(); if (!gate.ok) throw new Error(payload.error || "Too many resend requests."); setRequestId(payload.requestId); setCooldown(60); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend the code."); } }}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button><button type="button" onClick={() => { setStage("number"); setRequestId(""); }}>Change number</button></>}
      <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
