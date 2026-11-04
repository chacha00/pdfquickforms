/**
 * Auto-Detect Fields — Stage 2 heuristics over a page's text positions.
 * Pure function: input is text runs in display space; output is suggested
 * fields that the user reviews before export. Heuristics, not magic:
 *
 *  1. Runs of underscores ("Name: ________") → text field over the line.
 *  2. Box glyphs (☐ □ ❑ ▢ "[ ]") → checkbox.
 *  3. A label ending in ":" with empty space to its right → text field.
 *  4. The label decides the type: signature / date / email / phone.
 *
 * Not handled (documented): lines and boxes drawn as vector graphics, scanned
 * pages without a text layer (needs OCR), tables.
 */
import type { ElementType } from "./model";

export interface TextRun {
  str: string;
  /** Left of the run (display pt). */
  x: number;
  /** Baseline (display pt, y down). */
  y: number;
  width: number;
  /** Font size / glyph height in pt. */
  height: number;
}

export interface Suggestion {
  type: Extract<ElementType, "text" | "checkbox" | "date" | "email" | "phone" | "signature">;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  reason: "underline" | "box" | "label";
}

const BOX_GLYPHS = /[☐□❑▢◻⬜]|\[\s?\]/g;

function typeFor(label: string): Suggestion["type"] {
  const l = label.toLowerCase();
  if (/signature|signed|sign here/.test(l)) return "signature";
  if (/\bdate\b|\bdob\b|birth/.test(l)) return "date";
  if (/e-?mail/.test(l)) return "email";
  if (/phone|tel\b|mobile|cell|fax/.test(l)) return "phone";
  return "text";
}

function cleanLabel(s: string): string {
  return s.replace(BOX_GLYPHS, "").replace(/_+/g, "").replace(/[:*]+\s*$/, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Group runs into lines by baseline. */
function lines(runs: TextRun[]): TextRun[][] {
  const sorted = [...runs].filter((r) => r.str.trim() || /_/.test(r.str)).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: TextRun[][] = [];
  for (const r of sorted) {
    const line = out.find((l) => Math.abs(l[0]!.y - r.y) <= Math.max(2, r.height * 0.3));
    if (line) line.push(r);
    else out.push([r]);
  }
  for (const l of out) l.sort((a, b) => a.x - b.x);
  return out;
}

/** Approximate x of character index i inside a run (monospace assumption within a run). */
const charX = (r: TextRun, i: number) => r.x + (r.width * i) / Math.max(1, r.str.length);

export function detectFields(runs: TextRun[], page: { width: number; height: number }): Suggestion[] {
  const found: Suggestion[] = [];
  const margin = Math.min(54, page.width * 0.08);

  for (const line of lines(runs)) {
    let labelSoFar = "";
    for (let ri = 0; ri < line.length; ri++) {
      const r = line[ri]!;
      const h = Math.max(6, r.height);

      // 1. underscores
      for (const m of r.str.matchAll(/_{3,}/g)) {
        const start = charX(r, m.index!);
        const end = charX(r, m.index! + m[0].length);
        const label = cleanLabel(labelSoFar + r.str.slice(0, m.index!)) || cleanLabel(line[ri + 1]?.str ?? "");
        const type = typeFor(label);
        const height = type === "signature" ? Math.max(28, h * 2.6) : Math.max(14, h * 1.5);
        found.push({ type, name: label || "Field", left: start, top: r.y - height + h * 0.25, width: Math.max(20, end - start), height, reason: "underline" });
      }

      // 2. box glyphs
      for (const m of r.str.matchAll(BOX_GLYPHS)) {
        const start = charX(r, m.index!);
        const after = cleanLabel(r.str.slice(m.index! + m[0].length).split(BOX_GLYPHS)[0] ?? "") || cleanLabel(line[ri + 1]?.str ?? "");
        const size = Math.max(9, h * 0.9);
        found.push({ type: "checkbox", name: after || "Checkbox", left: start, top: r.y - size * 0.9, width: size, height: size, reason: "box" });
      }

      // 3. "Label:" with empty space to the right (and no underscores already used)
      const trimmed = r.str.trimEnd();
      if (/[^\s:]{2,}.*:$/.test(trimmed) && !/_{3,}/.test(r.str)) {
        const next = line[ri + 1];
        const labelEnd = r.x + r.width;
        const room = (next ? next.x : page.width - margin) - labelEnd;
        if (room >= 60) {
          const label = cleanLabel(labelSoFar + trimmed);
          const type = typeFor(label);
          const height = type === "signature" ? Math.max(28, h * 2.6) : Math.max(14, h * 1.5);
          const width = Math.min(room - 8, type === "date" ? 110 : type === "signature" ? 220 : 260);
          found.push({ type, name: label || "Field", left: labelEnd + 6, top: r.y - height + h * 0.3, width, height, reason: "label" });
        }
      }
      labelSoFar = /[:_]\s*$/.test(r.str) ? "" : `${labelSoFar}${r.str} `;
    }
  }

  // Clamp, drop tiny/overlapping duplicates.
  const result: Suggestion[] = [];
  for (const s of found) {
    const c = {
      ...s,
      left: Math.max(0, Math.min(s.left, page.width - s.width)),
      top: Math.max(0, Math.min(s.top, page.height - s.height)),
    };
    const dup = result.some((o) => Math.abs(o.left - c.left) < 4 && Math.abs(o.top - c.top) < 4);
    if (!dup) result.push(c);
  }
  return result;
}
