import "server-only";
import { prisma } from "@/lib/prisma";
import { defaultAboutPageContent, validateAboutPageContent, type AboutPageContent } from "@/lib/about-page-content";

export async function getAboutPageContent(): Promise<AboutPageContent> {
  try {
    const row = await prisma.aboutPageContent.findUnique({ where: { id: "primary" } });
    return row && validateAboutPageContent(row.content) ? row.content : defaultAboutPageContent;
  } catch (error) {
    console.error("About Page content load failed", error);
    return defaultAboutPageContent;
  }
}
