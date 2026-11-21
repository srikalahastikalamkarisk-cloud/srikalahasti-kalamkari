import "server-only";
import { prisma } from "@/lib/prisma";
import type { HeroMediaType, HeroSlide } from "@/data/hero-slides";

export async function getHomepageHeroSlides(): Promise<HeroSlide[]> {
  try {
    const records = await prisma.heroSlide.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    return records
      .filter(slide => slide.enabled)
      .map(slide => ({
        id: slide.id,
        enabled: slide.enabled,
        mediaType: slide.mediaType as HeroMediaType,
        desktopImage: slide.desktopImage,
        mobileImage: slide.mobileImage,
        desktopVideo: slide.desktopVideo ?? undefined,
        mobileVideo: slide.mobileVideo ?? undefined,
        videoUrl: slide.videoUrl ?? undefined,
        desktopSourceUrl: slide.desktopSourceUrl ?? undefined,
        mobileSourceUrl: slide.mobileSourceUrl ?? undefined,
        posterImage: slide.posterImage ?? undefined,
        eyebrow: slide.eyebrow,
        title: slide.title,
        highlight: slide.highlight,
        description: slide.description,
        primaryLabel: slide.primaryLabel,
        primaryHref: slide.primaryHref,
        secondaryLabel: slide.secondaryLabel,
        secondaryHref: slide.secondaryHref,
        duration: slide.duration,
        videoFallbackMs: slide.videoFallbackMs,
        soundControlsEnabled: slide.soundControlsEnabled,
        initialMuted: slide.initialMuted,
        transitionMs: slide.transitionMs,
        animation: slide.animation as HeroSlide["animation"],
        textPosition: slide.textPosition as HeroSlide["textPosition"],
        overlayOpacity: slide.overlayOpacity,
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Homepage Hero Slider unavailable (${message}); rendering the neutral empty state.`);
    return [];
  }
}
