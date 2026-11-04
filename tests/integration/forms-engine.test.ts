import { describe, expect, it } from "vitest";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  degrees,
} from "pdf-lib";
import { exportProject } from "../../src/lib/pdf/forms/exportProject";
import { fillPdf, inspectPdf } from "../../src/lib/pdf/forms/inspect";
import type { El, PageModel, Project } from "../../src/lib/forms/model";
import { JPEG_2x1, PNG_1x1, makePdf, pageTags } from "../fixtures/makePdf";

// PDF.js = the engine behind Firefox's PDF viewer. Used to prove fields are interactive outside pdf-lib.
async function pdfjsAnnotations(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" }).promise;
  const out: { page: number; fieldType?: string; fieldName?: string; checkBox?: boolean; radioButton?: boolean; fieldValue?: unknown; options?: unknown[]; readOnly?: boolean; required?: boolean }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    for (const a of (await page.getAnnotations()) as Record<string, unknown>[]) {
      if (a.subtype !== "Widget") continue;
      out.push({
        page: i,
        fieldType: a.fieldType as string,
        fieldName: a.fieldName as string,
        checkBox: a.checkBox as boolean,
        radioButton: a.radioButton as boolean,
        fieldValue: a.fieldValue,
        readOnly: a.readOnly as boolean,
        required: (a as { required?: boolean }).required,
      });
    }
  }
  const text: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    text.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await doc.loadingTask.destroy();
  return { widgets: out, text };
}

const blankPage = (id: string, width = 612, height = 792): PageModel => ({ id, kind: "blank", width, height });
const el = (type: El["type"], extra: Partial<El>): El => ({ id: Math.random().toString(36), type, pageId: "p1", left: 72, top: 72, width: 200, height: 22, font: "helvetica", fontSize: 11, color: "#000000", ...extra });
const project = (pages: PageModel[], elements: El[], existingValues: Project["existingValues"] = {}): Project => ({ version: 1, id: "t", name: "Test form", pages, elements, existingValues });

