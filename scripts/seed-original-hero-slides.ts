import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

// Explicit one-time setup only. This script never edits existing slides and
// intentionally does nothing after an admin has emptied a previously seeded slider.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
const slides = [
  {
    title: "Tradition, carried forward by hand.",
    highlight: "Made to be treasured.",
    eyebrow: "SRIKALAHASTI KALAMKARI · HAND-PAINTED HERITAGE",
    description: "Discover expressive hand-painted Kalamkari, shaped by generations of Srikalahasti artisans.",
    primaryLabel: "Explore the collection",
    primaryHref: "/shop",
    secondaryLabel: "Our craft",
    secondaryHref: "/about",
    animation: "zoom",
    textPosition: "left",
  },
  {
    title: "Artistry in every detail.",
    highlight: "A story in every stroke.",
    eyebrow: "ROOTED IN SRIKALAHASTI",
    description: "Meet timeless motifs and thoughtful pieces, painted with care and made for today.",
    primaryLabel: "Shop handcrafted pieces",
    primaryHref: "/shop",
    secondaryLabel: "Discover our story",
    secondaryHref: "/about",
    animation: "fade",
    textPosition: "left",
  },
  {
    title: "Wear the art.",
    highlight: "Keep the tradition close.",
    eyebrow: "THE SRIKALAHASTI EDIT",
    description: "Find a piece of living heritage for celebrations, everyday moments and generations to come.",
    primaryLabel: "Shop sarees",
    primaryHref: "/shop?category=Sarees",
    secondaryLabel: "View all collections",
    secondaryHref: "/shop",
    animation: "slide",
    textPosition: "left",
  },
].map((slide, sortOrder) => ({
  id: `hero-initial-${randomUUID()}`,
  enabled: true,
  sortOrder,
  mediaType: "image",
  desktopImage: "/hero/heritage-desktop.jpg",
  mobileImage: "/hero/heritage-desktop.jpg",
  desktopVideo: null,
  mobileVideo: null,
  videoUrl: null,
  desktopSourceUrl: null,
  mobileSourceUrl: null,
  posterImage: null,
  ...slide,
  duration: 5000,
  videoFallbackMs: 30000,
  soundControlsEnabled: true,
  initialMuted: true,
  transitionMs: 1100,
  overlayOpacity: 0.5,
}));

async function main() {

try {
  const database = await prisma.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  if (!database[0]?.name) throw new Error("Unable to confirm current database identity");
  const exists = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ${database[0].name} AND TABLE_NAME = 'HeroSlide'`;
  if (Number(exists[0]?.count) !== 1) throw new Error("HeroSlide table is missing; apply the approved migration first");
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS HeroSlideSeedMarker (
    marker VARCHAR(64) NOT NULL PRIMARY KEY,
    seededAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  const count = await prisma.heroSlide.count();
  if (count > 0) {
    console.log(`No changes: ${count} Hero Slider slide(s) already exist in ${database[0].name}.`);
  } else {
    await prisma.$transaction(async tx => {
      const markerInserted = await tx.$executeRaw`INSERT IGNORE INTO HeroSlideSeedMarker (marker) VALUES ('initial-v1')`;
      if (markerInserted !== 1) {
        console.log("No changes: the one-time starter seed has already been recorded.");
        return;
      }
      const locked = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM HeroSlide FOR UPDATE`;
      if (Number(locked[0]?.count) !== 0) throw new Error("Slides appeared during seed; refusing to overwrite admin data");
      await tx.heroSlide.createMany({ data: slides });
    });
    console.log(`Seeded ${slides.length} starter slides in ${database[0].name}.`);
  }
} finally {
  await prisma.$disconnect();
}

}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
