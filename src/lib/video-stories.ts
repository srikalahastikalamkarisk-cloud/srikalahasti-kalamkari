import { prisma } from "@/lib/prisma";

export type HomepageVideoStory = {
  id: string;
  title: string;
  mp4: string;
  mobileMp4?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  pinterestUrl?: string;
  poster?: string;
  enabled: boolean;
};

export async function getHomepageVideoStories(): Promise<HomepageVideoStory[]> {
  const rows = await prisma.videoStory.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(row => {
    const url = row.sourceType === "upload"
      ? row.videoFile || ""
      : row.videoUrl || "";

    let youtubeUrl: string | undefined;
    let instagramUrl: string | undefined;
    let pinterestUrl: string | undefined;
    let mp4 = "";

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(hostname)) {
        youtubeUrl = url;
      } else if (["instagram.com", "www.instagram.com"].includes(hostname)) {
        instagramUrl = url;
      } else if (["pinterest.com", "www.pinterest.com", "pin.it"].includes(hostname)) {
        pinterestUrl = url;
      } else {
        mp4 = url;
      }
    } catch {
      mp4 = url;
    }

    return {
      id: row.id,
      title: row.title,
      mp4,
      mobileMp4: row.mobileUrl &&
        (
          row.mobileUrl.startsWith("/") &&
          !row.mobileUrl.startsWith("//") ||
          /^https:\/\/[^\s?#]+\.(mp4|webm)(?:[?#]|$)/i.test(row.mobileUrl)
        )
          ? row.mobileUrl
          : undefined,
      youtubeUrl,
      instagramUrl,
      pinterestUrl,
      poster: row.posterImage || undefined,
      enabled: row.enabled,
    };
  });
}
