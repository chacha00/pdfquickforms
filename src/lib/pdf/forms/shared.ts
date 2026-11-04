import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { PdfError, normalizeRotation } from "../engine";
import type { PageBox } from "../../coordinates/geometry";
import type { Rotation } from "../rotation";
import type { FontFamily } from "../../forms/model";

export function pageGeometry(page: PDFPage): { box: PageBox; rotation: Rotation; display: { width: number; height: number } } {
  const crop = page.getCropBox();
  const box: PageBox = [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height];
  const rotation = normalizeRotation(page.getRotation().angle);
  const sideways = rotation === 90 || rotation === 270;
  return { box, rotation, display: { width: sideways ? crop.height : crop.width, height: sideways ? crop.width : crop.height } };
}

const FONT_MAP: Record<FontFamily, [StandardFonts, StandardFonts]> = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold],
};

/** Lazily embeds the standard fonts that are actually used. */
export function fontCache(doc: PDFDocument) {
  const cache = new Map<string, Promise<PDFFont>>();
  return (family: FontFamily = "helvetica", bold = false): Promise<PDFFont> => {
    const key = `${family}:${bold}`;
    let f = cache.get(key);
    if (!f) {
      f = doc.embedFont(FONT_MAP[family][bold ? 1 : 0]);
      cache.set(key, f);
    }
    return f;
  };
}

export function hexColor(hex: string | null | undefined): RGB | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Standard PDF fonts use WinAnsi encoding: reject what they can't show, naming the culprit. */
export function assertEncodable(font: PDFFont, text: string, what: string): void {
  const flat = text.split(String.fromCharCode(10)).join("").split(String.fromCharCode(13)).join("");
  try {
    font.encodeText(flat);
  } catch {
    const bad = [...flat].find((ch) => {
      try {
        font.encodeText(ch);
        return false;
      } catch {
        return true;
      }
    });
    throw new PdfError(
      "invalid-input",
      `${what} contains a character the PDF's standard fonts can't show${bad ? ` ("${bad}")` : ""}. Use Latin letters, numbers and common punctuation.`,
    );
  }
}

/** Greedy word wrap using real font metrics. Honors explicit line breaks. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/(\s+)/).filter((w) => w !== "");
    let line = "";
    for (const w of words) {
      const candidate = line + w;
      if (line && font.widthOfTextAtSize(candidate.trimEnd(), size) > maxWidth && w.trim()) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = candidate;
    }
    out.push(line.trimEnd());
  }
  return out;
}
