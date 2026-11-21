export type HeroMediaType = "image" | "video" | "youtube" | "instagram" | "pinterest" | "direct";

export type HeroSlide = {
  id: string;
  enabled: boolean;
  mediaType: HeroMediaType;
  desktopVideo?: string;
  mobileVideo?: string;
  videoUrl?: string;
  desktopSourceUrl?: string;
  mobileSourceUrl?: string;
  posterImage?: string;
  desktopImage: string;
  mobileImage: string;
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  duration: number;
  videoFallbackMs: number;
  soundControlsEnabled: boolean;
  initialMuted: boolean;
  transitionMs: number;
  animation: "fade" | "zoom" | "slide";
  textPosition: "left" | "center" | "right";
  overlayOpacity: number;
};

// Kept as an empty typed export for archived source snapshots; the active homepage loads only from Prisma.
export const heroSlides: Array<Omit<HeroSlide, "mediaType"> & { mediaType?: "image" | "video" | "youtube" | "instagram" }> = [];
