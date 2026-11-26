import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { stat, unlink, lstat, readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { VideoProcessingError, type VideoFailureStage } from "@/lib/admin/video-processing-errors";

const execute = promisify(execFileCallback);

export type VideoPurpose = "hero-desktop" | "hero-mobile" | "story";

const profiles = {
  "hero-desktop": { width: 1920, height: 1080, bitrate: "3000k", buffer: "6000k" },
  "hero-mobile": { width: 1080, height: 1920, bitrate: "1800k", buffer: "3600k" },
  story: { width: 1080, height: 1920, bitrate: "1800k", buffer: "3600k" },
} as const;

let processing = false;

type ChildProcessError = Error & {
  code?: string | number;
  errno?: number;
  signal?: string | null;
  killed?: boolean;
  timedOut?: boolean;
};

async function runTool(
  executable: string,
  args: string[],
  stage: VideoFailureStage,
  timeout: number,
  signal?: AbortSignal,
) {
  try {
    return await execute(executable, args, {
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      ...(signal ? { signal } : {}),
    });
  } catch (caught) {
    const error = caught as ChildProcessError;
    const code = typeof error.code === "string" ? error.code : undefined;
    let category: ConstructorParameters<typeof VideoProcessingError>[0] = stage === "encode"
      ? "encoding_failed"
      : "invalid_media";
    if (error.name === "AbortError" || signal?.aborted) category = "client_cancelled";
    else if (code === "ENOENT") category = "executable_missing";
    else if (["EAGAIN", "EMFILE", "ENFILE"].includes(code || "")) category = "process_limit";
    else if (code === "ETIMEDOUT" || error.timedOut || (error.killed && error.signal === "SIGKILL")) category = "timeout";
    const tool = basename(executable).toLowerCase().includes("ffprobe") ? "ffprobe" : "ffmpeg";
    throw new VideoProcessingError(category, stage, `${tool} ${stage} failed`, error, tool);
  }
}

function inputDemuxer(inputPath: string) {
  const demuxers: Record<string, string> = {
    ".mp4": "mov", ".mov": "mov", ".m4v": "mov", ".3gp": "mov",
    ".avi": "avi", ".mkv": "matroska", ".webm": "matroska",
    ".mpeg": "mpeg", ".mpg": "mpeg", ".wmv": "asf",
  };
  return demuxers[extname(inputPath).toLowerCase()];
}

function inputOptions(demuxer: string) {
  return [
    "-protocol_whitelist", "file",
    "-f", demuxer,
    ...(demuxer === "mov" ? ["-enable_drefs", "0", "-use_absolute_path", "0"] : []),
  ];
}

function fail(category: ConstructorParameters<typeof VideoProcessingError>[0], stage: VideoFailureStage, message: string): never {
  throw new VideoProcessingError(category, stage, message);
}

export async function optimizeVideoFile(
  inputPath: string,
  outputPath: string,
  purpose: VideoPurpose = "story",
  signal?: AbortSignal,
) {
  if (inputPath === outputPath) fail("invalid_input", "upload", "Input and output must be different files");
  if (processing) fail("busy", "lock", "Video processing is already in progress");
  processing = true;
  let outputStarted = false;
  let stage: VideoFailureStage = "upload";

  try {
    const input = await stat(inputPath).catch(error => {
      const code = (error as NodeJS.ErrnoException).code;
      const category = code === "EACCES" || code === "EPERM" ? "storage_permission" : "invalid_input";
      throw new VideoProcessingError(category, "upload", "Video input could not be read", error);
    });
    if (!input.isFile() || input.size < 1 || input.size > 50 * 1024 * 1024) {
      fail("invalid_input", "upload", "Video input is empty or exceeds the upload limit");
    }

    const demuxer = inputDemuxer(inputPath);
    if (!demuxer) fail("unsupported_format", "probe", "Unsupported video container");
    const probeOptions = inputOptions(demuxer);
    const existingOutput = await lstat(outputPath).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new VideoProcessingError("storage_permission", "store", "Cannot inspect output path", error);
    });
    if (existingOutput) fail("output_invalid", "store", "Output file already exists");

    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    stage = "probe";
    const probe = await runTool(ffprobe, [
      "-v", "error", ...probeOptions, "-show_format", "-show_streams", "-of", "json", inputPath,
    ], stage, 15_000, signal);

    let metadata: { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    try { metadata = JSON.parse(probe.stdout); }
    catch (error) { throw new VideoProcessingError("invalid_media", stage, "Video metadata was not valid JSON", error); }

    const streams = metadata.streams || [];
    const video = streams.find(stream => stream.codec_type === "video");
    const hasAudio = streams.some(stream => stream.codec_type === "audio");
    const duration = Number(metadata.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0) {
      fail("invalid_media", stage, "Video stream or duration is invalid");
    }
    if (duration > 600) fail("duration_limit", stage, "Video duration exceeds 10 minutes");
    const width = Number(video.width);
    const height = Number(video.height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 || width * height > 35_000_000) {
      fail("resolution_limit", stage, "Video resolution is unsupported");
    }

    const profile = profiles[purpose];
    const filter =
      "scale=w='min(iw," + profile.width + ")':" +
      "h='min(ih," + profile.height + ")':" +
      "force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";

    stage = "encode";
    outputStarted = true;
    await runTool(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
      "-threads", "1", ...probeOptions, "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
      "-sn", "-dn", "-filter_threads", "1", "-vf", filter, "-fpsmax", "30",
      "-t", String(duration), "-fs", String(50 * 1024 * 1024),
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-maxrate", profile.bitrate, "-bufsize", profile.buffer, "-pix_fmt", "yuv420p",
      "-threads", "1", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-movflags", "+faststart", "-f", "mp4", outputPath,
    ], stage, 300_000, signal);

    const output = await stat(outputPath).catch(error => {
      throw new VideoProcessingError("output_invalid", "verify", "Encoder output is missing", error);
    });
    if (!output.isFile() || output.size < 1 || output.size > 50 * 1024 * 1024) {
      fail("output_invalid", "verify", "Encoder output is empty or exceeds the storage limit");
    }

    stage = "verify";
    const verification = await runTool(ffprobe, [
      "-v", "error", "-protocol_whitelist", "file", "-f", "mov", "-enable_drefs", "0",
      "-show_format", "-show_streams", "-of", "json", outputPath,
    ], stage, 15_000, signal);
    let finalMetadata: { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
    try { finalMetadata = JSON.parse(verification.stdout); }
    catch (error) { throw new VideoProcessingError("output_invalid", stage, "Output metadata was not valid JSON", error); }

    const finalStreams = finalMetadata.streams || [];
    const finalVideo = finalStreams.find(stream => stream.codec_type === "video");
    const finalAudio = finalStreams.find(stream => stream.codec_type === "audio");
    const finalDuration = Number(finalMetadata.format?.duration);
    if (
      !finalVideo || finalVideo.codec_name !== "h264" ||
      finalVideo.pix_fmt !== "yuv420p" ||
      Number(finalVideo.width) > profile.width || Number(finalVideo.height) > profile.height ||
      (hasAudio && finalAudio?.codec_name !== "aac") ||
      !Number.isFinite(finalDuration) || Math.abs(finalDuration - duration) > 1
    ) {
      fail("output_invalid", stage, "Optimized video failed compatibility checks");
    }

    return { originalSize: input.size, optimizedSize: output.size, duration, format: "mp4" as const, mime: "video/mp4" as const };
  } catch (error) {
    if (outputStarted) await unlink(outputPath).catch(() => undefined);
    if (error instanceof VideoProcessingError) throw error;
    throw new VideoProcessingError("internal", stage, "Video processing failed", error);
  } finally {
    processing = false;
  }
}

