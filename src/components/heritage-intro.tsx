"use client";

import { useEffect, useState } from "react";
import "./heritage-intro.css";

type HeritageIntroProps = {
  logoUrl?: string | null;
  storeName?: string | null;
};

const SESSION_KEY = "srikalahasti-heritage-intro-v3";

export default function HeritageIntro({
  logoUrl,
  storeName,
}: HeritageIntroProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("intro") === "1";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    try {
      // Always show the intro when the homepage is opened.
    } catch {
      // Continue without storage.
    }

    const start = window.setTimeout(() => setVisible(true), 0);
    const exit = window.setTimeout(() => setClosing(true), 2900);
    const finish = window.setTimeout(() => {
      setVisible(false);
      if (!preview) {
        try {
          sessionStorage.setItem(SESSION_KEY, "seen");
        } catch {
          // Storage is optional.
        }
      }
    }, 4000);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(exit);
      window.clearTimeout(finish);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`sk-heritage-intro${closing ? " is-closing" : ""}`}
      aria-hidden="true"
    >
      <div className="sk-heritage-light" />

      <div className="sk-heritage-corner sk-heritage-corner-tl" />
      <div className="sk-heritage-corner sk-heritage-corner-tr" />
      <div className="sk-heritage-corner sk-heritage-corner-bl" />
      <div className="sk-heritage-corner sk-heritage-corner-br" />

      <div className="sk-heritage-medallion">
        <svg className="sk-heritage-rings" viewBox="0 0 400 400" aria-hidden="true">
          <defs>
            <linearGradient id="sk-metal-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#75400e" />
              <stop offset="18%" stopColor="#f7c65e" />
              <stop offset="34%" stopColor="#fff4bd" />
              <stop offset="51%" stopColor="#b96c19" />
              <stop offset="72%" stopColor="#ffda79" />
              <stop offset="100%" stopColor="#8b4d12" />
            </linearGradient>
          </defs>

          <circle className="sk-ring-base" cx="200" cy="200" r="171" />
          <circle className="sk-ring-outer" cx="200" cy="200" r="168" />
          <circle className="sk-ring-detail" cx="200" cy="200" r="157" />
          <circle className="sk-ring-diamonds" cx="200" cy="200" r="148" />
          <circle className="sk-ring-inner" cx="200" cy="200" r="137" />
          <circle className="sk-ring-sparkles" cx="200" cy="200" r="182" />
        </svg>

        <div className="sk-heritage-logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/intro/heritage-logo.png"
            alt={storeName || "Srikalahasti Kalamkari"}
            className="sk-heritage-main-logo"
          />
        </div>
      </div>

      <div className="sk-heritage-signature">
        <span className="sk-heritage-signature-text">
          SRIKALAHASTI KALAMKARI
        </span>
        <span className="sk-heritage-writing-pen" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M9 40L16 24L34 6L42 14L24 32Z" fill="#e4ad42" stroke="#fff0ad" strokeWidth="1.5" />
            <path d="M9 40L16 24L24 32Z" fill="#a86b27" />
            <path d="M9 40L14 35" stroke="#fff4cc" strokeWidth="2" />
            <path d="M30 10L38 18" stroke="#fff0ad" strokeWidth="2" />
          </svg>
        </span>
      </div>
    </div>
  );
}
