import { PDFDocument, StandardFonts, degrees } from "pdf-lib";

/**
 * Build a test PDF whose pages are identifiable: each page's width encodes
 * its "tag" (width = 200 + tag), so tests can check order after operations.
 */
export async function makePdf(
  tags: number[],
  opts: { rotations?: number[]; heights?: number[]; title?: string } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  tags.forEach((tag, i) => {
    const page = doc.addPage([200 + tag, opts.heights?.[i] ?? 300]);
    page.drawText(`Page tag ${tag}`, { x: 10, y: 20, size: 12, font });
    const r = opts.rotations?.[i];
    if (r) page.setRotation(degrees(r));
  });
  if (opts.title) doc.setTitle(opts.title);
  return doc.save();
}

export async function pageTags(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getSize().width) - 200);
}

export async function pageRotations(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => p.getRotation().angle);
}

/** 1x1 red PNG and a tiny baseline JPEG for image->PDF tests. */
export const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

export const JPEG_2x1 = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  ),
  (c) => c.charCodeAt(0),
);
