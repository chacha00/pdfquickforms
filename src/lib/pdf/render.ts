/**
 * Browser-only rendering via PDF.js (thumbnails, PDF -> image).
 * PDF.js runs its parser in its own worker.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class RenderError extends Error {
  readonly code: "encrypted" | "corrupt";
  constructor(code: "encrypted" | "corrupt", message: string) {
    super(message);
    this.code = code;
  }
}

/** Open a PDF for rendering. A copy of the bytes is passed because PDF.js detaches the buffer. */
export async function openForRender(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // Assets are self-hosted (see scripts/copy-pdfjs-assets.mjs); no third-party requests.
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
    enableXfa: false,
  });
  try {
    return await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new RenderError("encrypted", "This PDF is password-protected. PDFQuick can't open protected PDFs yet.");
    }
    throw new RenderError("corrupt", "This PDF couldn't be read. It may be damaged.");
  }
}

/** Largest canvas we'll allocate (in pixels) to avoid crashing mobile browsers. */
const MAX_CANVAS_PIXELS = 16_777_216; // 4096 x 4096

export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  opts: { hideFormFields?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  let viewport = page.getViewport({ scale, rotation: page.rotate });
  const pixels = viewport.width * viewport.height;
  if (pixels > MAX_CANVAS_PIXELS) {
    const shrink = Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    viewport = page.getViewport({ scale: scale * shrink, rotation: page.rotate });
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new RenderError("corrupt", "Your browser couldn't create a drawing surface.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent "print" renders without requestAnimationFrame pacing, so conversion
  // keeps going when the tab is in the background (rAF is paused there).
  // It also renders the page as it would print (print-flagged annotations).
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    intent: "print",
    // ENABLE_FORMS draws every annotation except form widgets, which the editor renders as live controls.
    ...(opts.hideFormFields ? { annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS } : {}),
  }).promise;
  page.cleanup();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed."))), type, quality);
  });
}

/** Render a small thumbnail for page `pageNumber` (1-based). Returns an object URL the caller must revoke. */
export async function renderThumbnail(doc: PDFDocumentProxy, pageNumber: number, targetWidth = 180): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1, rotation: page.rotate });
  const scale = (targetWidth * Math.min(2, window.devicePixelRatio || 1)) / base.width;
  const canvas = await renderPageToCanvas(doc, pageNumber, scale);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.8);
  canvas.width = 0;
  canvas.height = 0;
  return URL.createObjectURL(blob);
}
