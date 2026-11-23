import { NextRequest } from "next/server";
import { ORIGINAL_THEME_ID, resolveStoreTheme } from "@/lib/store-themes";
import { MAINTENANCE_RETRY_AFTER_SECONDS } from "@/lib/maintenance/route-policy";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export async function GET(request: NextRequest) {
  const requestedTheme = request.headers.get("x-maintenance-theme-id") || ORIGINAL_THEME_ID;
  const theme = resolveStoreTheme(requestedTheme);
  const primary = escapeHtml(theme.gradients.loading);
  const accent = escapeHtml(theme.colors.accentOnDark);
  const text = escapeHtml(theme.colors.onDark);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Scheduled Maintenance | Srikalahasti Kalamkari</title>
<style>
:root{color-scheme:dark;--maintenance-bg:${primary};--maintenance-accent:${accent};--maintenance-text:${text}}
*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{width:100%;min-height:100svh;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:24px;background:var(--maintenance-bg);color:var(--maintenance-text);font-family:Manrope,Arial,sans-serif;text-align:center}
.maintenance{width:min(760px,calc(100vw - 48px));min-width:0;max-width:100%;padding:clamp(28px,6vw,64px);border:1px solid color-mix(in srgb,var(--maintenance-accent) 45%,transparent);border-radius:24px;background:color-mix(in srgb,#07152a 42%,transparent);box-shadow:0 24px 80px #0005;backdrop-filter:blur(12px)}
.brand{display:grid;justify-items:center;gap:12px;margin-bottom:28px}.brand img{width:88px;height:88px;object-fit:contain;filter:drop-shadow(0 5px 20px #0006)}.brand span{font:600 12px/1.4 Georgia,serif;letter-spacing:.26em;color:var(--maintenance-accent)}
.loader{position:relative;width:76px;height:76px;margin:0 auto 26px;border:2px solid color-mix(in srgb,var(--maintenance-accent) 22%,transparent);border-top-color:var(--maintenance-accent);border-right-color:var(--maintenance-accent);border-radius:50%;animation:turn 2.4s cubic-bezier(.5,.1,.5,.9) infinite}.loader:before,.loader:after{content:"✦";position:absolute;color:var(--maintenance-accent);font-size:17px}.loader:before{top:7px;left:8px}.loader:after{right:8px;bottom:7px;font-size:12px}@keyframes turn{to{transform:rotate(360deg)}}
h1{margin:0;color:var(--maintenance-text);font:400 clamp(34px,6vw,58px)/1.08 Georgia,serif;letter-spacing:-.035em;text-wrap:balance;overflow-wrap:anywhere}p{max-width:610px;margin:20px auto 0;color:var(--maintenance-text);font-size:clamp(15px,2vw,18px);line-height:1.75;overflow-wrap:anywhere}.credit{margin-top:30px;padding-top:24px;border-top:1px solid color-mix(in srgb,var(--maintenance-accent) 35%,transparent);font-size:14px}.credit strong{display:block;margin-bottom:8px;color:var(--maintenance-accent);font-size:16px}.credit a{color:var(--maintenance-text);text-decoration-thickness:1px;text-underline-offset:4px}.technical{margin-top:16px;font-size:13px;line-height:1.6}
@media(max-width:480px){body{padding:14px}.maintenance{padding:30px 22px;border-radius:18px}.brand img{width:76px;height:76px}.loader{width:64px;height:64px;margin-bottom:22px}}
@media(prefers-reduced-motion:reduce){.loader{animation:none}}
</style></head><body><main class="maintenance" aria-labelledby="maintenance-title"><div class="brand"><img src="/srikalahasti-logo.png" alt="Srikalahasti Kalamkari"><span>SRIKALAHASTI KALAMKARI</span></div><div class="loader" aria-hidden="true"></div><h1 id="maintenance-title">We're Making Something Beautiful</h1><p>Our website is currently undergoing scheduled maintenance to bring you a better shopping experience. We'll be back soon!</p><section class="credit" aria-label="Website development support"><strong>Website Developed by VenuTrinity</strong><a href="https://venutrinity.in/" target="_blank" rel="noopener noreferrer">venutrinity.in</a><br><a href="tel:+919849743774">+91 98497 43774</a><p class="technical">For website-related technical queries, please contact our development team.</p></section></main></body></html>`;

  return new Response(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS),
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
