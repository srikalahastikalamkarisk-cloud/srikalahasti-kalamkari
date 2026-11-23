import "server-only";
import { getResetEmailConfig } from "@/lib/admin/password-reset-email";
import type { ResetEmailConfig } from "@/lib/admin/password-reset-email";
import nodemailer from "nodemailer";

function config(): ResetEmailConfig {
  const result = getResetEmailConfig();
  if (!result) throw new Error("Customer email delivery is not configured");
  return result;
}

function escaped(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function deliver(to: string, subject: string, text: string, html: string) {
  const cfg = config();
  if (cfg.provider === "gmail") {
    const result = await nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.port === 587, auth: { user: cfg.user, pass: cfg.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 }).sendMail({ from: cfg.from, to, subject, text, html });
    if (!result.accepted.some(address => address.toLowerCase() === to.toLowerCase()) || result.rejected.some(address => address.toLowerCase() === to.toLowerCase())) throw new Error("Customer email recipient was not accepted");
  } else {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Customer email delivery failed");
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!result || typeof result.id !== "string" || !result.id) throw new Error("Customer email provider did not acknowledge the message");
  }
}

function emailHtml(title: string, greeting: string, action: string, url: string, expiry: string) {
  return `<!doctype html><html><body style="margin:0;background:#f8f3e9;color:#10213b;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="600" style="max-width:600px;background:#fffdf8;border:1px solid #e6d5b9"><tr><td style="padding:30px 28px;text-align:center;border-bottom:3px solid #b58a43"><div style="font:700 12px Arial;letter-spacing:4px">SRIKALAHASTI</div><div style="font:11px Arial;letter-spacing:5px;margin-top:7px">KALAMKARI</div></td></tr><tr><td style="padding:34px 30px"><h1 style="font:30px Georgia,serif;color:#10213b">${title}</h1><p>Hello ${escaped(greeting)},</p><p>${action}</p><p style="text-align:center;margin:30px 0"><a href="${url}" style="display:inline-block;background:#10213b;color:#fff;text-decoration:none;padding:14px 24px;border:1px solid #b58a43">Continue securely</a></p><p>This link ${expiry}. If you did not request this, you can ignore this email.</p><p style="font-size:12px;color:#6b7280;word-break:break-all">${url}</p></td></tr><tr><td style="padding:18px 30px;background:#f3eadb;font-size:12px">For order or account help, contact our customer care team through the Contact page.</td></tr></table></td></tr></table></body></html>`;
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const cfg = config(); const url = new URL("/verify-email", cfg.appOrigin); url.searchParams.set("token", token);
  const subject = "Verify your Srikalahasti Kalamkari account";
  const text = `Hello ${name},\n\nVerify your account within 24 hours: ${url}\n\nIf you did not create this account, ignore this email.`;
  await deliver(email, subject, text, emailHtml("Verify your email", name, "Confirm your email address to activate your account.", url.toString(), "expires in 24 hours"));
}

export async function sendCustomerResetEmail(email: string, name: string, token: string) {
  const cfg = config(); const url = new URL("/reset-password", cfg.appOrigin); url.hash = new URLSearchParams({ token }).toString();
  const subject = "Reset your Srikalahasti Kalamkari password";
  const text = `Hello ${name},\n\nReset your password within 30 minutes: ${url}\n\nIf you did not request this, ignore this email.`;
  await deliver(email, subject, text, emailHtml("Reset your password", name, "A password reset was requested for your customer account.", url.toString(), "expires in 30 minutes"));
}

export async function sendPasswordChangedEmail(email: string, name: string) {
  config(); const subject = "Your Srikalahasti Kalamkari password was changed";
  const text = `Hello ${name},\n\nYour account password was changed. If this was not you, contact customer care through the Contact page immediately.`;
  const html = `<p>Hello ${escaped(name)},</p><p>Your Srikalahasti Kalamkari account password was changed. If this was not you, contact our customer care team through the Contact page immediately.</p>`;
  await deliver(email, subject, text, html);
}
