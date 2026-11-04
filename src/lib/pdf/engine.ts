/**
 * PDFQuick core PDF engine.
 *
 * Pure functions over bytes, built on pdf-lib. No DOM access, so the same
 * code runs inside the Web Worker (production) and in Node (unit tests).
 *
 * What pdf-lib genuinely supports and we rely on: parsing, copying pages
 * between documents, page rotation, removing pages, embedding JPG/PNG,
 * writing metadata. What it does NOT support (and we therefore do not
 * offer here): encryption/decryption, real compression, OCR, Office formats.
 */
import { PDFDocument, PageSizes, degrees, EncryptedPDFError } from "pdf-lib";

export type PdfErrorCode = "encrypted" | "corrupt" | "empty" | "invalid-input";

export class PdfError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = "PdfError";
    this.code = code;
  }
}

export type Progress = (fraction: number) => void;
const noop: Progress = () => {};

import { normalizeRotation, type Rotation } from "./rotation";
export { normalizeRotation, type Rotation };

/** Load a PDF, turning pdf-lib failures into user-meaningful errors. */
export async function loadPdf(bytes: Uint8Array, label = "This file"): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof EncryptedPDFError || (err instanceof Error && /encrypt/i.test(err.message))) {
      throw new PdfError(
        "encrypted",
        `${label} is password-protected or encrypted. PDFQuick can't edit encrypted PDFs yet — remove the protection in the app that created it, then try again.`,
      );
    }
    throw new PdfError("corrupt", `${label} couldn't be read. It may be damaged or not a valid PDF.`);
  }
  let count = 0;
  try {
    count = doc.getPageCount();
  } catch {
    throw new PdfError("corrupt", `${label} has a damaged page structure and couldn't be read.`);
  }
  if (count === 0) throw new PdfError("empty", `${label} has no pages.`);
  return doc;
}

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdf(bytes)).getPageCount();
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer("PDFQuick (pdf-lib)");
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

function carryMetadata(from: PDFDocument, to: PDFDocument): void {
  const title = from.getTitle();
  const author = from.getAuthor();
  const subject = from.getSubject();
  const keywords = from.getKeywords();
  if (title) to.setTitle(title);
  if (author) to.setAuthor(author);
  if (subject) to.setSubject(subject);
  if (keywords) to.setKeywords([keywords]);
}

// ---------------------------------------------------------------- merge

export async function mergePdfs(
  inputs: { bytes: Uint8Array; name: string }[],
  onProgress: Progress = noop,
): Promise<Uint8Array> {
  if (inputs.length < 2) throw new PdfError("invalid-input", "Add at least two PDFs to merge.");
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const src = await loadPdf(input.bytes, `"${input.name}"`);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    onProgress((i + 1) / (inputs.length + 1));
  }
  const bytes = await save(out);
  onProgress(1);
  return bytes;
}

// ---------------------------------------------------------------- page assembly

export interface PageSpec {
  /** 0-based index into the source document. */
  index: number;
  /** Additional clockwise rotation to apply, on top of the page's existing rotation. */
  rotate?: number;
}

/**
 * Build a new document from pages of `bytes` in the given order, each with an
 * optional extra rotation. This one primitive powers extract, delete,
 * reorder/organize and split.
 */
export async function assemblePages(
  bytes: Uint8Array,
  specs: PageSpec[],
  onProgress: Progress = noop,
): Promise<Uint8Array> {
  if (specs.length === 0) throw new PdfError("invalid-input", "Choose at least one page. A PDF can't be empty.");
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  for (const s of specs) {
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= count) {
      throw new PdfError("invalid-input", `Page ${s.index + 1} does not exist in this ${count}-page document.`);
    }
  }
  const out = await PDFDocument.create();
  carryMetadata(src, out);
  const copied = await out.copyPages(src, specs.map((s) => s.index));
  copied.forEach((page, i) => {
    const extra = specs[i]!.rotate ?? 0;
    if (extra % 360 !== 0) {
      page.setRotation(degrees(normalizeRotation(page.getRotation().angle + extra)));
    }
    out.addPage(page);
  });
  onProgress(0.9);
  const result = await save(out);
  onProgress(1);
  return result;
}

export async function extractPages(bytes: Uint8Array, indices: number[], onProgress: Progress = noop): Promise<Uint8Array> {
  return assemblePages(bytes, indices.map((index) => ({ index })), onProgress);
}

export async function deletePages(bytes: Uint8Array, toDelete: number[], onProgress: Progress = noop): Promise<Uint8Array> {
  const count = await getPageCount(bytes);
  const remove = new Set(toDelete);
  const keep: number[] = [];
  for (let i = 0; i < count; i++) if (!remove.has(i)) keep.push(i);
  if (keep.length === 0) {
    throw new PdfError("invalid-input", "You've selected every page. A PDF needs at least one page — deselect at least one.");
  }
  if (keep.length === count) throw new PdfError("invalid-input", "Select at least one page to delete.");
  return extractPages(bytes, keep, onProgress);
}

/**
 * Rotate pages in place (keeps bookmarks, forms and other document-level data
 * intact, unlike re-assembling).
 * `rotations` maps 0-based page index -> extra clockwise degrees.
 */
