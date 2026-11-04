import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  PdfError,
  assemblePages,
  computeImagePlacement,
  deletePages,
  extractPages,
  imagesToPdf,
  loadPdf,
  mergePdfs,
  normalizeRotation,
  rotatePages,
  splitEveryPage,
  splitPdf,
  verifyPdf,
} from "../../src/lib/pdf/engine";
import { JPEG_2x1, PNG_1x1, makePdf, pageRotations, pageTags } from "../fixtures/makePdf";

describe("loadPdf", () => {
  it("rejects garbage bytes as corrupt", async () => {
    await expect(loadPdf(new TextEncoder().encode("%PDF-1.7 not really a pdf"))).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects non-PDF bytes", async () => {
    await expect(loadPdf(PNG_1x1)).rejects.toBeInstanceOf(PdfError);
  });

  it("rejects truncated PDFs", async () => {
    const good = await makePdf([1, 2, 3]);
    const truncated = good.slice(0, Math.floor(good.length / 3));
    await expect(loadPdf(truncated)).rejects.toBeInstanceOf(PdfError);
  });
});

describe("mergePdfs", () => {
  it("merges in the given order and keeps page sizes", async () => {
    const a = await makePdf([1, 2], { heights: [300, 500] });
    const b = await makePdf([3]);
    const out = await mergePdfs([{ bytes: b, name: "b" }, { bytes: a, name: "a" }]);
    expect(await pageTags(out)).toEqual([3, 1, 2]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(2).getSize().height).toBe(500);
  });

  it("preserves existing page rotation", async () => {
    const a = await makePdf([1], { rotations: [90] });
    const b = await makePdf([2]);
    const out = await mergePdfs([{ bytes: a, name: "a" }, { bytes: b, name: "b" }]);
    expect(await pageRotations(out)).toEqual([90, 0]);
  });

  it("requires at least two files", async () => {
    await expect(mergePdfs([{ bytes: await makePdf([1]), name: "a" }])).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("names the corrupted file in the error", async () => {
    const good = await makePdf([1]);
    await expect(
      mergePdfs([{ bytes: good, name: "good.pdf" }, { bytes: new Uint8Array([1, 2, 3]), name: "broken.pdf" }]),
    ).rejects.toThrow(/broken\.pdf/);
  });

  it("reports progress up to 1", async () => {
    const seen: number[] = [];
    await mergePdfs([{ bytes: await makePdf([1]), name: "a" }, { bytes: await makePdf([2]), name: "b" }], (f) => seen.push(f));
    expect(seen.at(-1)).toBe(1);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });
});

describe("page operations", () => {
  it("extracts selected pages in order", async () => {
    const src = await makePdf([1, 2, 3, 4, 5]);
    expect(await pageTags(await extractPages(src, [4, 0, 2]))).toEqual([5, 1, 3]);
  });

  it("deletes pages", async () => {
    const src = await makePdf([1, 2, 3, 4]);
    expect(await pageTags(await deletePages(src, [1, 3]))).toEqual([1, 3]);
  });

  it("refuses to delete every page", async () => {
    const src = await makePdf([1, 2]);
    await expect(deletePages(src, [0, 1])).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses an empty delete selection", async () => {
    await expect(deletePages(await makePdf([1, 2]), [])).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("rotates pages relative to existing rotation", async () => {
    const src = await makePdf([1, 2, 3], { rotations: [0, 90, 270] });
    const out = await rotatePages(src, { 0: 90, 1: 180, 2: 90 });
    expect(await pageRotations(out)).toEqual([90, 270, 0]);
  });

  it("rejects rotation of non-existent pages", async () => {
    await expect(rotatePages(await makePdf([1]), { 5: 90 })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("assembles reorder + rotate + delete in one pass", async () => {
    const src = await makePdf([1, 2, 3, 4]);
    const out = await assemblePages(src, [{ index: 3 }, { index: 0, rotate: 90 }, { index: 1, rotate: -90 }]);
    expect(await pageTags(out)).toEqual([4, 1, 2]);
    expect(await pageRotations(out)).toEqual([0, 90, 270]);
  });

  it("rejects out-of-range page specs", async () => {
    await expect(assemblePages(await makePdf([1, 2]), [{ index: 2 }])).rejects.toMatchObject({ code: "invalid-input" });
    await expect(assemblePages(await makePdf([1, 2]), [])).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("keeps document title when assembling", async () => {
    const src = await makePdf([1, 2], { title: "Quarterly report" });
    const out = await extractPages(src, [1]);
    expect((await PDFDocument.load(out)).getTitle()).toBe("Quarterly report");
  });
});

describe("split", () => {
  it("splits by groups", async () => {
    const src = await makePdf([1, 2, 3, 4, 5]);
    const parts = await splitPdf(src, [[0, 1, 2], [4]]);
    expect(parts).toHaveLength(2);
    expect(await pageTags(parts[0]!)).toEqual([1, 2, 3]);
    expect(await pageTags(parts[1]!)).toEqual([5]);
  });

  it("splits every page", async () => {
    const parts = await splitEveryPage(await makePdf([7, 8, 9]));
    expect(await Promise.all(parts.map(pageTags))).toEqual([[7], [8], [9]]);
  });
});

describe("imagesToPdf", () => {
  it("creates one page per image, in order", async () => {
    const out = await imagesToPdf(
      [
        { bytes: PNG_1x1, kind: "png", name: "a.png" },
        { bytes: JPEG_2x1, kind: "jpeg", name: "b.jpg" },
      ],
      { pageSize: "a4", orientation: "portrait", margin: 36, scaling: "fit" },
    );
    expect(await verifyPdf(out, 2)).toBe(2);
    const doc = await PDFDocument.load(out);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
  });

  it("uses image dimensions for original page size", async () => {
    const out = await imagesToPdf([{ bytes: JPEG_2x1, kind: "jpeg", name: "b.jpg" }], {
      pageSize: "original",
      orientation: "auto",
      margin: 0,
      scaling: "fit",
    });
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(1.5);
    expect(page.getHeight()).toBeCloseTo(0.75);
  });

  it("rejects invalid image bytes", async () => {
    await expect(
      imagesToPdf([{ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), kind: "jpeg", name: "bad.jpg" }], {
        pageSize: "a4",
        orientation: "portrait",
        margin: 0,
        scaling: "fit",
      }),
    ).rejects.toThrow(/bad\.jpg/);
  });
});

describe("computeImagePlacement", () => {
  const base = { pageSize: "letter", orientation: "portrait", margin: 36, scaling: "fit" } as const;

  it("fits and centers within margins", () => {
    const p = computeImagePlacement(1000, 1000, base);
    expect(p.pageW).toBe(612);
    expect(p.pageH).toBe(792);
    expect(p.w).toBeCloseTo(540);
    expect(p.x).toBeCloseTo(36);
    expect(p.y).toBeCloseTo((792 - 540) / 2);
  });

  it("auto orientation picks landscape for wide images", () => {
    const p = computeImagePlacement(2000, 1000, { ...base, orientation: "auto" });
    expect(p.pageW).toBe(792);
  });

  it("does not upscale small images when asked", () => {
    const p = computeImagePlacement(100, 100, { ...base, scaling: "no-upscale" });
    expect(p.w).toBeCloseTo(75);
  });

  it("never produces pages larger than the PDF limit", () => {
    const p = computeImagePlacement(100000, 50000, { ...base, pageSize: "original" });
    expect(p.pageW).toBeLessThanOrEqual(14400);
  });
});

describe("normalizeRotation", () => {
  it.each([
    [0, 0],
    [90, 90],
    [360, 0],
    [-90, 270],
    [450, 90],
    [-180, 180],
  ])("%i -> %i", (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });
});

describe("verifyPdf", () => {
  it("detects page-count mismatch", async () => {
    await expect(verifyPdf(await makePdf([1, 2]), 3)).rejects.toBeInstanceOf(PdfError);
  });
});
