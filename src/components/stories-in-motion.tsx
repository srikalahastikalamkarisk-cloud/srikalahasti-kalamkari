"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomepageVideoStory } from "@/lib/video-stories";
import "./stories-in-motion.css";

type Story = HomepageVideoStory;

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    if (["youtu.be", "www.youtu.be"].includes(u.hostname)) return u.pathname.split("/")[1] || null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(u.hostname)) return u.searchParams.get("v") || u.pathname.match(/\/(?:shorts|embed|live)\/([^/]+)/)?.[1] || null;
  } catch { /* not a URL */ }
  return null;
}
function instagramEmbed(url: string) {
  try {
    const u = new URL(url);
    if (!["instagram.com", "www.instagram.com"].includes(u.hostname)) return null;
    const m = u.pathname.match(/^\/(reel|p|tv)\/([\w-]+)/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
  } catch { /* not a URL */ }
  return null;
}
export default function StoriesInMotion({ stories }: { stories: Story[] }) {
  const repeat = stories.length > 1 ? 3 : 1;
  const reelList = Array.from(
    { length: repeat },
    (_, copy) => stories.map((story, index) => ({
      story,
      index,
      key: `${copy}-${story.id}`,
    }))
  ).flat();

  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const last = useRef<number>(0);
  const manualPause = useRef(false);
  const activeRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(0);
  const [activeCopy, setActiveCopy] = useState(
    stories.length > 1 ? 1 : 0
  );
  const interactionUntil = useRef(0);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [youtubeSound, setYoutubeSound] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [motion, setMotion] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const count = stories.length;
  const jumpTo = useCallback((index: number, smooth = true) => {
    const el = rail.current;
    if (!el || !count) return;
    const target = el.querySelectorAll<HTMLElement>(".sim4-card")[
      (count > 1 ? count : 0) + ((index % count) + count) % count
    ];
    if (!target) return;
    el.scrollTo({ left: target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2, behavior: smooth && !reduced ? "smooth" : "instant" });
  }, [count, reduced]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const el = rail.current;
    if (!el || count < 2) return;
    const cards = el.querySelectorAll<HTMLElement>(".sim4-card");
    const first = cards[count];
    if (first) el.scrollLeft = first.offsetLeft - (el.clientWidth - first.offsetWidth) / 2;
  }, [count]);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.08 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Keep the rail in its middle duplicate, avoiding layout jumps or repeated scroll feedback.
  useEffect(() => {
    const el = rail.current;
    if (!el || count < 2) return;
    const sync = () => {
      const cards = el.querySelectorAll<HTMLElement>(".sim4-card");
      const first = cards[count], next = cards[count * 2];
      if (!first || !next) return;
      const cycle = next.offsetLeft - first.offsetLeft;
      if (cycle <= 0) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let nearest = count, distance = Infinity;
      cards.forEach((card, i) => {
        const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (d < distance) { distance = d; nearest = i; }
      });
      const nextActive = nearest % count;
      const nextCopy = Math.floor(nearest / count);

      if (activeRef.current !== nextActive) {
        activeRef.current = nextActive;
        setActive(nextActive);
      }

      setActiveCopy(previous =>
        previous === nextCopy ? previous : nextCopy
      );
    };
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [count]);
  useEffect(() => {
    const el = rail.current;
    if (!el || count < 2 || !visible || reduced || paused || !motion || soundId || isMobile || youtubeSound || hovered) return;
    last.current = 0;
    const tick = (time: number) => {
      if (last.current) {
        const dt = Math.min(50, time - last.current);
        const cards = el.querySelectorAll<HTMLElement>(".sim4-card");
        const middle = cards[count], following = cards[count * 2];
        if (middle && following) {
          const cycle = following.offsetLeft - middle.offsetLeft;
          if (cycle > 0 && el.scrollLeft >= following.offsetLeft - (el.clientWidth - middle.offsetWidth) / 2) {
            el.scrollLeft -= cycle;
          }
        }
        el.scrollLeft += dt * .16; // 65px/sec: visible but relaxed continuous movement
      }
      last.current = time;
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame.current);
  }, [count, visible, reduced, paused, motion, soundId, isMobile, youtubeSound, hovered]);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;

    const videos = Array.from(
      el.querySelectorAll<HTMLVideoElement>("video[data-story]")
    );

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target as HTMLVideoElement;
        const card = video.closest(".sim4-card");
        const isActive = card?.classList.contains("is-active") === true;

        video.muted = !isActive || soundId !== video.dataset.story;

        if (
          visible && entry.isIntersecting && !reduced &&
          (!isMobile || isActive)
        ) {
          void video.play().catch(() => {
            // Browser autoplay policies may prevent playback.
          });
        } else {
          video.pause();
        }
      });
    }, {
      root: el,
      threshold: 0.15
    });

    videos.forEach(video => observer.observe(video));

    const syncPlayback = () => {
      const viewport = el.getBoundingClientRect();

      videos.forEach(video => {
        const bounds = video.getBoundingClientRect();
        const inView =
          bounds.right > viewport.left &&
          bounds.left < viewport.right;

        const isActive =
          video.closest(".sim4-card")?.classList.contains("is-active");

        if (visible && inView && !reduced && (!isMobile || isActive)) {
          if (video.paused) {
            video.muted = true;
            void video.play().catch(() => {
              // Browser playback restrictions are handled gracefully.
            });
          }
        } else if (!video.paused) {
          video.pause();
        }
      });
    };

    el.addEventListener("scroll", syncPlayback, { passive: true });
    syncPlayback();

    const recoverPlayback = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement;
      const viewport = el.getBoundingClientRect();
      const bounds = video.getBoundingClientRect();
      const inView =
        bounds.right > viewport.left &&
        bounds.left < viewport.right;

      if (
        !visible || reduced || !inView || video.ended ||
        isMobile
      ) return;

      window.setTimeout(() => {
        if (!video.isConnected || !video.paused) return;

        const currentViewport = el.getBoundingClientRect();
        const currentBounds = video.getBoundingClientRect();
        const stillVisible =
          currentBounds.right > currentViewport.left &&
          currentBounds.left < currentViewport.right;

        if (document.visibilityState === "visible" &&
            stillVisible && !reduced) {
          video.muted = true;
          void video.play().catch(() => {});
        }
      }, 100);
    };

    videos.forEach(video => {
      video.addEventListener("pause", recoverPlayback);
    });

    return () => {
      el.removeEventListener("scroll", syncPlayback);
      videos.forEach(video => {
        video.removeEventListener("pause", recoverPlayback);
      });
      observer.disconnect();
    };
  }, [active, activeCopy, soundId, visible, reduced, stories, isMobile]);

  // STEP 848C: Mobile automatic slide navigation.
  useEffect(() => {
    if (
      !isMobile || count < 2 || !visible ||
      reduced || paused || soundId || youtubeSound
    ) return;

    const timer = window.setInterval(() => {
      if (
        manualPause.current ||
        Date.now() < interactionUntil.current ||
        document.visibilityState !== "visible"
      ) return;

      jumpTo(activeRef.current + 1);
    }, 6500);

    return () => window.clearInterval(timer);
  }, [
    isMobile, count, visible, reduced,
    paused, soundId, youtubeSound, jumpTo
  ]);

  useEffect(() => {
    setSoundId(null);
  }, [active]);

  if (!count) return null;
  return (
    <section className="sim4-section" id="stories-in-motion" aria-label="Kalamkari video stories">
      <div className="sim4-heading"><span className="sim4-eyebrow">✦ THE SRIKALAHASTI EDIT ✦</span><h2>Stories in <em>Motion.</em></h2><p>Crafted by hand. Told in motion.</p></div>
      <div className="sim4-stage" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}>
        <div className="sim4-rail" ref={rail} onPointerDown={() => {
            manualPause.current = true;
            interactionUntil.current = Date.now() + 8000;
            setMotion(false);
          }} onPointerUp={() => { if (manualPause.current) { manualPause.current = false; setMotion(true); } }} onPointerCancel={() => {
            manualPause.current = false;
            interactionUntil.current = Date.now() + 8000;
            setMotion(true);
          }}>
          {reelList.map(({ story, index, key }, i) => {
            const copy = Math.floor(i / count);
            const yt = youtubeId(story.youtubeUrl || "");
            const ig = instagramEmbed(story.instagramUrl || "");
            const pinterest = story.pinterestUrl || "";
            const externalUrl = yt
              ? story.youtubeUrl
              : ig
                ? story.instagramUrl
                : pinterest || undefined;
            const focused = index === active && copy === activeCopy;
            const nearby =
              Math.abs(i - (activeCopy * count + active)) <= 1;
            const videoSource = isMobile && story.mobileMp4
              ? story.mobileMp4
              : story.mp4;
            const source = videoSource && !failed[story.id];
            return <article key={key} className={`sim4-card ${focused ? "is-active" : ""}`} data-copy={copy} aria-label={story.title}>
              <div className="sim4-frame">
                {isMobile && source && !story.poster && (
                  <div className="sim4-mobile-fallback"
                    aria-hidden="true">
                    <span>✦</span>
                    <small>THE SRIKALAHASTI EDIT</small>
                  </div>
                )}
                {source ? (
                  <video
                    key={`${story.id}-${videoSource}`}
                    data-story={story.id}
                    onCanPlay={event => {
                      event.currentTarget.dataset.ready = "true";
                    }}
                    src={videoSource}
                    poster={story.poster || undefined}
                    playsInline
                    autoPlay={visible && !reduced && (!isMobile || focused)}
                    loop
                    muted={!focused || soundId !== story.id}
                    preload={
                      visible && (focused || (isMobile && nearby))
                        ? "auto"
                        : "none"
                    }
                    onLoadedData={event => {
                      setAvailable(previous =>
                        previous[story.id] ? previous : {
                          ...previous,
                          [story.id]: true
                        }
                      );

                      if (focused && visible && !reduced) {
                        const video = event.currentTarget;
                        video.muted = soundId !== story.id;

                        void video.play().catch(error => {
                          console.warn(
                            "Story autoplay failed:",
                            error
                          );
                        });
                      }
                    }}
                    onError={() => {
                      if (focused) {
                        console.error("Unable to load story video:", videoSource);
                        setFailed(previous => ({
                          ...previous,
                          [story.id]: true
                        }));
                      }
                    }}
                  />
                ) : yt ? <iframe title={story.title} src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${yt}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /> : ig ? <iframe title={story.title} src={ig} loading="lazy" allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" /> : <div className="sim4-cover" style={story.poster ? { backgroundImage: `url(${story.poster})` } : undefined}><span className="sim4-flower">✦</span><span>THE ART OF<br/>KALAMKARI</span></div>}

                {yt && !source && (
                  <button
                    type="button"
                    className="sim4-sound"
                    aria-label={youtubeSound === key ? "Mute YouTube video" : "Unmute YouTube video"}
                    onClick={() => {
                      const card = rail.current?.querySelectorAll(".sim4-card")[i];
                      const iframe = card?.querySelector("iframe");

                      if (!iframe?.contentWindow) return;

                      const enable = youtubeSound !== key;

                      iframe.contentWindow.postMessage(
                        JSON.stringify({
                          event: "command",
                          func: enable ? "unMute" : "mute",
                          args: []
                        }),
                        "https://www.youtube-nocookie.com"
                      );

                      setYoutubeSound(enable ? key : null);
                    }}
                  >
                    {youtubeSound === key ? "♪" : "♫̸"}
                  </button>
                )}
                
                
                {source && <button type="button" className="sim4-sound sk-story-sound-control" onClick={() => {
                  const el = rail.current;
                  const target = el?.querySelectorAll(".sim4-card")[i]?.querySelector<HTMLVideoElement>("video[data-story]");
                  if (!target) return;
                  const enable = target.muted;
                  el?.querySelectorAll<HTMLVideoElement>("video[data-story]").forEach(video => {
                    video.muted = true;
                  });
                  target.muted = !enable;
                  setSoundId(enable ? story.id : null);
                }} aria-label="Toggle video sound"
        aria-pressed={soundId === story.id && focused}>{soundId === story.id && focused ? (
      <svg viewBox="0 0 24 24" width="20" height="20"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 9a4 4 0 0 1 0 6" />
        <path d="M18 6a8 8 0 0 1 0 12" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" width="20" height="20"
        fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </svg>
    )}</button>}
                {focused && externalUrl && !source && (
                  <a
                    className="sim4-external"
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch reel ↗
                  </a>
                )}
                <div className="sim4-overlay"><span>THE SRIKALAHASTI EDIT</span><strong>{story.title}</strong></div>
              </div>
            </article>;
          })}
        </div>
      </div>
      <div className="sim4-footer"><div className="sim4-current"><span>NOW PLAYING · {String(active + 1).padStart(2,"0")} / {String(count).padStart(2,"0")}</span><strong>{stories[active]?.title}</strong></div><div className="sim4-progress" aria-label="Select a story">{stories.map((story, i) => <button key={story.id} type="button" className={i === active ? "is-active" : ""} aria-label={`Show ${story.title}`} onClick={() => jumpTo(i)} />)}</div><div className="sim4-controls"><button type="button" onClick={() => jumpTo(active - 1)} aria-label="Previous reel">←</button><button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume scrolling" : "Pause scrolling"}>{paused ? "▶" : "Ⅱ"}</button><button type="button" onClick={() => jumpTo(active + 1)} aria-label="Next reel">→</button></div></div>
    </section>
  );
}