export async function rotatePages(
  bytes: Uint8Array,
  rotations: Record<number, number>,
  onProgress: Progress = noop,
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  let changed = 0;
  for (const [key, extra] of Object.entries(rotations)) {
    const idx = Number(key);
    const page = pages[idx];
    if (!page) throw new PdfError("invalid-input", `Page ${idx + 1} does not exist.`);
    if (normalizeRotation(extra) === 0) continue;
    page.setRotation(degrees(normalizeRotation(page.getRotation().angle + extra)));
    changed++;
  }
  if (changed === 0) throw new PdfError("invalid-input", "No pages are set to rotate.");
  onProgress(0.9);
  const result = await save(doc);
  onProgress(1);
  return result;
}

export async function splitPdf(
  bytes: Uint8Array,
  groups: number[][],
  onProgress: Progress = noop,
): Promise<Uint8Array[]> {
  if (groups.length === 0) throw new PdfError("invalid-input", "Nothing to split.");
  const results: Uint8Array[] = [];
  for (let i = 0; i < groups.length; i++) {
    results.push(await extractPages(bytes, groups[i]!));
    onProgress((i + 1) / groups.length);
  }
  return results;
}

export async function splitEveryPage(bytes: Uint8Array, onProgress: Progress = noop): Promise<Uint8Array[]> {
  const count = await getPageCount(bytes);
  return splitPdf(bytes, Array.from({ length: count }, (_, i) => [i]), onProgress);
}

// ---------------------------------------------------------------- images -> PDF

export type PageSizeOption = "a4" | "letter" | "legal" | "original";
export type OrientationOption = "portrait" | "landscape" | "auto";
export type ScalingOption = "fit" | "no-upscale";

export interface ImageInput {
  bytes: Uint8Array;
  kind: "png" | "jpeg";
  name: string;
}

export interface ImagesToPdfOptions {
  pageSize: PageSizeOption;
  orientation: OrientationOption;
  /** Margin in PDF points (1/72 inch). */
  margin: number;
  scaling: ScalingOption;
}

const PAGE_SIZES: Record<Exclude<PageSizeOption, "original">, [number, number]> = {
  a4: PageSizes.A4 as [number, number],
  letter: PageSizes.Letter as [number, number],
  legal: PageSizes.Legal as [number, number],
};

/** Images are placed at 96 DPI for "original size": 1px = 0.75pt. */
const PX_TO_PT = 72 / 96;
const MAX_PDF_DIM = 14400; // PDF user-unit limit (200 inches)

export function computeImagePlacement(
  imgW: number,
  imgH: number,
  opts: ImagesToPdfOptions,
): { pageW: number; pageH: number; x: number; y: number; w: number; h: number } {
  const margin = Math.max(0, opts.margin);
  const natW = imgW * PX_TO_PT;
  const natH = imgH * PX_TO_PT;

  let pageW: number;
  let pageH: number;
  if (opts.pageSize === "original") {
    const shrink = Math.min(1, (MAX_PDF_DIM - 2 * margin) / natW, (MAX_PDF_DIM - 2 * margin) / natH);
    pageW = natW * shrink + 2 * margin;
    pageH = natH * shrink + 2 * margin;
  } else {
    const [a, b] = PAGE_SIZES[opts.pageSize];
    const short = Math.min(a, b);
    const long = Math.max(a, b);
    const landscape = opts.orientation === "landscape" || (opts.orientation === "auto" && imgW > imgH);
    pageW = landscape ? long : short;
    pageH = landscape ? short : long;
  }

  const boxW = Math.max(1, pageW - 2 * margin);
  const boxH = Math.max(1, pageH - 2 * margin);
  let scale = Math.min(boxW / natW, boxH / natH);
  if (opts.scaling === "no-upscale") scale = Math.min(scale, 1);
  const w = natW * scale;
  const h = natH * scale;
  return { pageW, pageH, w, h, x: (pageW - w) / 2, y: (pageH - h) / 2 };
}

export async function imagesToPdf(
  images: ImageInput[],
  opts: ImagesToPdfOptions,
  onProgress: Progress = noop,
): Promise<Uint8Array> {
  if (images.length === 0) throw new PdfError("invalid-input", "Add at least one image.");
  const doc = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    let embedded;
    try {
      embedded = img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    } catch {
      throw new PdfError("corrupt", `"${img.name}" couldn't be read as an image. It may be damaged or use an unsupported encoding.`);
    }
    const place = computeImagePlacement(embedded.width, embedded.height, opts);
    const page = doc.addPage([place.pageW, place.pageH]);
    page.drawImage(embedded, { x: place.x, y: place.y, width: place.w, height: place.h });
    onProgress((i + 1) / (images.length + 1));
  }
  const out = await save(doc);
  onProgress(1);
  return out;
}

// ---------------------------------------------------------------- output validation

/** Re-parse generated output to make sure we never hand the user a broken file. */
export async function verifyPdf(bytes: Uint8Array, expectedPages?: number): Promise<number> {
  let count: number;
  try {
    count = (await PDFDocument.load(bytes)).getPageCount();
  } catch {
    throw new PdfError("corrupt", "The generated PDF failed validation. Please try again or report this file.");
  }
  if (expectedPages !== undefined && count !== expectedPages) {
    throw new PdfError("corrupt", `The generated PDF has ${count} pages but ${expectedPages} were expected.`);
  }
  return count;
}

export interface PageInfo {
  width: number;
  height: number;
  rotation: Rotation;
}

export async function getPageInfo(bytes: Uint8Array): Promise<PageInfo[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height, rotation: normalizeRotation(p.getRotation().angle) };
  });
}
