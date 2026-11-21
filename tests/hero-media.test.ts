import assert from "node:assert/strict";
import test from "node:test";
import { detectVideoUrlType, embedUrl, externalSourceError, instagramPath, pinterestPinId, removeHeroMediaField, slideAdvanceDelay, validateSlideMedia, youtubeId } from "../src/lib/hero-media";

test("accepts supported YouTube URL forms and rejects unrelated hosts", () => {
  assert.equal(youtubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(youtubeId("https://notyoutube.com/watch?v=abcdefghijk"), null);
  assert.equal(externalSourceError("youtube", "https://example.com/abcdefghijk"), "Use a YouTube watch, short, embed, or Shorts URL.");
});

test("accepts official Instagram and Pinterest embed source formats", () => {
  assert.equal(instagramPath("https://www.instagram.com/reel/ABC123/"), "/reel/ABC123/");
  assert.equal(embedUrl("instagram", "https://instagram.com/reel/ABC123"), "https://www.instagram.com/reel/ABC123/embed/");
  const ytPlayer = new URL(embedUrl("youtube", "https://youtu.be/abcdefghijk")!);
  assert.equal(ytPlayer.searchParams.get("enablejsapi"), "1");
  assert.equal(ytPlayer.searchParams.get("loop"), null, "the player must emit an ended event for slider advance");
  assert.equal(new URL(embedUrl("youtube", "https://youtu.be/abcdefghijk", "", false)!).searchParams.get("autoplay"), "0");
  assert.equal(pinterestPinId("https://www.pinterest.com/pin/1234567890/"), "1234567890");
  assert.equal(embedUrl("pinterest", "https://pinterest.com/pin/1234567890"), "https://assets.pinterest.com/ext/embed.html?id=1234567890");
  assert.match(externalSourceError("pinterest", "https://pin.it/short") ?? "", /full Pinterest Pin URL/);
});

test("direct sources require public HTTPS URLs", () => {
  assert.equal(externalSourceError("direct", "https://cdn.example.com/banner.mp4"), null);
  assert.equal(detectVideoUrlType("https://cdn.example.com/banner.webm"), "direct");
  assert.equal(detectVideoUrlType("https://youtu.be/abcdefghijk"), "youtube");
  assert.equal(detectVideoUrlType("https://www.instagram.com/reel/ABC123/"), "instagram");
  assert.equal(detectVideoUrlType("https://www.pinterest.com/pin/1234567890/"), "pinterest");
  assert.equal(detectVideoUrlType("https://example.com/article"), null);
  assert.match(externalSourceError("direct", "https://cdn.example.com/page") ?? "", /MP4 or WebM/);
  assert.match(externalSourceError("direct", "http://cdn.example.com/banner.mp4") ?? "", /public HTTPS/);
  assert.match(externalSourceError("direct", "https://127.0.0.1/video.mp4") ?? "", /public HTTPS/);
  assert.match(externalSourceError("direct", "https://user:pass@cdn.example.com/video.mp4") ?? "", /public HTTPS/);
});

test("removing a media field clears only that field and keeps shared files untouched", () => {
  const before = { desktopImage: "/desktop.jpg", mobileImage: "/mobile.jpg", desktopVideo: "/desktop.mp4", mobileVideo: "/mobile.mp4", posterImage: "/poster.jpg", desktopSourceUrl: "https://youtu.be/abcdefghijk", mobileSourceUrl: "", videoUrl: "legacy" };
  const withoutMobile = removeHeroMediaField(before, "mobileImage");
  assert.equal(withoutMobile.mobileImage, "");
  assert.equal(withoutMobile.desktopImage, before.desktopImage);
  assert.equal(withoutMobile.mobileVideo, before.mobileVideo);
  const withoutDesktopVideo = removeHeroMediaField(before, "desktopVideo");
  assert.equal(withoutDesktopVideo.desktopVideo, "");
  assert.equal(withoutDesktopVideo.mobileVideo, before.mobileVideo);
  assert.equal(withoutDesktopVideo.videoUrl, "", "clears legacy desktop video fallback too");
  assert.equal(removeHeroMediaField(before, "mobileVideo").videoUrl, "legacy");
  const withoutPoster = removeHeroMediaField(before, "posterImage");
  assert.equal(withoutPoster.posterImage, "");
  assert.equal(withoutPoster.desktopImage, before.desktopImage);
  assert.equal(removeHeroMediaField(before, "desktopSourceUrl").videoUrl, "");
  assert.equal(before.mobileImage, "/mobile.jpg", "removal is editor-state only and does not mutate the source object");
});

test("video slides use their configured maximum fallback duration", () => {
  assert.equal(slideAdvanceDelay("image", 5000, 30000), 5000);
  assert.equal(slideAdvanceDelay("video", 5000, 30000), 30000);
  assert.equal(slideAdvanceDelay("instagram", 5000, 45000), 45000);
});

test("slide media validation requires the selected media and desktop source", () => {
  assert.match(validateSlideMedia({ mediaType: "image", desktopImage: "" }) ?? "", /desktop image/);
  assert.match(validateSlideMedia({ mediaType: "video", desktopVideo: "" }) ?? "", /desktop video/);
  assert.match(validateSlideMedia({ mediaType: "youtube", desktopSourceUrl: "" }) ?? "", /desktop source URL/);
  assert.equal(validateSlideMedia({ mediaType: "direct", desktopSourceUrl: "https://cdn.example.com/hero.mp4" }), null);
});
