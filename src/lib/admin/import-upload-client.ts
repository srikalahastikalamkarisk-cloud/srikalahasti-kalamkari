type Kind = "csv" | "zip";

type UploadState = {
  id: string;
  kind: Kind;
  size: number;
  totalChunks: number;
  missing: number[];
  uploadedBytes: number;
  complete: boolean;
};

const CHUNK_BYTES = 2 * 1024 * 1024;
const ENDPOINT = "/api/admin/products/import/upload";

class UploadRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  action: string,
  params: Record<string, string> = {},
  body?: BodyInit,
  signal?: AbortSignal
): Promise<T> {
  const query = new URLSearchParams({
    action,
    ...params
  });

  const response = await fetch(
    `${ENDPOINT}?${query}`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body,
      signal
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    throw new UploadRequestError(
      result?.error || `Upload service error (${response.status})`,
      response.status
    );
  }

  return result as T;
}

export type StagedSelection = {
  file: File;
  id: string;
};

export async function uploadImportFile(
  kind: Kind,
  file: File,
  selections: Partial<Record<Kind, StagedSelection>>,
  progress: (bytes: number) => void,
  signal: AbortSignal
) {
  const recovered = await request<{
    uploads: UploadState[];
  }>("recover", {}, undefined, signal);

  let state = recovered.uploads.find(
    item => item.kind === kind
  );

  const previous = selections[kind];

  // Never resume a different file merely because its size matches.
  if (
    state &&
    (!previous ||
     previous.file !== file ||
     previous.id !== state.id ||
     state.size !== file.size)
  ) {
    await request(
      "cancel",
      { id: state.id },
      undefined,
      signal
    );

    state = undefined;
  }

  if (!state) {
    const started = await request<{
      id: string;
      chunkBytes: number;
      totalChunks: number;
    }>(
      "start",
      {},
      JSON.stringify({
        kind,
        size: file.size
      }),
      signal
    );

    selections[kind] = {
      file,
      id: started.id
    };

    if (started.chunkBytes !== CHUNK_BYTES) {
      throw new Error("Upload chunk configuration mismatch");
    }

    state = await request<UploadState>(
      "status",
      { id: started.id },
      undefined,
      signal
    );
  }

  const id = state.id;

  selections[kind] = { file, id };

  let uploaded = state.uploadedBytes;
  progress(uploaded);

  if (!state.complete) {
    for (const index of state.missing) {
      signal.throwIfAborted();

      const start = index * CHUNK_BYTES;
      const chunk = file.slice(
        start,
        Math.min(start + CHUNK_BYTES, file.size)
      );

      for (let attempt = 0; ; attempt++) {
        try {
          await request(
            "chunk",
            { id, index: String(index) },
            chunk,
            signal
          );

          break;
        } catch (error) {
          if (
            signal.aborted ||
            attempt >= 2 ||
            (error instanceof UploadRequestError &&
             error.status < 500 &&
             error.status !== 409)
          ) throw error;

          await new Promise(resolve =>
            setTimeout(resolve, 700 * (attempt + 1))
          );
        }
      }

      uploaded += chunk.size;
      progress(uploaded);
    }

    const finalized = await request<UploadState>(
      "finalize",
      { id },
      undefined,
      signal
    );

    if (!finalized.complete) {
      throw new Error("File assembly incomplete");
    }
  }

  progress(file.size);
  return id;
}
