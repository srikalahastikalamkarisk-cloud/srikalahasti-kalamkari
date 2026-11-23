import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import AboutProcess from "@/components/about-process";
import { getAboutPageContent } from "@/lib/about-page";
import { TeamDisplay } from "@/components/about-team";
import Link from "next/link";
import "./about-page.css";

export const metadata = { title: "Our Heritage | Srikalahasti Kalamkari", description: "Discover the heritage, makers and freehand pen-drawing artistry behind Srikalahasti Kalamkari.", alternates: { canonical: "https://srikalahastikalamkari.in/about" }, openGraph: { title: "Our Heritage | Srikalahasti Kalamkari", description: "Discover the heritage, makers and freehand pen-drawing artistry behind Srikalahasti Kalamkari.", url: "https://srikalahastikalamkari.in/about", type: "article" as const } };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const content = await getAboutPageContent();
  const visibleHighlights = content.highlights.items.filter(item => item.visible);
  const roots = content.roots;
  const ending = content.ending;
  return <><PremiumHeader/><main className="ska">
    <section className="ska-hero"><div className="ska-container"><p className="ska-kicker">{content.hero.eyebrow}</p><h1>{content.hero.heading} <em>{content.hero.highlight}</em></h1><p>{content.hero.description}</p><a href={content.hero.ctaHref} className="ska-hero-scroll">{content.hero.ctaText} <span>↓</span></a></div></section>
    <section className="ska-story" id="our-story"><div className="ska-container ska-story-grid"><div className="ska-story-photo"><img src={roots.image || "/images/products/ivory-peacock.webp"} alt={roots.imageAlt}/><span>{roots.caption}</span></div><div className="ska-story-copy"><p className="ska-kicker">{roots.eyebrow}</p><h2>{roots.heading} <em>{roots.highlight}</em><br/>{roots.suffix}</h2><div className="ska-rule"/><p>{roots.descriptionOne}</p><p>{roots.descriptionTwo}</p><p>{roots.descriptionThree}</p><Link href={roots.ctaHref} className="ska-cta">{roots.ctaText} <span>↗</span></Link></div></div></section>
    {visibleHighlights.length > 0 && <section className="ska-values"><div className="ska-container">{content.highlights.eyebrow&&<p className="ska-kicker">{content.highlights.eyebrow}</p>}{content.highlights.heading&&<h2>{content.highlights.heading}</h2>}<div className="ska-values-grid">{visibleHighlights.map(item=><div key={item.number}><span>{item.number}</span><strong>{item.title}</strong><small>{item.description}</small></div>)}</div></div></section>}
    <section className="ska-process"><div className="ska-container"><p className="ska-kicker">{content.process.eyebrow}</p><h2>{content.process.heading} <em>{content.process.highlight}</em></h2><p className="ska-subtitle">{content.process.subtitle}</p><AboutProcess steps={content.process.steps}/></div></section>
    <TeamDisplay team={content.team}/>
    {ending.visible && <section className="ska-end"><div className="ska-container"><p className="ska-kicker">{ending.eyebrow}</p><h2>{ending.heading}<br/><em>{ending.highlight}</em></h2><p>{ending.description}</p><Link href={ending.ctaHref} className="ska-cta">{ending.ctaText} <span>↗</span></Link></div></section>}
  </main><PremiumFooter/></>;
}
