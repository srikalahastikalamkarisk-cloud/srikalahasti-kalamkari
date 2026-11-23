"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Globe2, Wrench } from "lucide-react";

export default function WebsiteStatusControl() {
  const [maintenanceMode, setMaintenanceMode] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/settings/website-status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json() as { maintenanceMode?: boolean; error?: string };
      if (!response.ok || typeof data.maintenanceMode !== "boolean") {
        throw new Error(data.error || "Unable to load website status.");
      }
      setMaintenanceMode(data.maintenanceMode);
    } catch (error) {
      setMaintenanceMode(null);
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Unable to load website status." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(next: boolean) {
    if (saving || maintenanceMode === null || next === maintenanceMode) return;
    const action = next ? "enable maintenance mode" : "bring the website live";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/settings/website-status", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenanceMode: next }),
      });
      const data = await response.json() as { maintenanceMode?: boolean; error?: string };
      if (!response.ok || data.maintenanceMode !== next) {
        throw new Error(data.error || "Website status was not changed.");
      }
      setMaintenanceMode(next);
      setFeedback({ type: "success", text: next ? "Maintenance mode is enabled." : "Website is live for visitors." });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Unable to update website status." });
    } finally {
      setSaving(false);
    }
  }

  const isLive = maintenanceMode === false;
  return (
    <section className="sk-settings-card sk-website-status" aria-labelledby="website-status-title">
      <div className="sk-settings-card-heading">
        <div>
          <h2 id="website-status-title">Website status</h2>
          <p>Control public storefront availability. Admin pages and payment callbacks remain available during maintenance.</p>
        </div>
        <span className={`sk-website-status-pill ${isLive ? "is-live" : maintenanceMode ? "is-maintenance" : "is-unknown"}`} role="status">
          {loading ? "Checking status…" : isLive ? <><CheckCircle2 size={16}/> Website LIVE</> : maintenanceMode ? <><Wrench size={16}/> Maintenance Mode</> : <><AlertTriangle size={16}/> Status unavailable</>}
        </span>
      </div>
      <div className="sk-website-status-actions">
        <p>{isLive ? "Visitors can browse and shop normally." : maintenanceMode ? "Visitors will see the maintenance page; Admin access remains enabled." : "Reload status before making changes."}</p>
        <div>
          {maintenanceMode === false ? (
            <button type="button" className="sk-website-maintenance-button" onClick={() => void changeStatus(true)} disabled={loading || saving}>
              <Wrench size={16}/>{saving ? "Enabling…" : "Enable Maintenance"}
            </button>
          ) : (
            <button type="button" className="sk-website-live-button" onClick={() => void changeStatus(false)} disabled={loading || saving || maintenanceMode === null}>
              <Globe2 size={16}/>{saving ? "Going live…" : "Go Live"}
            </button>
          )}
          {feedback?.type === "error" && <button type="button" className="sk-website-retry" onClick={() => void load()} disabled={loading || saving}>Retry status</button>}
        </div>
      </div>
      {feedback && <p className={`sk-website-feedback is-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p>}
    </section>
  );
}
