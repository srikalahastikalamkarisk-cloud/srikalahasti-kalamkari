export type VideoFailureCategory =
  | "invalid_input"
  | "unsupported_format"
  | "invalid_media"
  | "duration_limit"
  | "resolution_limit"
  | "executable_missing"
  | "process_limit"
  | "timeout"
  | "client_cancelled"
  | "encoding_failed"
  | "output_invalid"
  | "storage_permission"
  | "storage_space"
  | "storage_link"
  | "busy"
  | "internal";

export type VideoFailureStage =
  | "lock"
  | "upload"
  | "probe"
  | "encode"
  | "verify"
  | "store";

export class VideoProcessingError extends Error {
  readonly name = "VideoProcessingError";

  constructor(
    readonly category: VideoFailureCategory,
    readonly stage: VideoFailureStage,
    message: string,
    readonly cause?: unknown,
    readonly tool?: "ffmpeg" | "ffprobe",
  ) {
    super(message);
  }
}

type SystemError = Error & {
  code?: string | number;
  errno?: number;
  signal?: string | null;
  killed?: boolean;
  timedOut?: boolean;
  cmd?: string;
};

export function videoFailureDetails(error: unknown): {
  category: VideoFailureCategory;
  stage: VideoFailureStage;
  code?: string;
  exitCode?: number;
  signal?: string;
  timedOut?: boolean;
  tool?: "ffmpeg" | "ffprobe";
} {
  if (error instanceof VideoProcessingError) {
    const cause = (error.cause instanceof Error ? error.cause : undefined) as SystemError | undefined;
    return {
      category: error.category,
      stage: error.stage,
      ...(typeof cause?.code === "string" ? { code: cause.code } : {}),
      ...(typeof cause?.code === "number" ? { exitCode: cause.code } : {}),
      ...(cause?.signal ? { signal: cause.signal } : {}),
      ...(cause?.timedOut || (cause?.killed && cause.signal === "SIGKILL") ? { timedOut: true } : {}),
      ...(error.tool ? { tool: error.tool } : {}),
    };
  }

  const cause = error instanceof Error ? error as SystemError : undefined;
  const code = typeof cause?.code === "string" ? cause.code : undefined;
  let category: VideoFailureCategory = "internal";
  let stage: VideoFailureStage = "upload";
  if (code === "ENOSPC") { category = "storage_space"; stage = "store"; }
  else if (code === "EACCES" || code === "EPERM") { category = "storage_permission"; stage = "store"; }
  else if (code === "EXDEV") { category = "storage_link"; stage = "store"; }
  else if (code === "EAGAIN" || code === "EMFILE" || code === "ENFILE") { category = "process_limit"; stage = "encode"; }

  return {
    category,
    stage,
    ...(code ? { code } : {}),
    ...(cause?.signal ? { signal: cause.signal } : {}),
    ...(cause?.timedOut ? { timedOut: true } : {}),
  };
}

/** Logs operationally useful fields while deliberately excluding messages,
 * executable arguments, stderr, paths, uploaded names, and environment values. */
export function logVideoUploadFailure(input: {
  requestId: string;
  endpoint: "hero" | "stories";
  error: unknown;
  inputBytes?: number;
  elapsedMs: number;
}) {
  const details = videoFailureDetails(input.error);
  console.error("admin_video_upload_failed", JSON.stringify({
    requestId: input.requestId,
    endpoint: input.endpoint,
    ...details,
    ...(input.inputBytes === undefined ? {} : { inputBytes: input.inputBytes }),
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
  }));
}

export function logVideoUploadWarning(input: { requestId: string; endpoint: "hero" | "stories"; error: unknown }) {
  console.warn("admin_video_upload_warning", JSON.stringify({
    requestId: input.requestId,
    endpoint: input.endpoint,
    ...videoFailureDetails(input.error),
  }));
}
