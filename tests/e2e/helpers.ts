import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Download, type Page } from "@playwright/test";
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField } from "pdf-lib";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "files");
export const fixture = (name: string) => join(FIXTURES, name);

export async function downloadBytes(download: Download): Promise<Uint8Array> {
  return new Uint8Array(readFileSync((await download.path())!));
}

export async function clickDownload(page: Page, testId = "download") {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  return d;
}

/** Read every field back with pdf-lib: name, type, value, page index. */
export async function readFields(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  return doc
    .getForm()
    .getFields()
    .map((f) => {
      const w = f.acroField.getWidgets()[0];
      const page = w ? pages.findIndex((p) => p.ref.toString() === w.P()?.toString()) : -1;
      let type = "other";
      let value: unknown = null;
      if (f instanceof PDFTextField) [type, value] = ["text", f.getText() ?? ""];
      else if (f instanceof PDFCheckBox) [type, value] = ["checkbox", f.isChecked()];
      else if (f instanceof PDFRadioGroup) [type, value] = ["radio", f.getSelected() ?? ""];
      else if (f instanceof PDFDropdown) [type, value] = ["dropdown", f.getSelected()[0] ?? ""];
      else if (f instanceof PDFOptionList) [type, value] = ["listbox", f.getSelected()];
      else if (f instanceof PDFSignature) type = "signature";
      return { name: f.getName(), type, value, page };
    });
}

/** PDF.js (Firefox's built-in viewer engine) view of the widgets. */
export async function pdfjsWidgets(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" }).promise;
  const out: { page: number; fieldName: string; fieldType: string }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    for (const a of (await (await doc.getPage(i)).getAnnotations()) as { subtype: string; fieldName: string; fieldType: string }[]) {
      if (a.subtype === "Widget") out.push({ page: i, fieldName: a.fieldName, fieldType: a.fieldType });
    }
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Click a page surface at a point in PDF points (display space), scrolled to mid-screen. */
export async function clickAt(page: Page, pageNo: number, xPt: number, yPt: number, pageWidthPt = 612) {
  const surface = page.getByTestId(`page-surface-${pageNo}`);
  await surface.waitFor();
  const pt = await surface.evaluate(
    (el, [x, y, w]) => {
      const s = el.getBoundingClientRect().width / w;
      const main = el.closest("main") ?? document.scrollingElement!;
      main.scrollBy(0, el.getBoundingClientRect().top + y * s - window.innerHeight / 2);
      const r = el.getBoundingClientRect();
      return { x: r.left + x * s, y: r.top + y * s };
    },
    [xPt, yPt, pageWidthPt] as const,
  );
  await page.mouse.click(pt.x, pt.y);
}

/** Choose a tool from the editor sidebar and place it. */
export async function place(page: Page, tool: string, pageNo: number, x: number, y: number, pageWidthPt = 612) {
  await page.getByRole("complementary", { name: "Tools and pages" }).getByRole("button", { name: tool, exact: true }).click();
  await clickAt(page, pageNo, x, y, pageWidthPt);
}

export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export async function openBlank(page: Page) {
  await page.goto("/create-fillable-pdf");
  await page.getByRole("button", { name: "Start with a blank page" }).click();
  await expect(page.getByTestId("page-surface-1")).toBeVisible();
}

export async function openPdf(page: Page, name: string, autoDetect = false) {
  await page.goto("/make-pdf-fillable");
  const box = page.getByLabel("Suggest fields automatically (Auto-detect, free)");
  if (!autoDetect) await box.uncheck();
  await page.getByTestId("file-input").setInputFiles(fixture(name));
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByTestId("page-surface-1")).toBeVisible();
}