export async function generateVideoPosterFile(inputPath: string, outputPath: string, signal?: AbortSignal) {
  const existing = await lstat(outputPath).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new VideoProcessingError("storage_permission", "store", "Cannot inspect poster path", error);
  });
  if (existing) fail("output_invalid", "store", "Poster output already exists");

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  await runTool(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-threads", "1",
    "-ss", "0", "-i", inputPath, "-map", "0:v:0", "-frames:v", "1", "-an", "-sn", "-dn",
    "-vf", "scale=w='min(iw,640)':h='min(ih,800)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v", "mjpeg", "-q:v", "4", "-f", "image2", outputPath,
  ], "verify", 20_000, signal);
  const output = await stat(outputPath).catch(error => {
    throw new VideoProcessingError("output_invalid", "verify", "Generated poster is missing", error);
  });
  if (!output.isFile() || output.size < 1 || output.size > 2 * 1024 * 1024) {
    await unlink(outputPath).catch(() => undefined);
    fail("output_invalid", "verify", "Generated poster is empty or exceeds its size limit");
  }
  const header = await readFile(outputPath).then(bytes => bytes.subarray(0, 3));
  if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
    await unlink(outputPath).catch(() => undefined);
    fail("output_invalid", "verify", "Generated poster is not a valid JPEG image");
  }
  return { size: output.size, format: "jpeg" as const };
}
