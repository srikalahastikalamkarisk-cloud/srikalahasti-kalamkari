import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat, unlink, lstat } from "node:fs/promises";
import { extname } from "node:path";

const execute = promisify(execFile);

export type VideoPurpose =
  | "hero-desktop"
  | "hero-mobile"
  | "story";

const profiles = {
  "hero-desktop": {
    width: 1920,
    height: 1080,
    bitrate: "3000k",
    buffer: "6000k",
  },
  "hero-mobile": {
    width: 1080,
    height: 1920,
    bitrate: "1800k",
    buffer: "3600k",
  },
  story: {
    width: 1080,
    height: 1920,
    bitrate: "1800k",
    buffer: "3600k",
  },
} as const;

let processing = false;

export async function optimizeVideoFile(
  inputPath: string,
  outputPath: string,
  purpose: VideoPurpose = "story",
) {
  if (inputPath === outputPath) {
    throw new Error("Input and output must be different files");
  }

  if (processing) {
    throw new Error("Video optimizer is busy. Please retry.");
  }

  processing = true;

  let outputStarted = false;

  try {
    const input = await stat(inputPath);

    if (!input.isFile() || input.size < 1) {
      throw new Error("Invalid video input");
    }

    const demuxers: Record<string, string> = {
      ".mp4": "mov",
      ".mov": "mov",
      ".m4v": "mov",
      ".3gp": "mov",
      ".avi": "avi",
      ".mkv": "matroska",
      ".webm": "matroska",
      ".mpeg": "mpeg",
      ".mpg": "mpeg",
      ".wmv": "asf",
    };

    const demuxer = demuxers[extname(inputPath).toLowerCase()];

    if (!demuxer) {
      throw new Error("Unsupported video container");
    }

    const inputOptions = [
      "-protocol_whitelist", "file",
      "-f", demuxer,
      ...(demuxer === "mov"
        ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
        : [])
    ];

    const existingOutput = await lstat(outputPath).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (existingOutput) {
      throw new Error("Output file already exists");
    }

    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";

    const probe = await execute(ffprobe, [
      "-v", "error",
      ...inputOptions,
      "-show_format",
      "-show_streams",
      "-of", "json",
      inputPath,
    ], {
      timeout: 15000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });

    const metadata = JSON.parse(probe.stdout);

    const video = metadata.streams?.find(
      (stream: { codec_type: string }) =>
        stream.codec_type === "video"
    );

    const duration = Number(metadata.format?.duration);

    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 600
    ) {
      throw new Error("Invalid video or duration exceeds 10 minutes");
    }

    if (
      !Number.isFinite(video.width) ||
      !Number.isFinite(video.height) ||
      video.width < 2 ||
      video.height < 2 ||
      video.width * video.height > 35_000_000
    ) {
      throw new Error("Unsupported video resolution");
    }

    const profile = profiles[purpose];

    const filter =
      "scale=w='min(iw," + profile.width + ")':" +
      "h='min(ih," + profile.height + ")':" +
      "force_original_aspect_ratio=decrease:" +
      "force_divisible_by=2,setsar=1";

    outputStarted = true;

    await execute(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-n",
      "-threads", "1",
      ...inputOptions,
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-map_metadata", "-1",
      "-map_chapters", "-1",
      "-sn",
      "-dn",
      "-filter_threads", "1",
      "-vf", filter,
      "-fpsmax", "30",
      "-t", String(duration),
      "-fs", String(50 * 1024 * 1024),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-maxrate", profile.bitrate,
      "-bufsize", profile.buffer,
      "-pix_fmt", "yuv420p",
      "-threads", "1",
      "-c:a", "aac",
      "-b:a", "96k",
      "-ac", "2",
      "-movflags", "+faststart",
      "-f", "mp4",
      outputPath,
    ], {
      timeout: 300000,
      maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL",
    });

    const output = await stat(outputPath);

    if (!output.isFile() || output.size < 1) {
      throw new Error("Video conversion produced an empty file");
    }

    const verification = await execute(ffprobe, [
      "-v", "error",
      "-protocol_whitelist", "file",
      "-f", "mov",
      "-enable_drefs", "0",
      "-show_format",
      "-show_streams",
      "-of", "json",
      outputPath
    ], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL"
    });

    const finalMetadata = JSON.parse(verification.stdout);
    const finalVideo = finalMetadata.streams?.find(
      (stream: { codec_type: string }) =>
        stream.codec_type === "video"
    );

    const finalDuration = Number(finalMetadata.format?.duration);

    if (
      !finalVideo ||
      finalVideo.codec_name !== "h264" ||
      finalVideo.width > profile.width ||
      finalVideo.height > profile.height ||
      !Number.isFinite(finalDuration) ||
      Math.abs(finalDuration - duration) > 1 ||
      output.size > 50 * 1024 * 1024
    ) {
      throw new Error("Optimized video verification failed");
    }

    return {
      originalSize: input.size,
      optimizedSize: output.size,
      duration,
      format: "mp4" as const,
      mime: "video/mp4" as const,
    };
  } catch (error) {
    // Caller must supply a fresh, unique temporary output path.
    if (outputStarted) {
      await unlink(outputPath).catch(() => undefined);
    }

    throw error;
  } finally {
    processing = false;
  }
}
