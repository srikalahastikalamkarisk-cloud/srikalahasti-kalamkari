"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import type { HeroSlide as HeroSlideData } from "@/data/hero-slides";
import { embedUrl, slideAdvanceDelay } from "@/lib/hero-media";
import "./hero-slider.css";

function useMobileLayout() {
  return useSyncExternalStore(
    callback => {
      const query = window.matchMedia("(max-width: 768px)");
      query.addEventListener("change", callback);
      return () => query.removeEventListener("change", callback);
    },
    () => window.matchMedia("(max-width: 768px)").matches,
    () => false,
  );
}

function useReducedMotion() {
  return useSyncExternalStore(
    callback => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", callback);
      return () => query.removeEventListener("change", callback);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function HeroMedia({
  slide,
  active,
  muted,
  onEnded,
  onToggleMuted,
}: {
  slide: HeroSlideData;
  active: boolean;
  muted: boolean;
  onEnded: () => void;
  onToggleMuted: () => void;
}) {
  const mobile = useMobileLayout();
  const reducedMotion = useReducedMotion();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStatus, setMediaStatus] = useState<"loading" | "ready" | "blocked" | "error">("loading");
  const mediaType = slide.mediaType || "image";
  const poster = mediaType === "image" ? slide.desktopImage : slide.posterImage || slide.desktopImage;
  const mobilePoster = mediaType === "image" ? slide.mobileImage || slide.desktopImage : slide.posterImage || slide.mobileImage || slide.desktopImage;
  const uploadedVideo = mobile
    ? slide.mobileVideo || slide.desktopVideo || slide.videoUrl || ""
    : slide.desktopVideo || slide.mobileVideo || slide.videoUrl || "";
  const externalSource = mobile
    ? slide.mobileSourceUrl || slide.desktopSourceUrl || slide.videoUrl || ""
    : slide.desktopSourceUrl || slide.mobileSourceUrl || slide.videoUrl || "";
  const isDirect = mediaType === "direct";
  const videoSource = mediaType === "video" ? uploadedVideo : isDirect ? externalSource : "";
  const [browserOrigin, setBrowserOrigin] = useState("");

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  const rawFrameSource = embedUrl(
    mediaType,
    externalSource,
    browserOrigin
  );
  const frameSource = rawFrameSource && reducedMotion && mediaType === "youtube"
    ? (() => { const url = new URL(rawFrameSource); url.searchParams.set("autoplay", "0"); return url.toString(); })()
    : rawFrameSource;

  useEffect(() => {
    if (mediaType !== "youtube" || !active) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.youtube-nocookie.com" || event.source !== frameRef.current?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message?.event === "onStateChange" && message.info === 0) onEnded();
      } catch { /* Ignore unrelated provider messages. */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, mediaType, onEnded]);

  useEffect(() => {
    if (mediaType !== "youtube") return;
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    const target = "https://www.youtube-nocookie.com";
    frame.postMessage(JSON.stringify({ event: "command", func: muted ? "mute" : "unMute", args: [] }), target);
  }, [mediaType, muted]);

  function registerYouTubePlayer() {
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    const target = "https://www.youtube-nocookie.com";
    frame.postMessage(JSON.stringify({ event: "listening", id: "hero-slider" }), target);
    frame.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }), target);
    frame.postMessage(JSON.stringify({ event: "command", func: muted ? "mute" : "unMute", args: [] }), target);
  }

  return (
    <div className="sk-cinematic-background">
      {(slide.desktopImage || poster) && <div className="sk-cinematic-picture desktop-picture" style={{ backgroundImage: `url("${poster}")` }} />}
      {(slide.mobileImage || mobilePoster) && <div className="sk-cinematic-picture mobile-picture" style={{ backgroundImage: `url("${mobilePoster}")` }} />}

      {videoSource && active && (
        <video
          ref={videoRef}
          key={`${slide.id}-${videoSource}`}
          className="sk-hero-video"
          src={videoSource}
          autoPlay={!reducedMotion}
          muted={muted}
          playsInline
          preload="metadata"
          poster={mobile ? mobilePoster || undefined : poster || undefined}
          aria-label={`${slide.title} video`}
          onLoadStart={() => setMediaStatus("loading")}
          onCanPlay={(event) => {
            setMediaStatus("ready");
            if (!reducedMotion) void event.currentTarget.play().catch(() => setMediaStatus("blocked"));
          }}
          onWaiting={() => setMediaStatus("loading")}
          onStalled={() => setMediaStatus("blocked")}
          onError={() => setMediaStatus("error")}
          onEnded={onEnded}
        />
      )}

      {frameSource && active && (
        <iframe
          ref={frameRef}
          className={`sk-hero-embed sk-hero-embed-${mediaType}`}
          src={frameSource}
          title={`${slide.title} video`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            setMediaStatus("ready");
            if (mediaType === "youtube") registerYouTubePlayer();
          }}
          onError={() => setMediaStatus("error")}
        />
      )}

      {(videoSource || frameSource) && active && mediaStatus !== "ready" && mediaStatus !== "loading" && (
        <div className="sk-hero-media-status" role="status" aria-live="polite">
          {mediaStatus === "blocked" && videoSource ? <button type="button" onClick={() => void videoRef.current?.play().then(() => setMediaStatus("ready")).catch(() => setMediaStatus("error"))}>Tap to play</button> : "Video unavailable. The slide will advance automatically."}
        </div>
      )}

      {slide.soundControlsEnabled && ["video", "direct", "youtube"].includes(mediaType) && (
        <button
          className="sk-hero-sound"
          type="button"
          aria-label={muted ? "Unmute hero video" : "Mute hero video"}
          aria-pressed={!muted}
          onClick={onToggleMuted}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span>{muted ? "Unmute" : "Mute"}</span>
        </button>
      )}
    </div>
  );
}

