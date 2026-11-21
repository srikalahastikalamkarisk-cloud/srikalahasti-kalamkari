"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AboutPageContent } from "@/lib/about-page-content";

export default function AboutProcess({ steps }: { steps: AboutPageContent["process"]["steps"] }) {
  const visible = steps.filter(step => step.visible);
  const [activeId, setActiveId] = useState(visible[0]?.number ?? "");
  const selectedId = visible.some(item => item.number === activeId) ? activeId : visible[0]?.number;
  const active = Math.max(0, visible.findIndex(step => step.number === selectedId));
  const step = visible[active];
  const go = (index: number) => { if (visible.length) setActiveId(visible[(index + visible.length) % visible.length].number); };
  if (!step) return <p className="ska-subtitle">Process details will be shared soon.</p>;
  return <div className="ska-process-grid"><div className="ska-process-list" aria-label="Kalamkari process steps">{visible.map(item=><button type="button" key={item.number} className={item.number === step.number ? "is-active" : ""} onClick={()=>setActiveId(item.number)} aria-current={item.number === step.number ? "step" : undefined}><span className="ska-step-dot"/><span className="ska-step-number">{item.number}</span>{item.title}</button>)}</div><div className="ska-process-feature" aria-live="polite"><div className="ska-process-visual"><img src={step.image || "/images/products/indigo-heritage.webp"} alt={step.caption || step.title}/><div className="ska-process-overlay"><span>THE ART OF KALAMKARI</span><strong>{step.title}</strong>{step.caption && <small>{step.caption}</small>}</div></div><div className="ska-process-detail"><div><span className="ska-step-count">STEP {step.number} / {visible[visible.length-1]?.number}</span><h3>{step.title}</h3><p>{step.description}</p></div><div className="ska-process-arrows"><button type="button" onClick={()=>go(active-1)} aria-label="Previous step"><ChevronLeft size={19}/></button><button type="button" onClick={()=>go(active+1)} aria-label="Next step"><ChevronRight size={19}/></button></div></div></div></div>;
}
