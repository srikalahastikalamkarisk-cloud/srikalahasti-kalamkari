import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { checkPaymentRequest } from "./request-guard-core";
import { readBoundedBody } from "./request-guard-stream";

export async function paymentRequestGuard(
  request: NextRequest,
  maxBytes = 8192
): Promise<NextRequest | NextResponse> {
  const result = checkPaymentRequest({
    origin: request.headers.get("origin"),
    requestOrigin: request.nextUrl.origin,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
  }, maxBytes);

  if (!result.allowed) {
    const messages = {
      403: "Invalid request origin.",
      413: "Request body is too large.",
      415: "Content-Type must be application/json.",
    };

    return NextResponse.json(
      { error: messages[result.status] },
      { status: result.status }
    );
  }

  if (!request.body) {
    return NextResponse.json(
      { error: "Request body is required." },
      { status: 400 }
    );
  }

  const bounded = await readBoundedBody(request.body, maxBytes);

  if (!bounded.ok) {
    return NextResponse.json(
      {
        error: bounded.status === 413
          ? "Request body is too large."
          : "Unable to read request body.",
      },
      { status: bounded.status }
    );
  }

  return new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body: new Blob([bounded.body as BlobPart]),
  });
}
