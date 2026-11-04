import { describe, expect, it } from "vitest";
import { formatPageRanges, parsePageRanges, uniqueSortedPages } from "../../src/lib/pdf/pageRanges";

describe("parsePageRanges", () => {
  it("parses mixed ranges", () => {
    const r = parsePageRanges("1-3, 5, 8-12", 12);
    expect(r).toEqual({ ok: true, groups: [[0, 1, 2], [4], [7, 8, 9, 10, 11]] });
  });

  it("tolerates whitespace and trailing commas", () => {
    expect(parsePageRanges("  2 - 3 ,, 4 ,", 5)).toEqual({ ok: true, groups: [[1, 2], [3]] });
  });

  it("supports open-ended and 'end' ranges", () => {
    expect(parsePageRanges("3-", 5)).toEqual({ ok: true, groups: [[2, 3, 4]] });
    expect(parsePageRanges("4-end", 5)).toEqual({ ok: true, groups: [[3, 4]] });
  });

  it.each([
    ["", /at least one/],
    ["0", /start at 1/],
    ["6", /does not exist/],
    ["2-9", /does not exist/],
    ["5-2", /backwards/],
    ["abc", /not a valid/],
    ["1-2-3", /not a valid/],
    ["1.5", /not a valid/],
    ["-3", /not a valid/],
  ])("rejects %j", (input, pattern) => {
    const r = parsePageRanges(input, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(pattern);
  });

  it("rejects when the document has no pages", () => {
    expect(parsePageRanges("1", 0).ok).toBe(false);
  });
});

describe("uniqueSortedPages / formatPageRanges", () => {
  it("dedupes and sorts", () => {
    expect(uniqueSortedPages([[3, 1], [1, 2]])).toEqual([1, 2, 3]);
  });

  it("formats compact ranges", () => {
    expect(formatPageRanges([0, 1, 2, 4, 7, 8])).toBe("1-3, 5, 8-9");
    expect(formatPageRanges([])).toBe("");
  });

  it("round-trips", () => {
    const text = "1-3, 5, 8-9";
    const parsed = parsePageRanges(text, 10);
    expect(parsed.ok && formatPageRanges(uniqueSortedPages(parsed.groups))).toBe(text);
  });
});