function EmptyHero() {
  return (
    <section className="sk-cinematic-hero sk-cinematic-empty" aria-label="Srikalahasti Kalamkari">
      <div className="sk-hero-empty-art" aria-hidden="true" />
      <div className="sk-hero-empty-content">
        <span className="sk-cinematic-eyebrow"><span className="sk-cinematic-rule" />SRIKALAHASTI KALAMKARI</span>
        <h1>Tradition, carried forward by hand.</h1>
      </div>
    </section>
  );
}

export default function HeroSlider({ slides: providedSlides }: { slides: HeroSlideData[] }) {
  const slides = providedSlides.filter(slide => slide.enabled);
  const [activeState, setActiveState] = useState(0);
  const [paused, setPaused] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const node = heroRef.current;
    if (!node || !("IntersectionObserver" in window)) return;

    let inView = true;

    const update = () => {
      setHeroVisible(
        inView && document.visibilityState === "visible"
      );
    };

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    }, { threshold: 0.01 });

    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const [mutedPreference, setMutedPreference] = useState<{ slideId: string; muted: boolean } | null>(null);
  const [progress, setProgress] = useState<{ slideId: string; value: number } | null>(null);
  const touchStartX = useRef<number | null>(null);
  const progressValue = useRef(0);
  const reducedMotion = useReducedMotion();
  const active = Math.min(activeState, Math.max(slides.length - 1, 0));
  const currentSlide = slides[active];
  const muted = currentSlide
    ? mutedPreference?.slideId === currentSlide.id ? mutedPreference.muted : currentSlide.initialMuted
    : true;
  const delay = currentSlide ? slideAdvanceDelay(currentSlide.mediaType, currentSlide.duration, currentSlide.videoFallbackMs) : 0;
  const progressAmount = currentSlide && progress?.slideId === currentSlide.id ? progress.value : 0;

  const advance = useCallback(() => {
    setActiveState(current => slides.length ? (current + 1) % slides.length : 0);
  }, [setActiveState, slides.length]);

  useEffect(() => {
    progressValue.current = 0;
  }, [active, delay]);

  useEffect(() => {
    if (!currentSlide || paused || !heroVisible || slides.length < 2 || reducedMotion) return;
    const started = performance.now();
    const startingProgress = progressValue.current;
    let frame = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      const next = Math.min(1, startingProgress + (now - started) / delay);
      progressValue.current = next;
      if (now - lastPaint >= 50 || next >= 1) {
        lastPaint = now;
        setProgress({ slideId: currentSlide.id, value: next });
      }
      if (next >= 1) advance();
      else frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, advance, currentSlide, delay, paused, heroVisible, reducedMotion, slides.length]);

  const onVideoEnded = useCallback(() => {
    if (progressValue.current >= 1) return;
    progressValue.current = 1;
    advance();
  }, [advance]);

  if (!slides.length) return <EmptyHero />;

  function navigate(direction: number) {
    setActiveState(current => (Math.min(current, slides.length - 1) + direction + slides.length) % slides.length);
  }

  return (
    <section
      ref={heroRef}
      className="sk-cinematic-hero"
      aria-label="Featured Kalamkari collections"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onTouchStart={event => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={event => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined || Math.abs(end - start) < 45) return;
        navigate(end < start ? 1 : -1);
      }}
    >
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={["sk-cinematic-slide", index === active ? "is-active" : "", `animation-${slide.animation}`, `position-${slide.textPosition}`].join(" ")}
          style={{ transitionDuration: `${slide.transitionMs}ms`, ["--hero-overlay" as string]: slide.overlayOpacity }}
          aria-hidden={index !== active}
          inert={index !== active}
        >
          <HeroMedia key={`${slide.id}-${slide.mediaType}-${slide.desktopImage}-${slide.mobileImage}-${slide.desktopVideo}-${slide.mobileVideo}-${slide.desktopSourceUrl}-${slide.mobileSourceUrl}`} slide={slide} active={index === active && heroVisible} muted={muted} onEnded={onVideoEnded} onToggleMuted={() => setMutedPreference({ slideId: slide.id, muted: !muted })} />
          <div className="sk-cinematic-overlay" />
          <div className="sk-cinematic-content">
            {slide.eyebrow && <div className="sk-cinematic-eyebrow"><span className="sk-cinematic-rule" />{slide.eyebrow}</div>}
            <h1 className="sk-cinematic-title">{slide.title}{slide.highlight && <span>{slide.highlight}</span>}</h1>
            {slide.description && <p className="sk-cinematic-description">{slide.description}</p>}
            <div className="sk-cinematic-buttons">
              {slide.primaryLabel && slide.primaryHref && <Link href={slide.primaryHref} className="sk-cinematic-primary">{slide.primaryLabel}<ArrowRight size={17} /></Link>}
              {slide.secondaryLabel && slide.secondaryHref && <Link href={slide.secondaryHref} className="sk-cinematic-secondary">{slide.secondaryLabel}</Link>}
            </div>
          </div>
        </div>
      ))}

      {slides.length > 1 && <div className="sk-cinematic-controls">
        <div className="sk-cinematic-count"><strong>{String(active + 1).padStart(2, "0")}</strong><span>/ {String(slides.length).padStart(2, "0")}</span></div>
        <div className="sk-cinematic-dots" role="group" aria-label="Choose featured slide">
          {slides.map((slide, index) => <button type="button" key={slide.id} aria-label={`Show slide ${index + 1}: ${slide.title}`} aria-current={index === active ? "true" : undefined} className={index === active ? "active" : ""} onClick={() => setActiveState(index)}><span className="sk-cinematic-dot-progress" style={{ transform: `scaleX(${index === active ? progressAmount : 0})`, transition: reducedMotion ? "none" : undefined }} /></button>)}
        </div>
        <div className="sk-cinematic-arrows">
          <button type="button" onClick={() => navigate(-1)} aria-label="Previous slide"><ChevronLeft size={21} /></button>
          <button type="button" onClick={() => navigate(1)} aria-label="Next slide"><ChevronRight size={21} /></button>
        </div>
      </div>}

      <div className="sk-reference-ticker" aria-label="Srikalahasti Kalamkari craftsmanship">
        <div className="sk-reference-ticker-track">
          {[0, 1].map(copy => <div className="sk-reference-ticker-set" key={copy} aria-hidden={copy === 1}><span>AUTHENTIC HAND-PAINTED KALAMKARI</span><b>✦</b><span>CRAFTED BY GENERATIONS</span><b>✦</b><span>FROM SRIKALAHASTI WITH LOVE</span><b>✦</b><span>TRADITION IN EVERY DETAIL</span><b>✦</b></div>)}
        </div>
      </div>

      <div className="sk-cinematic-progress" role="progressbar" aria-label={`Slide ${active + 1} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressAmount * 100)}>
        <span style={{ transform: `scaleX(${progressAmount})`, transition: "none" }} />
      </div>
    </section>
  );
}
