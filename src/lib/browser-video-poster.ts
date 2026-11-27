"use client";

export async function createVideoPoster(
  source: File | string
): Promise<File> {
  const video = document.createElement("video");
  const objectUrl = typeof source === "string"
    ? null
    : URL.createObjectURL(source);

  try {
    return await new Promise<File>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Thumbnail generation timed out"));
      }, 12000);

      const fail = () => {
        window.clearTimeout(timer);
        reject(new Error("Unable to decode video thumbnail"));
      };

      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      video.onerror = fail;

      video.onloadeddata = () => {
        if (video.duration > 0.5) {
          video.currentTime = Math.min(
            0.8,
            video.duration / 3
          );
        } else {
          capture();
        }
      };

      function capture() {
        try {
          if (!video.videoWidth || !video.videoHeight) {
            fail();
            return;
          }

          const scale = Math.min(
            1,
            640 / Math.max(
              video.videoWidth,
              video.videoHeight
            )
          );

          const canvas = document.createElement("canvas");

          canvas.width = Math.max(
            1, Math.round(video.videoWidth * scale)
          );

          canvas.height = Math.max(
            1, Math.round(video.videoHeight * scale)
          );

          const context = canvas.getContext("2d");

          if (!context) {
            fail();
            return;
          }

          context.drawImage(
            video, 0, 0,
            canvas.width, canvas.height
          );

          canvas.toBlob(blob => {
            window.clearTimeout(timer);

            if (!blob) {
              fail();
              return;
            }

            resolve(new File(
              [blob],
              "story-thumbnail.jpg",
              { type: "image/jpeg" }
            ));
          }, "image/jpeg", 0.85);
        } catch {
          fail();
        }
      }

      video.onseeked = capture;
      video.src = objectUrl ?? String(source);
      video.load();
    });
  } finally {
    video.onloadeddata = null;
    video.onseeked = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadVideoPoster(
  source: File | string
): Promise<string> {
  const poster = await createVideoPoster(source);
  const body = new FormData();
  body.append("file", poster);

  const response = await fetch("/api/admin/media", {
    method: "POST",
    credentials: "same-origin",
    body,
    signal: AbortSignal.timeout(20000)
  });

  const result = await response.json();

  if (response.status === 409 && result.assetId) {
    const library = await fetch(
      "/api/admin/media?q=story-thumbnail.jpg",
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      }
    );

    if (library.ok) {
      const data = await library.json();

      const asset = data.assets?.find(
        (item: { id: string }) =>
          item.id === result.assetId
      );

      if (asset?.storageKey) {
        return `/api/media/products/${asset.storageKey}`;
      }
    }
  }

  if (!response.ok || !result.asset?.storageKey) {
    throw new Error("Thumbnail upload failed");
  }

  return `/api/media/products/${result.asset.storageKey}`;
}
