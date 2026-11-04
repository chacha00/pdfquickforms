import { describe, expect, it } from "vitest";
import { detectFields, type TextRun } from "../../src/lib/forms/detect";

const page = { width: 612, height: 792 };
const run = (str: string, x: number, y: number, width = str.length * 5, height = 10): TextRun => ({ str, x, y, width, height });

describe("detectFields", () => {
  it("finds an underscore line and names it from the label", () => {
    const s = detectFields([run("Name: __________", 72, 100, 80)], page);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ type: "text", name: "Name", reason: "underline" });
    expect(s[0]!.left).toBeCloseTo(72 + (80 * 6) / 16);
    expect(s[0]!.width).toBeCloseTo((80 * 10) / 16);
  });

  it("uses the label from a previous run on the same line", () => {
    const s = detectFields([run("Email address", 72, 100, 65), run("____________", 140, 100, 120)], page);
    expect(s[0]).toMatchObject({ type: "email", name: "Email address", left: 140 });
  });

  it("detects signature and date lines by label", () => {
    const s = detectFields([run("Signature: ______________", 72, 600, 125), run("Date: ________", 300, 600, 70)], page);
    expect(s.map((x) => x.type)).toEqual(["signature", "date"]);
    expect(s[0]!.height).toBeGreaterThanOrEqual(28);
  });

  it("detects box glyphs as checkboxes named after the following text", () => {
    const s = detectFields([run("☐ I agree to the terms", 72, 300, 110), run("[ ] Subscribe", 72, 320, 65)], page);
    expect(s.map((x) => [x.type, x.name])).toEqual([
      ["checkbox", "I agree to the terms"],
      ["checkbox", "Subscribe"],
    ]);
  });

  it("detects 'Label:' with room to the right, but not when text follows closely", () => {
    const s = detectFields([run("Phone:", 72, 200, 30), run("Company:", 72, 230, 40), run("Acme Inc.", 120, 230, 45)], page);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ type: "phone", name: "Phone", reason: "label", left: 108 });
  });

  it("ignores ordinary text and returns nothing for empty pages", () => {
    expect(detectFields([run("This is a normal sentence without fields.", 72, 100)], page)).toEqual([]);
    expect(detectFields([], page)).toEqual([]);
  });

  it("keeps suggestions inside the page and de-duplicates", () => {
    const s = detectFields([run("Notes: ____", 590, 790, 60), run("Notes: ____", 590, 790, 60)], page);
    expect(s).toHaveLength(1);
    expect(s[0]!.left + s[0]!.width).toBeLessThanOrEqual(612);
    expect(s[0]!.top + s[0]!.height).toBeLessThanOrEqual(792);
  });
});
