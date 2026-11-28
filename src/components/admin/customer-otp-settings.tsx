"use client";

import { useEffect, useState } from "react";
import "./otp-management.css";

type Snapshot = {
  enabled: boolean; emailEnabled: boolean; effective: boolean; providerConfigured: boolean; widgetConfigured: boolean; channel: string;
  counts: { success: number; failure: number; rateLimited: number };
  activity: { maskedPhone: string | null; outcome: string; category: string | null; createdAt: string }[];
  providerUsage: { available: boolean; walletBalance: number | null; today: { sent: number | null; failed: number | null; charges: number | null } | null; month: { sent: number | null; failed: number | null; charges: number | null } | null };
  estimatedCostPerOtp: number;
};

export default function CustomerOtpSettings() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/admin/customer-otp", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load OTP settings.");
    setData(result);
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/customer-otp", { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load OTP settings.");
      if (active) setData(result);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load OTP settings."); });
    return () => { active = false; };
  }, []);
  async function toggle(field: "enabled" | "emailEnabled") {
    if (!data) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/customer-otp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: !data[field] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update OTP settings.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update OTP settings."); }
    finally { setBusy(false); }
  }
  const money = (count: number | null | undefined) =>
    count == null || !data
      ? "—"
      : new Intl.NumberFormat("en-IN", {
          style: "currency", currency: "INR"
        }).format(count * data.estimatedCostPerOtp);

  return <section className="sk-settings-card skotp-dashboard" id="customer-authentication" aria-labelledby="customer-authentication-title">
    <div className="sk-settings-card-heading"><div><h2 id="customer-authentication-title">Customer authentication</h2><p>Manage customer sign-in methods, SMS usage and estimated expenditure.</p></div></div>
    {!data ? <p role="status">{error || "Loading authentication settings…"}</p> : <>
      <div className="sk-settings-status-grid">
        <div><span>Mobile OTP login</span><strong>{data.enabled ? "Enabled" : "Disabled"}</strong></div>
        <div><span>Email and password login</span><strong>{data.emailEnabled ? "Enabled" : "Disabled"}</strong></div>
        <div><span>Effective status</span><strong className={data.effective ? "is-ready" : "is-review"}>{data.effective ? "Available" : "Blocked by runtime configuration"}</strong></div>
        <div><span>MSG91 Authkey</span><strong>{data.providerConfigured ? "Present in runtime" : "Not configured"}</strong></div>
        <div><span>MSG91 Widget</span><strong>{data.widgetConfigured ? "Configured" : "Not configured"}</strong></div>
        <div><span>Channel</span><strong>{data.channel}</strong></div>
        <div><span>Last 30 days</span><strong>{data.counts.success} success · {data.counts.failure} failed · {data.counts.rateLimited} rate limited</strong></div>
      </div>
      <div className="sk-settings-actions">
        <button type="button" className="sk-settings-secondary" disabled={busy || (!data.emailEnabled && data.enabled)} onClick={() => void toggle("enabled")}>{busy ? "Saving…" : data.enabled ? "Disable mobile OTP" : "Enable mobile OTP"}</button>
        <button type="button" className="sk-settings-secondary" disabled={busy || (data.emailEnabled && !data.enabled)} onClick={() => void toggle("emailEnabled")}>{busy ? "Saving…" : data.emailEnabled ? "Disable email login" : "Enable email login"}</button>
      </div>
      <div className="skotp-section">
        <h3>SMS usage & estimated expenditure</h3>
        <div className="skotp-metrics">
          <div><span>OTP SMS today</span><strong>{data.providerUsage.today?.sent ?? "—"}</strong></div>
          <div><span>OTP SMS this month</span><strong>{data.providerUsage.month?.sent ?? "—"}</strong></div>
          <div><span>Estimated spend today</span><strong>{money(data.providerUsage.today?.sent)}</strong></div>
          <div><span>Estimated monthly spend</span><strong>{money(data.providerUsage.month?.sent)}</strong></div>
        </div>
        <p className="skotp-muted">
          Estimated rate: ₹{data.estimatedCostPerOtp.toFixed(2)} per SMS.
          Actual charges, taxes and wallet balance are available in MSG91.
        </p>
        {!data.providerUsage.available && <p role="status">Provider usage could not be loaded. Please refresh.</p>}
      </div>
      <div className="skotp-recharge">
        <div>
          <h3>MSG91 Wallet & Recharge</h3>
          <p>View actual balance, invoices and recharge your account securely.</p>
        </div>
        <a className="sk-settings-secondary" href="https://control.msg91.com/" target="_blank" rel="noopener noreferrer">Open MSG91 ↗</a>
      </div>
      <button type="button" className="sk-settings-secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await load(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh usage."); }
        finally { setBusy(false); }
      }}>Refresh usage</button>
      <details className="skotp-activity"><summary>Recent OTP activity</summary>
      {data.activity.length ? <div style={{ overflowX: "auto" }}><table><thead><tr><th>Mobile</th><th>Result</th><th>Reason</th><th>Time</th></tr></thead><tbody>{data.activity.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{item.maskedPhone || "Unavailable"}</td><td>{item.outcome}</td><td>{item.category || "—"}</td><td>{new Date(item.createdAt).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div> : <p>No OTP activity recorded yet.</p>}</details>
    </>}
    {error && <p role="alert" className="sk-settings-feedback is-error">{error}</p>}
  </section>;
}
