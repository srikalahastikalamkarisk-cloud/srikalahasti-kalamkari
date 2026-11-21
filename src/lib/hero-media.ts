import type { HeroMediaType } from "@/data/hero-slides";

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const PINTEREST_HOSTS = new Set(["pinterest.com", "www.pinterest.com"]);

export function youtubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
    const id = url.hostname.endsWith("youtu.be")
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function instagramPath(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.pathname.match(/^\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)\/?$/)?.[0] ?? null;
  } catch {
    return null;
  }
}

export function pinterestPinId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !PINTEREST_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.pathname.match(/^\/pin\/(\d+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function detectVideoUrlType(value: string): Extract<HeroMediaType, "youtube" | "instagram" | "pinterest" | "direct"> | null {
  if (youtubeId(value)) return "youtube";
  if (instagramPath(value)) return "instagram";
  if (pinterestPinId(value)) return "pinterest";
  try {
    const url = new URL(value);
    if (isPublicHttpsUrl(value) && /\.(?:mp4|webm)$/i.test(url.pathname)) return "direct";
  } catch { /* Invalid values are handled by the field validator. */ }
  return null;
}

function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return host.length > 0;
  } catch {
    return false;
  }
}

export function externalSourceError(type: HeroMediaType, value: string, required = false) {
  const url = value.trim();
  if (!url) return required ? "Add a desktop source URL." : null;

  if (type === "youtube" && !youtubeId(url)) {
    return "Use a YouTube watch, short, embed, or Shorts URL.";
  }
  if (type === "instagram" && !instagramPath(url)) {
    return "Use a public Instagram Reel, post, or TV URL.";
  }
  if (type === "pinterest" && !pinterestPinId(url)) {
    return "Use a full Pinterest Pin URL (pin.it short links are not supported).";
  }
  if (type === "direct" && !isPublicHttpsUrl(url)) {
    return "Use a public HTTPS video URL without credentials or a local address.";
  }
  if (type === "direct" && !/\.(?:mp4|webm)(?:$|[?#])/i.test(url)) {
    return "Use a direct HTTPS link to an MP4 or WebM video.";
  }
  return null;
}

export function embedUrl(type: HeroMediaType, value: string, origin = "", autoplay = true) {
  if (type === "youtube") {
    const id = youtubeId(value);
    if (!id) return null;
    const params = new URLSearchParams({ autoplay: autoplay ? "1" : "0", mute: "1", controls: "1", playsinline: "1", enablejsapi: "1", rel: "0" });
    if (origin) params.set("origin", origin);
    return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
  }
  if (type === "instagram") {
    const path = instagramPath(value);
    return path ? `https://www.instagram.com${path.replace(/\/?$/, "/")}embed/` : null;
  }
  if (type === "pinterest") {
    const id = pinterestPinId(value);
    return id ? `https://assets.pinterest.com/ext/embed.html?id=${id}` : null;
  }
  return null;
}

export function slideAdvanceDelay(type: HeroMediaType, duration: number, videoFallbackMs: number) {
  return type === "image" ? duration : videoFallbackMs;
}

export function removeHeroMediaField<T extends { videoUrl?: string }>(form: T, field: keyof T): T {
  return { ...form, [field]: "", ...(["desktopSourceUrl", "desktopVideo"].includes(String(field)) ? { videoUrl: "" } : {}) };
}

type MediaConfig = {
  mediaType: HeroMediaType;
  desktopImage?: string | null;
  mobileImage?: string | null;
  desktopVideo?: string | null;
  mobileVideo?: string | null;
  videoUrl?: string | null;
  desktopSourceUrl?: string | null;
  mobileSourceUrl?: string | null;
  posterImage?: string | null;
};

function validMediaReference(value: string | null | undefined) {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateSlideMedia(config: MediaConfig) {
  const refs = [config.desktopImage, config.mobileImage, config.desktopVideo, config.mobileVideo, config.videoUrl, config.posterImage];
  if (refs.some(value => !validMediaReference(value))) return "Invalid media URL.";

  if (config.mediaType === "image") {
    return config.desktopImage ? null : "Choose a desktop image.";
  }
  if (config.mediaType === "video") {
    return config.desktopVideo || config.videoUrl ? null : "Upload a desktop video.";
  }

  const desktop = config.desktopSourceUrl || config.videoUrl || "";
  const mobile = config.mobileSourceUrl || "";
  const desktopError = externalSourceError(config.mediaType, desktop, true);
  if (desktopError) return desktopError;
  return mobile ? externalSourceError(config.mediaType, mobile) : null;
}
