"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import "./royal-welcome.css";

const INTRO_KEY = "sk-royal-welcome-v5";
const EXIT_AT = 4400;
const CLOSE_AT = 5550;

export default function RoyalWelcome() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Preview mode: ?welcome=preview replays the animation.
    const preview = new URLSearchParams(window.location.search)
      .get("welcome") === "preview";

    if (!preview) {
      try {
        if (sessionStorage.getItem(INTRO_KEY)) return;
        sessionStorage.setItem(INTRO_KEY, "seen");
      } catch {
        // Still display the welcome animation.
      }
    }

    const showTimer = window.setTimeout(() => setVisible(true), 0);
    const exitTimer = window.setTimeout(() => setLeaving(true), EXIT_AT);
    const closeTimer = window.setTimeout(() => setVisible(false), CLOSE_AT);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`sk-welcome ${leaving ? "sk-welcome-exit" : ""}`}
      role="status"
      aria-label="Welcome to Srikalahasti Kalamkari"
    >
      <div className="sk-welcome-atmosphere" aria-hidden="true" />

      <div className="sk-welcome-curtain sk-welcome-curtain-left" aria-hidden="true" />
      <div className="sk-welcome-curtain sk-welcome-curtain-right" aria-hidden="true" />

      <div className="sk-welcome-frame" aria-hidden="true">
        <span className="sk-welcome-corner sk-welcome-corner-tl">✦</span>
        <span className="sk-welcome-corner sk-welcome-corner-tr">✦</span>
        <span className="sk-welcome-corner sk-welcome-corner-bl">✦</span>
        <span className="sk-welcome-corner sk-welcome-corner-br">✦</span>
      </div>

      <button
        type="button"
        className="sk-welcome-skip"
        onClick={() => setLeaving(true)}
      >
        Skip Intro <span aria-hidden="true">↗</span>
      </button>

      <div className="sk-welcome-center">
        <div className="sk-welcome-logo">
          <Image
            src="/srikalahasti-logo.png"
            alt="Srikalahasti Kalamkari"
            width={154}
            height={154}
            priority
          />
        </div>

        <div className="sk-welcome-rule" />

        <div className="sk-welcome-script">
          <span>Welcome to</span>
        </div>

        <h1 className="sk-welcome-title">
          Srikalahasti
          <span>KALAMKARI</span>
        </h1>

        <p className="sk-welcome-caption">
          THE ART OF TIMELESS HERITAGE
        </p>
      </div>

      <div className="sk-welcome-bottom">
        <span>✦</span>
        AN HEIRLOOM OF INDIAN ARTISTRY
        <span>✦</span>
      </div>
    </div>
  );
}