describe("exportProject: every field type is a genuine AcroForm field", () => {
  const elements: El[] = [
    el("heading", { value: "Client intake", fontSize: 20, bold: true, top: 40, height: 26, width: 400 }),
    el("paragraph", { value: "Please complete every section of this form.", top: 70, height: 30, width: 400 }),
    el("text", { name: "Full name", value: "Ada", required: true, label: "Your legal name", maxLength: 40, align: "center", top: 110, background: "#eef3ff", border: "#94a3b8", borderWidth: 1 }),
    el("email", { name: "Email", value: "ada@example.com", top: 140 }),
    el("phone", { name: "Phone", top: 170, readOnly: true, value: "555-0100" }),
    el("date", { name: "Start date", value: "2026-11-04", dateFormat: "dd/mm/yyyy", top: 200, width: 110 }),
    el("text", { name: "Notes", multiline: true, value: "Line 1\nLine 2", top: 230, height: 60 }),
    el("checkbox", { name: "Agree", checked: true, width: 14, height: 14, top: 300 }),
    el("checkbox", { name: "Newsletter", checked: false, width: 14, height: 14, top: 320 }),
    el("radio", { group: "Size", option: "Small", width: 14, height: 14, top: 350, required: true }),
    el("radio", { group: "Size", option: "Large", checked: true, width: 14, height: 14, top: 350, left: 120 }),
    el("dropdown", { name: "Country", options: ["Canada", "Mexico", "USA"], value: "Mexico", top: 380 }),
    el("listbox", { name: "Interests", options: ["Art", "Music", "Sport"], selected: ["Art", "Sport"], multiSelect: true, top: 410, height: 50 }),
    el("signature", { name: "Signature", label: "Applicant signature", top: 480, height: 40 }),
    el("line", { top: 530, height: 8, width: 468, color: "#94a3b8", borderWidth: 1 }),
    el("rect", { top: 550, height: 60, width: 200, border: "#000000", borderWidth: 1 }),
    el("image", { imageId: "logo", top: 620, width: 40, height: 40 }),
    el("text", { name: "Ignored suggestion", origin: "suggested", top: 700 }),
  ];
  const images = { logo: { kind: "png" as const, bytes: PNG_1x1, width: 1, height: 1 } };

  it("creates the right fields with values and flags", async () => {
    const { bytes, summary } = await exportProject({ source: null, project: project([blankPage("p1")], elements), images });
    expect(summary.fields.map((f) => `${f.name}:${f.type}`)).toEqual([
      "Full name:text",
      "Email:text",
      "Phone:text",
      "Start date:text",
      "Notes:text",
      "Agree:checkbox",
      "Newsletter:checkbox",
      "Size:radio",
      "Country:dropdown",
      "Interests:listbox",
      "Signature:signature",
    ]);
    const form = (await PDFDocument.load(bytes)).getForm();
    const name = form.getTextField("Full name");
    expect(name.getText()).toBe("Ada");
    expect(name.isRequired()).toBe(true);
    expect(name.getMaxLength()).toBe(40);
    expect(name.getAlignment()).toBe(1);
    expect(name.acroField.dict.get(PDFName.of("TU"))?.toString()).toContain("FEFF"); // UTF-16 tooltip
    expect(name.acroField.getWidgets()[0]!.getRectangle()).toEqual({ x: 72, y: 792 - 110 - 22, width: 200, height: 22 });
    expect(form.getTextField("Phone").isReadOnly()).toBe(true);
    expect(form.getTextField("Start date").getText()).toBe("04/11/2026");
    expect(form.getTextField("Start date").acroField.dict.get(PDFName.of("AA"))?.toString()).toContain("AFDate_FormatEx");
    expect(form.getTextField("Notes").isMultiline()).toBe(true);
    expect(form.getCheckBox("Agree").isChecked()).toBe(true);
    expect(form.getCheckBox("Newsletter").isChecked()).toBe(false);
    const size = form.getRadioGroup("Size");
    expect(size.getOptions()).toEqual(["Small", "Large"]);
    expect(size.getSelected()).toBe("Large");
    expect(size.isRequired()).toBe(true);
    expect(form.getDropdown("Country").getSelected()).toEqual(["Mexico"]);
    expect(form.getOptionList("Interests").getSelected()).toEqual(["Art", "Sport"]);
    expect(form.getField("Signature")).toBeInstanceOf(PDFSignature);
    expect(() => form.getField("Ignored suggestion")).toThrow();
  });

  it("PDF.js (Firefox's viewer engine) sees interactive widgets for every field", async () => {
    const { bytes } = await exportProject({ source: null, project: project([blankPage("p1")], elements), images });
    const { widgets, text } = await pdfjsAnnotations(bytes);
    const byName = (n: string) => widgets.filter((w) => w.fieldName === n);
    expect(byName("Full name")[0]).toMatchObject({ fieldType: "Tx", fieldValue: "Ada" });
    expect(byName("Phone")[0]?.readOnly).toBe(true);
    expect(byName("Agree")[0]).toMatchObject({ fieldType: "Btn", checkBox: true });
    expect(byName("Size")).toHaveLength(2);
    expect(byName("Size").every((w) => w.radioButton)).toBe(true);
    expect(byName("Country")[0]).toMatchObject({ fieldType: "Ch" });
    expect(byName("Interests")[0]).toMatchObject({ fieldType: "Ch" });
    expect(byName("Signature")[0]).toMatchObject({ fieldType: "Sig" });
    // Layout text is real page text
    expect(text[0]).toContain("Client intake");
    expect(text[0]).toContain("Please complete every section of this form.");
    expect(text[0]).toContain("Applicant signature");
  });

  it("fields can be filled after export and survive a save/reopen", async () => {
    const { bytes } = await exportProject({ source: null, project: project([blankPage("p1")], elements), images });
    const filled = await fillPdf(bytes, { "Full name": "Grace Hopper", Newsletter: true, Size: "Small", Country: "Canada", Interests: ["Music"], Phone: "nope" }, { flatten: false });
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("Full name").getText()).toBe("Grace Hopper");
    expect(form.getCheckBox("Newsletter").isChecked()).toBe(true);
    expect(form.getRadioGroup("Size").getSelected()).toBe("Small");
    expect(form.getDropdown("Country").getSelected()).toEqual(["Canada"]);
    expect(form.getOptionList("Interests").getSelected()).toEqual(["Music"]);
    expect(form.getTextField("Phone").getText()).toBe("555-0100"); // read-only untouched
  });

  it("flattened fill removes fields but keeps the values as page content", async () => {
    const { bytes } = await exportProject({ source: null, project: project([blankPage("p1")], elements.slice(0, 5)), images });
    const flat = await fillPdf(bytes, { "Full name": "Flattened Value" }, { flatten: true });
    expect((await PDFDocument.load(flat)).getForm().getFields()).toHaveLength(0);
    const { text } = await pdfjsAnnotations(flat);
    expect(text[0]).toContain("Flattened Value");
  });
});

