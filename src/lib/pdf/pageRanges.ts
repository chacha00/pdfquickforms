/**
 * Page-range parsing. User-facing page numbers are 1-based; everything
 * returned from here is 0-based page indices.
 *
 * Accepted syntax: "1-3, 5, 8-12", whitespace tolerant, "end" / open-ended
 * ranges like "8-" mean "to the last page".
 */

export type RangeParseResult =
  | { ok: true; groups: number[][] }
  | { ok: false; error: string };

const TOKEN = /^(\d+)\s*(?:-\s*(\d+|end)?)?$/i;

export function parsePageRanges(input: string, pageCount: number): RangeParseResult {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: "The document has no pages." };
  }
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "Enter at least one page or range, e.g. 1-3, 5." };

  const parts = trimmed.split(",").map((p) => p.trim()).filter((p) => p !== "");
  if (parts.length === 0) return { ok: false, error: "Enter at least one page or range, e.g. 1-3, 5." };

  const groups: number[][] = [];
  for (const part of parts) {
    const m = TOKEN.exec(part);
    if (!m) return { ok: false, error: `"${part}" is not a valid page or range.` };
    const start = Number(m[1]);
    const hasDash = part.includes("-");
    const endRaw = m[2];
    const end = !hasDash ? start : endRaw === undefined || endRaw.toLowerCase() === "end" ? pageCount : Number(endRaw);

    if (start < 1) return { ok: false, error: `Page numbers start at 1 (got "${part}").` };
    if (start > pageCount) return { ok: false, error: `Page ${start} does not exist — this document has ${pageCount} page${pageCount === 1 ? "" : "s"}.` };
    if (end > pageCount) return { ok: false, error: `Page ${end} does not exist — this document has ${pageCount} page${pageCount === 1 ? "" : "s"}.` };
    if (end < start) return { ok: false, error: `Range "${part}" goes backwards. Use ${end}-${start} instead.` };

    const group: number[] = [];
    for (let p = start; p <= end; p++) group.push(p - 1);
    groups.push(group);
  }
  return { ok: true, groups };
}

/** Flatten groups to a unique, ascending list of page indices. */
export function uniqueSortedPages(groups: number[][]): number[] {
  return [...new Set(groups.flat())].sort((a, b) => a - b);
}

/** Format 0-based indices back into compact 1-based range text: [0,1,2,4] -> "1-3, 5". */
export function formatPageRanges(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i]!;
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      i++;
      end = sorted[i]!;
    }
    out.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
    i++;
  }
  return out.join(", ");
}
