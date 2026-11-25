export const MEDIA_CLEANUP_MAX_ATTEMPTS = 8;
export const MEDIA_CLEANUP_LEASE_MS = 2 * 60 * 1000;
export const MEDIA_CLEANUP_RETRY_BASE_MS = 30 * 1000;
export const MEDIA_CLEANUP_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
export const MEDIA_CLEANUP_BATCH_SIZE = 12;
export const MEDIA_CLEANUP_BUDGET_MS = 8 * 1000;

export function retryAt(attempt: number, now = Date.now()) {
  const delay = Math.min(MEDIA_CLEANUP_RETRY_MAX_MS, MEDIA_CLEANUP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return new Date(now + delay);
}

export function nextJobStatus(attempt: number) {
  return attempt >= MEDIA_CLEANUP_MAX_ATTEMPTS ? "DEAD" : "FAILED";
}
