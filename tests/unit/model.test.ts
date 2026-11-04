import { describe, expect, it } from "vitest";
import {
  createElement,
  formatDate,
  isValidEmail,
  isValidPhone,
  nextName,
  parseDate,
  projectIssues,
  sanitizeFieldName,
  uniqueName,
  usedNames,
  validateValue,
  type El,
  type Project,
} from "../../src/lib/forms/model";
import { canRedo, canUndo, commit, initHistory, redo, undo } from "../../src/lib/forms/history";
import { snapMove, snapResize } from "../../src/lib/forms/snap";
import {
  clampBox,
  displayBoxToUserRect,
  displayToUser,
  userRectToDisplayBox,
  userToDisplay,
  widgetPlacement,
  type PageBox,
} from "../../src/lib/coordinates/geometry";

const LETTER: PageBox = [0, 0, 612, 792];

describe("coordinates", () => {
  it.each([0, 90, 180, 270] as const)("display <-> user round-trips at rotation %i", (r) => {
    for (const [x, y] of [[0, 0], [10, 20], [300, 500]] as const) {
      const [ux, uy] = displayToUser(x, y, LETTER, r);
      expect(userToDisplay(ux, uy, LETTER, r)).toEqual([x, y]);
    }
    const box = { left: 30, top: 40, width: 100, height: 20 };
    expect(userRectToDisplayBox(displayBoxToUserRect(box, LETTER, r), LETTER, r)).toEqual(box);
  });

  it("handles a crop box offset", () => {
    const crop: PageBox = [36, 36, 576, 756];
    expect(displayToUser(0, 0, crop, 0)).toEqual([36, 756]);
    expect(userToDisplay(36, 756, crop, 0)).toEqual([0, 0]);
  });

  it.each([0, 90, 180, 270] as const)("widgetPlacement inverts pdf-lib's rotate+border at %i", (r) => {
    const t = { x: 40, y: 60, width: 30, height: 80 };
    const p = widgetPlacement(t, r, 1);
    const res =
      r === 0 ? { x: p.x - 0.5, y: p.y - 0.5, width: p.width + 1, height: p.height + 1 }
      : r === 90 ? { x: p.x - p.height - 0.5, y: p.y - 0.5, width: p.height + 1, height: p.width + 1 }
      : r === 180 ? { x: p.x - p.width - 0.5, y: p.y - p.height - 0.5, width: p.width + 1, height: p.height + 1 }
      : { x: p.x - 0.5, y: p.y - p.width - 0.5, width: p.height + 1, height: p.width + 1 };
    expect(res).toEqual(t);
  });

  it("clamps boxes to the page", () => {
    expect(clampBox({ left: -10, top: 790, width: 50, height: 20 }, { width: 612, height: 792 })).toEqual({ left: 0, top: 772, width: 50, height: 20 });
  });
});

describe("names", () => {
  const els = (...names: string[]): El[] => names.map((name, i) => ({ id: `${i}`, type: "text", pageId: "p", left: 0, top: 0, width: 1, height: 1, name }));

  it("generates the next free name per type", () => {
    expect(nextName("text", els("Text 1", "Text 3"))).toBe("Text 2");
    expect(nextName("checkbox", els("Text 1"))).toBe("Checkbox 1");
    expect(nextName("text", [], ["Text 1"])).toBe("Text 2");
  });

  it("uniqueName adds a counter and sanitizes", () => {
    expect(uniqueName("Name", new Set(["Name", "Name 2"]))).toBe("Name 3");
    expect(uniqueName("a.b", new Set())).toBe("a_b");
    expect(sanitizeFieldName("  x\u0001y.z ")).toBe("xy_z");
  });

  it("radio groups contribute their group name", () => {
    const r: El = { id: "r", type: "radio", pageId: "p", left: 0, top: 0, width: 1, height: 1, group: "Size", option: "S" };
    expect([...usedNames([r])]).toEqual(["Size"]);
  });

  it("createElement centres on the click point and names fields", () => {
    const el = createElement("text", "p1", { x: 100, y: 200 }, { elements: [] });
    expect(el).toMatchObject({ type: "text", pageId: "p1", left: 100, top: 189, width: 200, height: 22, name: "Text 1" });
    const radio = createElement("radio", "p1", { x: 0, y: 0 }, { elements: [] });
    expect(radio).toMatchObject({ group: "Choice 1", option: "Option 1" });
    expect(createElement("heading", "p1", { x: 0, y: 0 }, { elements: [] }).name).toBeUndefined();
  });
});

