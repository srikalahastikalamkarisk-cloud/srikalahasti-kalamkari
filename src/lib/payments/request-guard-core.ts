export type GuardInput = {
  origin: string | null;
  requestOrigin: string;
  contentType: string | null;
  contentLength: string | null;
};

export type GuardResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 413 | 415 };

export function checkPaymentRequest(
  input: GuardInput,
  maxBytes = 8192
): GuardResult {
  if (!input.origin || input.origin !== input.requestOrigin) {
    return { allowed: false, status: 403 };
  }

  if (
    !input.contentType ||
    !/^application\/json(?:\s*;|$)/i.test(input.contentType)
  ) {
    return { allowed: false, status: 415 };
  }

  if (input.contentLength !== null) {
    if (!/^\d+$/.test(input.contentLength)) {
      return { allowed: false, status: 413 };
    }

    const size = Number(input.contentLength);

    if (!Number.isSafeInteger(size) || size > maxBytes) {
      return { allowed: false, status: 413 };
    }
  }

  return { allowed: true };
}