describe("exportProject: existing PDFs", () => {
  async function existingForm() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const tag of [1, 2, 3]) {
      const p = doc.addPage([200 + tag, 300]);
      p.drawText(`page ${tag}`, { x: 10, y: 10, size: 10, font });
    }
    const f = doc.getForm();
    const t = f.createTextField("Existing name");
    t.addToPage(doc.getPage(0), { x: 10, y: 200, width: 100, height: 20 });
    const c = f.createCheckBox("Existing on page 3");
    c.addToPage(doc.getPage(2), { x: 10, y: 200, width: 12, height: 12 });
    return doc.save();
  }

  it("preserves content and existing fields, applies typed values, adds new fields", async () => {
    const source = await existingForm();
    const pages: PageModel[] = [0, 1, 2].map((i) => ({ id: `p${i}`, kind: "pdf", index: i, width: 201 + i, height: 300 }));
    const { bytes } = await exportProject({
      source,
      project: project(pages, [el("text", { name: "New field", pageId: "p1", left: 10, top: 10, width: 100 })], { "Existing name": "Typed in preview" }),
      images: {},
    });
    const doc = await PDFDocument.load(bytes);
    expect(await pageTags(bytes)).toEqual([1, 2, 3]);
    const names = doc.getForm().getFields().map((f) => f.getName());
    expect(names).toEqual(["Existing name", "Existing on page 3", "New field"]);
    expect(doc.getForm().getTextField("Existing name").getText()).toBe("Typed in preview");
    const widgetPage = doc.getForm().getTextField("New field").acroField.getWidgets()[0]!.P();
    expect(widgetPage?.toString()).toBe(doc.getPage(1).ref.toString());
  });

  it("reorders, deletes, duplicates and inserts pages; drops fields on deleted pages", async () => {
    const source = await existingForm();
    const pages: PageModel[] = [
      { id: "a", kind: "pdf", index: 1, width: 202, height: 300 },
      { id: "b", kind: "blank", width: 400, height: 500 },
      { id: "c", kind: "pdf", index: 0, width: 201, height: 300 },
      { id: "d", kind: "pdf", index: 1, width: 202, height: 300 }, // duplicate of a page without fields
    ];
    const { bytes } = await exportProject({ source, project: project(pages, [el("checkbox", { name: "On blank", pageId: "b", width: 12, height: 12 })]), images: {} });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([202, 400, 201, 202]);
    expect(doc.getForm().getFields().map((f) => f.getName())).toEqual(["Existing name", "On blank"]);
    // the existing field stays attached to its (moved) page
    expect(doc.getForm().getTextField("Existing name").acroField.getWidgets()[0]!.P()?.toString()).toBe(doc.getPage(2).ref.toString());
  });

  it("refuses to duplicate a page that has its own form fields", async () => {
    const source = await existingForm();
    const pages: PageModel[] = [
      { id: "a", kind: "pdf", index: 0, width: 201, height: 300 },
      { id: "b", kind: "pdf", index: 0, width: 201, height: 300 },
    ];
    await expect(exportProject({ source, project: project(pages, []), images: {} })).rejects.toThrow(/can't be duplicated/);
  });

  it("rejects a new field that reuses an existing field's name", async () => {
    const source = await existingForm();
    const pages: PageModel[] = [{ id: "a", kind: "pdf", index: 0, width: 201, height: 300 }];
    await expect(exportProject({ source, project: project(pages, [el("text", { name: "Existing name", pageId: "a" })]), images: {} })).rejects.toThrow(/already used/);
  });

  it("places fields correctly on rotated pages (round-trip through inspect)", async () => {
    const d = await PDFDocument.create();
    for (const r of [0, 90, 180, 270]) d.addPage([612, 792]).setRotation(degrees(r));
    const src = await d.save();
    const info = await inspectPdf(src);
    expect(info.pages[1]).toEqual({ width: 792, height: 612 });
    const pages: PageModel[] = info.pages.map((p, i) => ({ id: `p${i}`, kind: "pdf", index: i, ...p }));
    const box = { left: 50, top: 60, width: 120, height: 24 };
    const els = pages.map((p, i) => el("text", { name: `R${i}`, pageId: p.id, ...box, border: null, borderWidth: 0 }));
    const { bytes } = await exportProject({ source: src, project: project(pages, els), images: {} });
    const back = await inspectPdf(bytes);
    for (const f of back.fields) {
      const b = f.widgets[0]!.box;
      expect([b.left, b.top, b.width, b.height].map((v) => Math.round(v))).toEqual([50, 60, 120, 24]);
    }
  });
});

