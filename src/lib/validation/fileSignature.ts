/**
 * File-type detection by magic bytes. Extensions and browser-reported MIME
 * types are only hints; the signature decides.
 */

export type DetectedKind = "pdf" | "png" | "jpeg" | "webp" | "unknown";

export function detectKind(head: Uint8Array): DetectedKind {
  // PDF: "%PDF-" may be preceded by a little junk; the spec allows it within the first 1024 bytes.
  const limit = Math.min(head.length - 4, 1024);
  for (let i = 0; i < limit; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      return "pdf";
    }
  }
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) {
    return "png";
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return "webp";
  }
  return "unknown";
}

export const KIND_LABEL: Record<DetectedKind, string> = {
  pdf: "PDF",
  png: "PNG image",
  jpeg: "JPG image",
  webp: "WebP image",
  unknown: "Unknown",
};

export const KIND_MIME: Record<Exclude<DetectedKind, "unknown">, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
