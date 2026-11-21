export type BoundedBodyResult =
  | { ok: true; body: Uint8Array }
  | { ok: false; status: 400 | 413 };

export async function readBoundedBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes = 8192
): Promise<BoundedBodyResult> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }

      chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { ok: true, body };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
