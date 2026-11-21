import { kalamkariJourneySteps } from "@/data/kalamkari-journey";

export type AboutPageContent = {
  hero: { eyebrow: string; heading: string; highlight: string; description: string; ctaText: string; ctaHref: string };
  roots: { eyebrow: string; heading: string; highlight: string; suffix: string; descriptionOne: string; descriptionTwo: string; descriptionThree: string; image: string; imageAlt: string; caption: string; ctaText: string; ctaHref: string };
  highlights: { eyebrow: string; heading: string; items: { title: string; description: string; number: string; visible: boolean }[] };
  process: { eyebrow: string; heading: string; highlight: string; subtitle: string; steps: { number: string; title: string; description: string; image: string; caption: string; visible: boolean }[] };
  team: { eyebrow: string; heading: string; subtitle: string; members: { id: string; name: string; role: string; photo: string; bio: string; visible: boolean }[] };
  ending: { eyebrow: string; heading: string; highlight: string; description: string; ctaText: string; ctaHref: string; visible: boolean };
};

export const defaultAboutPageContent: AboutPageContent = {
  hero: { eyebrow: "EST. IN HERITAGE · MADE BY HAND", heading: "Art that carries", highlight: "a story.", description: "From the hands of Srikalahasti artisans to the homes of those who cherish tradition.", ctaText: "DISCOVER OUR HERITAGE", ctaHref: "#our-story" },
  roots: { eyebrow: "01 / OUR ROOTS", heading: "Rooted in", highlight: "Srikalahasti.", suffix: "Made to be treasured.", descriptionOne: "Srikalahasti Kalamkari celebrates the artistry of hand-painted textiles from Andhra Pradesh. Every design reflects generations of skill, patience and storytelling.", descriptionTwo: "From the first outline drawn with a kalam to the careful layering of colour, we value the hands and traditions behind every piece.", descriptionThree: "Our purpose is simple: honour a living craft and bring its beauty into everyday life.", image: "/images/products/ivory-peacock.webp", imageAlt: "Illustrative Kalamkari textile with traditional motifs", caption: "HANDCRAFTED HERITAGE", ctaText: "Explore the collection", ctaHref: "/shop" },
  highlights: { eyebrow: "", heading: "", items: [
    { number: "01", title: "Drawn by hand", description: "Every line carries intention", visible: true },
    { number: "02", title: "Inspired by heritage", description: "Stories woven into every motif", visible: true },
    { number: "03", title: "Made with patience", description: "Time-honoured artistry", visible: true },
  ] },
  process: { eyebrow: "02 / THE ART OF MAKING", heading: "From plain cloth to", highlight: "living art.", subtitle: "Explore the stages of the Kalamkari craft, one detail at a time.", steps: kalamkariJourneySteps.map((step, i) => ({ number: String(i + 1).padStart(2, "0"), ...step, caption: "", visible: true })) },
  team: { eyebrow: "03 / THE PEOPLE BEHIND THE ART", heading: "The hands behind the heritage", subtitle: "Meet the people who keep our craft alive.", members: [] },
  ending: { eyebrow: "THE HERITAGE CONTINUES", heading: "Crafted by hand.", highlight: "Cherished for generations.", description: "Discover pieces inspired by the spirit of Srikalahasti.", ctaText: "Shop our collections", ctaHref: "/shop", visible: true },
};

const internalHref = (value: unknown) => typeof value === "string" && value.length <= 500 && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value);
export function validateAboutPageContent(value: unknown): value is AboutPageContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as AboutPageContent;
  const textOk = (v: unknown, max = 2500) => typeof v === "string" && v.length <= max;
  const hrefOk = (v: unknown) => internalHref(v) || v === "#our-story";
  const imageOk = (v: unknown) => typeof v === "string" && (v === "" || v.startsWith("/api/media/products/") || v.startsWith("/images/")) && v.length <= 500 && !v.includes("..") && !/[\\?#\u0000-\u001f]/.test(v);
  const section = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== "object") return false;
    const record = v as Record<string, unknown>;
    return keys.every(k => textOk(record[k], k.toLowerCase().includes("description") ? 2500 : 500));
  };
  return section(candidate.hero, ["eyebrow", "heading", "highlight", "description", "ctaText"]) && hrefOk(candidate.hero.ctaHref)
    && section(candidate.roots, ["eyebrow", "heading", "highlight", "suffix", "descriptionOne", "descriptionTwo", "descriptionThree", "imageAlt", "caption", "ctaText"])
    && imageOk(candidate.roots.image) && hrefOk(candidate.roots.ctaHref)
    && section(candidate.highlights, ["eyebrow", "heading"]) && Array.isArray(candidate.highlights.items) && candidate.highlights.items.length === 3 && candidate.highlights.items.every(x => section(x, ["title", "description", "number"]) && typeof x.visible === "boolean")
    && section(candidate.process, ["eyebrow", "heading", "highlight", "subtitle"]) && Array.isArray(candidate.process.steps) && candidate.process.steps.length <= 20 && candidate.process.steps.every(x => section(x, ["number", "title", "description", "caption"]) && imageOk(x.image) && typeof x.visible === "boolean")
    && section(candidate.team, ["eyebrow", "heading", "subtitle"]) && Array.isArray(candidate.team.members) && candidate.team.members.length <= 30 && candidate.team.members.every(x => section(x, ["id", "name", "role", "bio"]) && imageOk(x.photo) && typeof x.visible === "boolean")
    && section(candidate.ending, ["eyebrow", "heading", "highlight", "description", "ctaText"]) && hrefOk(candidate.ending.ctaHref) && typeof candidate.ending.visible === "boolean";
}
