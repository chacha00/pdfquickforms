import type { PDFDocumentProxy } from "pdfjs-dist";
import { detectFields, type TextRun } from "../../lib/forms/detect";
import { createElement, uniqueName, usedNames, type El, type PageModel } from "../../lib/forms/model";
import type { PdfInspection } from "../../lib/pdf/forms/inspect";

/** Extract text runs in display space (scale 1, rotation applied) for one page. */
async function pageRuns(doc: PDFDocumentProxy, pageNumber: number): Promise<TextRun[]> {
  const { Util } = await import("pdfjs-dist");
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const tx = Util.transform(vp.transform, item.transform);
    const len = Math.hypot(tx[0], tx[1]) || 1;
    if (Math.abs(tx[1] / len) > 0.1) continue; // only horizontal text in display space
    runs.push({ str: item.str, x: tx[4], y: tx[5], width: item.width, height: Math.hypot(tx[2], tx[3]) });
  }
  page.cleanup();
  return runs;
}

const overlaps = (a: { left: number; top: number; width: number; height: number }, b: typeof a) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Run Stage 2 detection on every page that comes from the uploaded PDF.
 * Skips spots that already have an existing field or an element.
 */
export async function runDetection(doc: PDFDocumentProxy, pages: PageModel[], elements: El[], inspection: PdfInspection | null): Promise<El[]> {
  const out: El[] = [];
  const used = usedNames(elements, inspection?.fields.map((f) => f.name) ?? []);
  for (const pm of pages) {
    if (pm.kind !== "pdf") continue;
    const runs = await pageRuns(doc, pm.index + 1);
    const taken = [
      ...elements.filter((e) => e.pageId === pm.id),
      ...(inspection?.fields.flatMap((f) => f.widgets.filter((w) => w.page === pm.index).map((w) => w.box)) ?? []),
    ];
    for (const sug of detectFields(runs, pm)) {
      if (taken.some((t) => overlaps(t, sug)) || out.some((o) => o.pageId === pm.id && overlaps(o, sug))) continue;
      const el = createElement(sug.type, pm.id, { x: 0, y: 0 }, { elements: [] });
      const name = uniqueName(sug.name, used);
      used.add(name);
      out.push({ ...el, left: sug.left, top: sug.top, width: sug.width, height: sug.height, name, label: sug.name, origin: "suggested" });
    }
  }
  return out;
}
