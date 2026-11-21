"use client";
import { useEffect, useRef, useState } from "react";
import { kalamkariJourneySteps } from "@/data/kalamkari-journey";
import "./kalamkari-journey.css";

const DURATION = 6000;
export default function KalamkariJourney() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const touchStart = useRef<number | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const steps = kalamkariJourneySteps;
  const count = steps.length;
  const go = (n: number) => setIndex(((n % count) + count) % count);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update(); mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setTimeout(() => setIndex(i => (i + 1) % count), DURATION);
    return () => window.clearTimeout(timer);
  }, [index, paused, reduceMotion, count]);
  useEffect(() => {
    const node = introRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { node.classList.add("kj-intro-visible"); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIntroVisible(true); observer.disconnect(); }
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const step = steps[index];
  return (
    <section className={`kj-section ${introVisible ? "kj-intro-visible" : ""}`} id="making-process" aria-label="The Kalamkari Making Process" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}>

      <div className="kj-cinematic" ref={introRef} aria-label="The Art of Kalamkari introduction">
        <div className="kj-cinematic-glow" aria-hidden="true" />
        <svg className="kj-ornament kj-ornament-left" viewBox="0 0 130 260" fill="none" aria-hidden="true"><path d="M112 248 C35 202 110 155 52 110 S35 34 105 12 M52 110 C8 120 9 68 44 65 M66 150 C112 132 125 176 88 188 M65 80 C107 72 116 37 92 26" stroke="currentColor" strokeWidth="1.5"/><path d="M44 65 Q6 32 12 15 Q52 18 44 65 M88 188 Q126 191 123 224 Q85 216 88 188" stroke="currentColor" strokeWidth="1.2"/></svg>
        <svg className="kj-ornament kj-ornament-right" viewBox="0 0 130 260" fill="none" aria-hidden="true"><path d="M112 248 C35 202 110 155 52 110 S35 34 105 12 M52 110 C8 120 9 68 44 65 M66 150 C112 132 125 176 88 188 M65 80 C107 72 116 37 92 26" stroke="currentColor" strokeWidth="1.5"/><path d="M44 65 Q6 32 12 15 Q52 18 44 65 M88 188 Q126 191 123 224 Q85 216 88 188" stroke="currentColor" strokeWidth="1.2"/></svg>
        <div className="kj-cinematic-inner">
          <span className="kj-cinematic-kicker">✦ A LEGACY WRITTEN BY HAND ✦</span>
          <div className="kj-writing-line"><svg className="kj-pen" viewBox="0 0 96 96" aria-hidden="true"><path d="M20 75 L57 18 Q61 12 67 17 L77 27 Q82 32 76 38 L38 77 L20 75 Z M57 18 L76 38 M20 75 L16 84 L38 77" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/><path d="M27 70 L64 29" stroke="currentColor" strokeWidth="2"/></svg><span className="kj-writing-title">The Art of Kalamkari</span></div>
          <p className="kj-cinematic-subtitle">Twelve chapters. One timeless heritage.</p>
          <span className="kj-cinematic-scroll">DISCOVER THE JOURNEY <span aria-hidden="true">↓</span></span>
        </div>
      </div>
      <div className="kj-light kj-light-one" aria-hidden="true"/><div className="kj-light kj-light-two" aria-hidden="true"/>
      <div className="kj-container">
        <div className="kj-intro"><span className="kj-eyebrow">✦ THE ART BEHIND EVERY MASTERPIECE ✦</span><h2>The Kalamkari <em>Making Process</em></h2><p>Twelve timeless chapters. One extraordinary heritage.</p></div>
        <div className="kj-main" onTouchStart={e => { touchStart.current = e.touches[0].clientX; }} onTouchEnd={e => { if (touchStart.current === null) return; const dx = e.changedTouches[0].clientX - touchStart.current; if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1)); touchStart.current = null; }}>
          <div className="kj-copy" key={'text-'+index} aria-live="polite">
            <div className="kj-step-label"><span className="kj-mini-line"/> CHAPTER {String(index+1).padStart(2,'0')} <span className="kj-divider">/</span> {String(count).padStart(2,'0')}</div>
            <h3>{step.title}</h3><p>{step.description}</p>
            <div className="kj-actions"><button type="button" aria-label="Previous process step" onClick={() => go(index-1)}>←</button><button type="button" aria-label="Next process step" onClick={() => go(index+1)}>→</button><span>Explore the journey</span></div>
          </div>
          <div className="kj-visual" key={'image-'+index}>
            <div className="kj-photo-frame">
              {!failedImages[index] ? <img src={step.image} alt={`${step.title} — Srikalahasti Kalamkari process`} onError={() => setFailedImages(p => ({...p, [index]: true}))}/> : <div className="kj-photo-fallback"><span>✦</span><strong>{step.title}</strong><small>Add photo: {step.image}</small></div>}
              <div className="kj-photo-shade"/><div className="kj-photo-caption">SRIKALAHASTI · HANDCRAFTED HERITAGE</div>
            </div><div className="kj-frame-corner" aria-hidden="true"/>
          </div>
        </div>
        <div className="kj-timeline"><div className="kj-timeline-top"><span>THE TWELVE CHAPTERS</span><span>{String(index+1).padStart(2,'0')} <span className="kj-divider">/</span> {String(count).padStart(2,'0')}</span></div>
          <div className="kj-segments" role="group" aria-label="Choose process step">{steps.map((s,i) => <button key={i} type="button" className={`kj-segment ${i === index ? 'is-active' : ''} ${i < index ? 'is-past' : ''}`} onClick={() => go(i)} aria-label={`Step ${i+1}: ${s.title}`} aria-current={i === index ? 'step' : undefined}><span className="kj-segment-fill" style={i === index ? {animationDuration: `${DURATION}ms`, animationPlayState: paused || reduceMotion ? 'paused' : 'running'} : undefined}/></button>)}</div>
          <div className="kj-timeline-bottom"><span>01 · BEGINNING</span><span>12 · MASTERPIECE</span></div>
        </div>
      </div>
    </section>
  );
}