describe("validation", () => {
  it.each([
    ["a@b.co", true],
    ["first.last+tag@example.org", true],
    ["nope", false],
    ["a@b", false],
    ["a b@c.com", false],
  ])("email %s -> %s", (v, ok) => expect(isValidEmail(v)).toBe(ok));

  it.each([
    ["(555) 123-4567", true],
    ["+44 20 7946 0958", true],
    ["12345", false],
    ["call me", false],
  ])("phone %s -> %s", (v, ok) => expect(isValidPhone(v)).toBe(ok));

  it("formats and parses dates", () => {
    expect(formatDate("2026-11-04", "mm/dd/yyyy")).toBe("11/04/2026");
    expect(formatDate("2026-11-04", "dd/mm/yyyy")).toBe("04/11/2026");
    expect(parseDate("11/04/2026", "mm/dd/yyyy")).toBe("2026-11-04");
    expect(parseDate("31/02/2026", "dd/mm/yyyy")).toBe("");
    expect(parseDate("garbage", "yyyy-mm-dd")).toBe("");
  });

  it("validateValue applies required, type and length rules", () => {
    const base: El = { id: "x", type: "email", pageId: "p", left: 0, top: 0, width: 1, height: 1, required: true };
    expect(validateValue(base, "")).toMatch(/required/);
    expect(validateValue(base, "bad")).toMatch(/email/);
    expect(validateValue(base, "ok@ok.com")).toBeNull();
    expect(validateValue({ ...base, type: "text", maxLength: 3 }, "abcd")).toMatch(/at most 3/);
    expect(validateValue({ ...base, type: "checkbox" }, false)).toMatch(/required/);
  });

  it("projectIssues finds duplicate names, missing options and orphan elements", () => {
    const p: Project = {
      version: 1,
      id: "p",
      name: "t",
      existingValues: {},
      pages: [{ id: "pg", kind: "blank", width: 612, height: 792 }],
      elements: [
        { id: "1", type: "text", pageId: "pg", left: 0, top: 0, width: 10, height: 10, name: "Name" },
        { id: "2", type: "email", pageId: "pg", left: 0, top: 0, width: 10, height: 10, name: "Name" },
        { id: "3", type: "dropdown", pageId: "pg", left: 0, top: 0, width: 10, height: 10, name: "D", options: [" "] },
        { id: "4", type: "radio", pageId: "pg", left: 0, top: 0, width: 10, height: 10, group: "G", option: "A" },
        { id: "5", type: "radio", pageId: "pg", left: 0, top: 0, width: 10, height: 10, group: "G", option: "A" },
        { id: "6", type: "text", pageId: "gone", left: 0, top: 0, width: 10, height: 10, name: "Orphan" },
        { id: "7", type: "text", pageId: "pg", left: 0, top: 0, width: 10, height: 10, name: "Existing" },
      ],
    };
    const msgs = projectIssues(p, ["Existing"]).map((i) => i.message);
    expect(msgs).toEqual([
      'Two fields are named "Name". Field names must be unique (radio buttons share their group name).',
      '"D" needs at least one option.',
      "Text field is on a page that no longer exists.",
      '"Existing" is already used by a field in the original PDF.',
      'Radio group "G" has two options called "A".',
    ]);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = initHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = commit(h, 9);
    expect(canRedo(h)).toBe(false);
  });

  it("coalesces rapid changes with the same key", () => {
    let h = initHistory("a");
    h = commit(h, "ab", { coalesce: "type", now: 0 });
    h = commit(h, "abc", { coalesce: "type", now: 500 });
    h = commit(h, "abcd", { coalesce: "type", now: 2000 });
    expect(h.past).toEqual(["a", "abc"]);
  });

  it("caps history length", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i);
    expect(h.past.length).toBe(100);
  });
});

describe("snap", () => {
  const page = { width: 612, height: 792 };

  it("snaps to another element's left edge and reports a guide", () => {
    const r = snapMove({ left: 103, top: 300, width: 50, height: 20 }, [{ left: 100, top: 100, width: 80, height: 20 }], page, { grid: null, threshold: 5 });
    expect(r.box.left).toBe(100);
    expect(r.guides.x).toEqual([100]);
  });

  it("snaps centre to the page centre", () => {
    const r = snapMove({ left: 283, top: 500, width: 50, height: 20 }, [], page, { grid: null, threshold: 5 });
    expect(r.box.left + 25).toBe(306);
  });

  it("falls back to the grid", () => {
    const r = snapMove({ left: 47, top: 203, width: 10, height: 10 }, [], page, { grid: 8, threshold: 2 });
    expect([r.box.left, r.box.top]).toEqual([48, 200]);
  });

  it("resizing respects minimum size and page bounds", () => {
    const r = snapResize({ left: 600, top: 10, width: 50, height: 2 }, [], page, { grid: null, threshold: 0 }, { width: 10, height: 10 });
    expect(r.box.width).toBe(12);
    expect(r.box.height).toBe(10);
  });
});
