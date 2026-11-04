import { describe, expect, it } from "vitest";
import { detectKind } from "../../src/lib/validation/fileSignature";
import { validateFiles, type FileRules } from "../../src/lib/validation/validateFiles";
import { baseName, outputName, rangeOutputName, uniqueNames } from "../../src/lib/pdf/naming";
import { formatBytes } from "../../src/lib/format";
import { JPEG_2x1, PNG_1x1, makePdf } from "../fixtures/makePdf";

describe("detectKind", () => {
  it("detects PDFs, PNGs and JPEGs by signature", async () => {
    expect(detectKind(await makePdf([1]))).toBe("pdf");
    expect(detectKind(PNG_1x1)).toBe("png");
    expect(detectKind(JPEG_2x1)).toBe("jpeg");
  });

  it("detects WebP", () => {
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectKind(webp)).toBe("webp");
  });

  it("accepts PDF header after leading junk", () => {
    expect(detectKind(new TextEncoder().encode("\n\n  %PDF-1.4"))).toBe("pdf");
  });

  it("returns unknown for other content", () => {
    expect(detectKind(new TextEncoder().encode("PK\u0003\u0004 zip"))).toBe("unknown");
    expect(detectKind(new Uint8Array())).toBe("unknown");
  });
});

describe("validateFiles", () => {
  const rules: FileRules = { accept: ["pdf"], maxFileBytes: 10_000, maxFiles: 2, maxTotalBytes: 15_000 };

  it("accepts a real PDF even with a wrong extension", async () => {
    const bytes = await makePdf([1]);
    const f = new File([bytes as BlobPart], "renamed.txt", { type: "text/plain" });
    const { accepted, rejected } = await validateFiles([f], rules, { count: 0, bytes: 0 });
    expect(rejected).toEqual([]);
    expect(accepted[0]?.kind).toBe("pdf");
  });

  it("rejects an image renamed to .pdf", async () => {
    const f = new File([PNG_1x1 as BlobPart], "fake.pdf", { type: "application/pdf" });
    const { accepted, rejected } = await validateFiles([f], rules, { count: 0, bytes: 0 });
    expect(accepted).toEqual([]);
    expect(rejected[0]?.reason).toMatch(/PNG/);
  });

  it("enforces size, count and empty-file rules", async () => {
    const pdf = await makePdf([1]);
    const big = new File([new Uint8Array(20_000) as BlobPart], "big.pdf");
    const empty = new File([], "empty.pdf");
    const ok1 = new File([pdf as BlobPart], "1.pdf");
    const ok2 = new File([pdf as BlobPart], "2.pdf");
    const ok3 = new File([pdf as BlobPart], "3.pdf");
    const { accepted, rejected } = await validateFiles([big, empty, ok1, ok2, ok3], rules, { count: 0, bytes: 0 });
    expect(accepted.map((a) => a.file.name)).toEqual(["1.pdf", "2.pdf"]);
    expect(rejected.map((r) => r.name)).toEqual(["big.pdf", "empty.pdf", "3.pdf"]);
  });

  it("counts already-selected files toward the limit", async () => {
    const pdf = await makePdf([1]);
    const { accepted, rejected } = await validateFiles([new File([pdf as BlobPart], "x.pdf")], rules, { count: 2, bytes: 100 });
    expect(accepted).toEqual([]);
    expect(rejected[0]?.reason).toMatch(/up to 2/);
  });
});

describe("naming", () => {
  it("sanitizes names", () => {
    expect(baseName("my:report?.pdf")).toBe("my-report-");
    expect(baseName("..hidden.pdf")).toBe("hidden");
    expect(baseName(".pdf")).toBe("document");
  });

  it("builds output names", () => {
    expect(outputName("Report Q1.pdf", "merged")).toBe("Report Q1-merged.pdf");
    expect(rangeOutputName("a.pdf", [2])).toBe("a-page-3.pdf");
    expect(rangeOutputName("a.pdf", [2, 3, 4])).toBe("a-pages-3-5.pdf");
    expect(rangeOutputName("a.pdf", [0, 4])).toBe("a-pages-1-to-5-selected.pdf");
  });

  it("dedupes names for ZIP entries", () => {
    expect(uniqueNames(["a.pdf", "A.pdf", "b.pdf", "a.pdf"])).toEqual(["a.pdf", "A (2).pdf", "b.pdf", "a (3).pdf"]);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1536, "1.5 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [250 * 1024 * 1024, "250 MB"],
  ])("%i -> %s", (n, s) => expect(formatBytes(n)).toBe(s));
});