describe("inspectPdf", () => {
  it("lists existing fields with display-space widget boxes and values", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const f = doc.getForm();
    f.createTextField("Name").addToPage(page, { x: 100, y: 700, width: 150, height: 20, borderWidth: 0 });
    f.getTextField("Name").setText("Pre-filled");
    const rg = f.createRadioGroup("Pick");
    rg.addOptionToPage("A", page, { x: 100, y: 600, width: 12, height: 12 });
    rg.addOptionToPage("B", page, { x: 130, y: 600, width: 12, height: 12 });
    rg.select("B");
    f.createDropdown("Choose").setOptions(["x", "y"]);
    f.getDropdown("Choose").addToPage(page, { x: 100, y: 500, width: 100, height: 20 });
    const info = await inspectPdf(await doc.save());
    expect(info.fields.map((x) => [x.name, x.type, x.value])).toEqual([
      ["Name", "text", "Pre-filled"],
      ["Pick", "radio", "B"],
      ["Choose", "dropdown", ""],
    ]);
    expect(info.fields[0]!.widgets[0]!.box).toEqual({ left: 100, top: 72, width: 150, height: 20 });
    expect(info.fields[1]!.widgets.map((w) => w.option)).toEqual(["A", "B"]);
    expect(info.fields[2]!.options).toEqual(["x", "y"]);
    expect(info.warnings).toEqual([]);
  });

  it("works for PDFs without forms", async () => {
    const info = await inspectPdf(await makePdf([1, 2]));
    expect(info.fields).toEqual([]);
    expect(info.pages).toHaveLength(2);
  });
});

describe("export errors", () => {
  it("reports unsupported characters with the field name", async () => {
    await expect(
      exportProject({ source: null, project: project([blankPage("p1")], [el("text", { name: "Greeting", value: "Hi 😀" })]), images: {} }),
    ).rejects.toThrow(/"Greeting".*😀/);
  });

  it("requires images for image elements and options for dropdowns", async () => {
    await expect(exportProject({ source: null, project: project([blankPage("p1")], [el("image", {})]), images: {} })).rejects.toThrow(/no image/);
    await expect(
      exportProject({ source: null, project: project([blankPage("p1")], [el("dropdown", { name: "D", options: [] })]), images: {} }),
    ).rejects.toThrow(/at least one option/);
  });

  it("embeds JPEG images and signature appearance images", async () => {
    const { bytes } = await exportProject({
      source: null,
      project: project([blankPage("p1")], [el("signature", { name: "Sig", imageId: "s", height: 50 }), el("image", { imageId: "j", top: 300, width: 40, height: 20 })]),
      images: { s: { kind: "png", bytes: PNG_1x1, width: 1, height: 1 }, j: { kind: "jpeg", bytes: JPEG_2x1, width: 2, height: 1 } },
    });
    expect((await PDFDocument.load(bytes)).getForm().getField("Sig")).toBeInstanceOf(PDFSignature);
  });
});

// Make sure the imports used for instanceof aren't tree-shaken from the type check.
void [PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField];
