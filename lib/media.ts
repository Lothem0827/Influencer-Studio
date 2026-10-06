/** Client- and server-safe upload checks. Keep in sync with the prompt-library sample limits. */

export const MAX_UPLOAD_BYTES = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
} as const;

export type MediaKind = keyof typeof MAX_UPLOAD_BYTES;

const MIME_BY_EXT: Record<string, { kind: MediaKind; mime: string }> = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  mp4: { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
  mov: { kind: "video", mime: "video/quicktime" },
};

export function cleanMime(raw: string): string {
  return raw.split(";")[0].trim().toLowerCase();
}

export function inferMime(kind: MediaKind, file: { type?: string; name?: string }): string {
  const fromType = cleanMime(file.type ?? "");
  if (fromType.startsWith(`${kind}/`)) return fromType;
  const ext = file.name?.split(".").pop()?.toLowerCase() ?? "";
  const guessed = MIME_BY_EXT[ext];
  if (guessed?.kind === kind) return guessed.mime;
  return fromType;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function validateUpload(
  kind: MediaKind,
  file: { type?: string; name?: string; size: number },
): { ok: true; mime: string } | { ok: false; error: string } {
  const max = MAX_UPLOAD_BYTES[kind];
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > max) {
    return {
      ok: false,
      error: `${kind === "image" ? "Images" : "Videos"} must be ${formatBytes(max)} or smaller (this one is ${formatBytes(file.size)}).`,
    };
  }
  const mime = inferMime(kind, file);
  if (!mime.startsWith(`${kind}/`)) {
    return {
      ok: false,
      error: `That is not a${kind === "image" ? "n image" : " video"} file.`,
    };
  }
  return { ok: true, mime };
}

export function pickMatchingFile(kind: MediaKind, files: FileList | File[]): File | null {
  const list = [...files];
  return list.find((f) => validateUpload(kind, f).ok) ?? list[0] ?? null;
}
