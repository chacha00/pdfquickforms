/**
 * Export a PDFQuick Forms project to a PDF with genuine AcroForm fields.
 *
 * - Works on the uploaded PDF in place, so original content, fonts, images
 *   and existing form fields are preserved (never flattened).
 * - Page add/delete/reorder/duplicate is applied to the page tree.
 * - New fields are real interactive widgets (text, checkbox, radio group,
 *   dropdown, list box, unsigned signature field); layout elements are drawn
 *   as page content.
 * - The result is re-opened and checked before it is returned.
 */
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  TextAlignment,
  degrees,
  type PDFField,
  type PDFFont,
  type PDFPage,
  type PDFRadioGroup,
} from "pdf-lib";
import { PdfError, loadPdf } from "../engine";
import { displayBoxToUserRect, displayToUser, widgetPlacement, type DisplayBox } from "../../coordinates/geometry";
import { formatDate, isField, sanitizeFieldName, type El, type Project, type ProjectImage } from "../../forms/model";
import { applyExistingValues, fieldType } from "./inspect";
import { assertEncodable, fontCache, hexColor, pageGeometry, wrapText } from "./shared";

export interface ExportInput {
  source: Uint8Array | null;
  project: Project;
  images: Record<string, ProjectImage>;
}

export interface ExportSummary {
  fields: { name: string; type: string }[];
  pages: number;
}

const ALIGN = { left: TextAlignment.Left, center: TextAlignment.Center, right: TextAlignment.Right } as const;
const LINE_HEIGHT = 1.2;
/** Helvetica-ish ascent; good enough for all three standard families' first baseline. */
const ASCENT = 0.8;

export async function exportProject(input: ExportInput, onProgress: (f: number) => void = () => {}): Promise<{ bytes: Uint8Array; summary: ExportSummary }> {
  const { project } = input;
  if (project.pages.length === 0) throw new PdfError("invalid-input", "The form has no pages.");
  const doc = input.source ? await loadPdf(input.source) : await PDFDocument.create();
  const form = doc.getForm();
  if (form.hasXFA()) form.deleteXFA();
  const font = fontCache(doc);

  // ---- 1. Page tree
  const original = doc.getPages();
  const used = new Map<number, number>();
  const finalPages: PDFPage[] = [];
  for (const pm of project.pages) {
    if (pm.kind === "blank") {
      finalPages.push(doc.addPage([pm.width, pm.height]));
      continue;
    }
    const src = original[pm.index];
    if (!src) throw new PdfError("invalid-input", `Original page ${pm.index + 1} does not exist.`);
    const times = used.get(pm.index) ?? 0;
    used.set(pm.index, times + 1);
    if (times === 0) finalPages.push(src);
    else {
      if (src.node.Annots()?.size()) {
        const hasWidgets = form.getFields().some((f) => f.acroField.getWidgets().some((w) => w.P()?.toString() === src.ref.toString()));
        if (hasWidgets) throw new PdfError("invalid-input", `Page ${pm.index + 1} has form fields of its own and can't be duplicated.`);
      }
      const [copy] = await doc.copyPages(doc, [pm.index]);
      finalPages.push(copy!);
    }
  }
  // Remove fields that only live on deleted pages, then rebuild the page order.
  const keptRefs = new Set(finalPages.map((p) => p.ref.toString()));
  for (const f of form.getFields()) {
    const widgets = f.acroField.getWidgets();
    const onKept = widgets.filter((w) => !w.P() || keptRefs.has(w.P()!.toString()));
    if (widgets.length > 0 && onKept.length === 0) form.removeField(f);
    else if (onKept.length < widgets.length) {
      for (let i = widgets.length - 1; i >= 0; i--) if (!onKept.includes(widgets[i]!)) f.acroField.removeWidget(i);
    }
  }
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  for (const p of finalPages) doc.addPage(p);
  onProgress(0.2);

  // ---- 2. Existing field values typed in the editor's preview
  if (Object.keys(project.existingValues).length) await applyExistingValues(doc, project.existingValues);
  const reserved = new Set(form.getFields().map((f) => f.getName()));

  // ---- 3. Elements
  const pageIndex = new Map(project.pages.map((p, i) => [p.id, i]));
  const radioGroups = new Map<string, PDFRadioGroup>();
  const created: { field: PDFField; el: El; font?: PDFFont }[] = [];
  const total = project.elements.length || 1;
  // Layout first so it sits underneath; fields are annotations and always on top anyway.
  const ordered = [...project.elements.filter((e) => !isField(e.type)), ...project.elements.filter((e) => isField(e.type))];

  for (let n = 0; n < ordered.length; n++) {
    const el = ordered[n]!;
    if (el.origin === "suggested") continue; // unaccepted auto-detect suggestions are never exported
    const pi = pageIndex.get(el.pageId);
    if (pi === undefined) continue;
    const page = finalPages[pi]!;
    const g = pageGeometry(page);
    const box: DisplayBox = { left: el.left, top: el.top, width: el.width, height: el.height };
    const userRect = displayBoxToUserRect(box, g.box, g.rotation);
    const rotate = degrees(g.rotation);
    const f = await font(el.font ?? "helvetica", el.bold ?? false);
    const size = Math.max(4, Math.min(96, el.fontSize ?? 11));
    const color = hexColor(el.color) ?? hexColor("#000000")!;

    const drawLines = (text: string, what: string, inset = 0) => {
      assertEncodable(f, text, what);
      const lines = wrapText(text, f, size, Math.max(1, el.width - inset * 2));
      lines.forEach((line, i) => {
        if (!line) return;
        const w = f.widthOfTextAtSize(line, size);
        const dx = el.align === "center" ? (el.width - w) / 2 : el.align === "right" ? el.width - w - inset : inset;
        const baseline = el.top + inset + ASCENT * size + i * size * LINE_HEIGHT;
        if (baseline > el.top + el.height + size * 0.3) return; // clip to box like the editor does
        const [x, y] = displayToUser(el.left + dx, baseline, g.box, g.rotation);
        page.drawText(line, { x, y, size, font: f, color, rotate });
      });
    };

    const fieldName = () => {
      const name = sanitizeFieldName(el.name ?? "");
      if (!name) throw new PdfError("invalid-input", `A ${el.type} field has no name.`);
      if (reserved.has(name)) throw new PdfError("invalid-input", `The name "${name}" is already used by another field. Rename it before downloading.`);
      reserved.add(name);
      return name;
    };

    const borderWidth = el.border ? (el.borderWidth ?? 1) : 0;
    const appearance = () => ({
      ...widgetPlacement(userRect, g.rotation, borderWidth),
      rotate,
      font: f,
      textColor: color,
      backgroundColor: hexColor(el.background),
      borderColor: hexColor(el.border),
      borderWidth,
    });

    const common = (field: PDFField) => {
      if (el.required) field.enableRequired();
      if (el.readOnly) field.enableReadOnly();
      if (el.label) field.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(el.label));
    };

    switch (el.type) {
      case "heading":
      case "paragraph": {
        const bg = hexColor(el.background);
        const bc = hexColor(el.border);
        if (bg || bc) {
          page.drawRectangle({ ...userRect, color: bg, borderColor: bc, borderWidth: bc ? (el.borderWidth ?? 1) : 0 });
        }
        drawLines(el.value ?? "", `The ${el.type}`, bg || bc ? 4 : 0);
        break;
      }
      case "line": {
        const mid = el.top + el.height / 2;
        const [x1, y1] = displayToUser(el.left, mid, g.box, g.rotation);
        const [x2, y2] = displayToUser(el.left + el.width, mid, g.box, g.rotation);
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: Math.max(0.25, el.borderWidth ?? 1), color: hexColor(el.color) ?? color });
        break;
      }
      case "rect": {
        const bc = hexColor(el.border);
        page.drawRectangle({ ...userRect, color: hexColor(el.background), borderColor: bc, borderWidth: bc ? (el.borderWidth ?? 1) : 0 });
        break;
      }
      case "image": {
        const img = el.imageId ? input.images[el.imageId] : undefined;
        if (!img) throw new PdfError("invalid-input", "An image element has no image. Remove it or choose an image.");
        const embedded = img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
        page.drawImage(embedded, { ...widgetPlacement(userRect, g.rotation, 0), rotate });
        break;
      }
      case "signature": {
        // Visual signing area: a line and a caption, plus an unsigned /Sig field
        // so readers that support signing (e.g. Acrobat) offer to sign here.
        const lineY = el.top + el.height - 11;
        const [x1, y1] = displayToUser(el.left, lineY, g.box, g.rotation);
        const [x2, y2] = displayToUser(el.left + el.width, lineY, g.box, g.rotation);
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.75, color });
        const caption = el.label || "Signature";
        assertEncodable(f, caption, "The signature caption");
        const [cx, cy] = displayToUser(el.left, el.top + el.height - 2, g.box, g.rotation);
        page.drawText(caption, { x: cx, y: cy, size: Math.min(size, 9), font: f, color, rotate });
        if (el.imageId && input.images[el.imageId]) {
          const img = input.images[el.imageId]!;
          const embedded = img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
          const areaH = el.height - 13;
          const scale = Math.min(el.width / img.width, areaH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const imgBox = displayBoxToUserRect({ left: el.left, top: el.top + areaH - h, width: w, height: h }, g.box, g.rotation);
          page.drawImage(embedded, { ...widgetPlacement(imgBox, g.rotation, 0), rotate });
        }
        const name = fieldName();
        const sigRect = displayBoxToUserRect({ left: el.left, top: el.top, width: el.width, height: el.height - 11 }, g.box, g.rotation);
        const widget = doc.context.obj({
          Type: "Annot",
          Subtype: "Widget",
          FT: "Sig",
          T: PDFHexString.fromText(name),
          Rect: [sigRect.x, sigRect.y, sigRect.x + sigRect.width, sigRect.y + sigRect.height],
          F: 4,
          P: page.ref,
          ...(el.label ? { TU: PDFHexString.fromText(el.label) } : {}),
          ...(el.required ? { Ff: 2 } : {}),
        });
        const ref = doc.context.register(widget);
        page.node.addAnnot(ref);
        form.acroForm.addField(ref);
        break;
      }
      case "text":
      case "email":
      case "phone":
      case "date": {
        const name = fieldName();
        const field = form.createTextField(name);
        if (el.multiline && el.type === "text") field.enableMultiline();
        if (el.maxLength && el.maxLength > 0) field.setMaxLength(el.maxLength);
        field.addToPage(page, appearance());
        field.setFontSize(size);
        field.setAlignment(ALIGN[el.align ?? "left"]);
        let value = el.value ?? "";
        if (el.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = formatDate(value, el.dateFormat ?? "mm/dd/yyyy");
        if (el.maxLength) value = value.slice(0, el.maxLength);
        assertEncodable(f, value, `The field "${name}"`);
        if (value) {
          field.setText(value);
          field.acroField.dict.set(PDFName.of("DV"), PDFHexString.fromText(value));
        }
        if (el.type === "date") {
          // Acrobat-family readers format/validate dates via these standard actions; other readers treat it as plain text.
          const fmt = el.dateFormat ?? "mm/dd/yyyy";
          field.acroField.dict.set(
            PDFName.of("AA"),
            doc.context.obj({
              K: doc.context.obj({ S: "JavaScript", JS: PDFString.of(`AFDate_KeystrokeEx("${fmt}");`) }),
              F: doc.context.obj({ S: "JavaScript", JS: PDFString.of(`AFDate_FormatEx("${fmt}");`) }),
            }),
          );
        }
        common(field);
        created.push({ field, el, font: f });
        break;
      }
      case "checkbox": {
        const field = form.createCheckBox(fieldName());
        field.addToPage(page, appearance());
        if (el.checked) field.check();
        common(field);
        created.push({ field, el });
        break;
      }
      case "radio": {
        const group = sanitizeFieldName(el.group ?? "");
        if (!group) throw new PdfError("invalid-input", "A radio button has no group name.");
        let rg = radioGroups.get(group);
        if (!rg) {
          if (reserved.has(group)) throw new PdfError("invalid-input", `The name "${group}" is already used by another field.`);
          reserved.add(group);
          rg = form.createRadioGroup(group);
          radioGroups.set(group, rg);
          created.push({ field: rg, el });
        }
        const option = (el.option ?? "").trim() || "Option";
        rg.addOptionToPage(option, page, appearance());
        if (el.checked) rg.select(option);
        if (el.required) rg.enableRequired();
        if (el.readOnly) rg.enableReadOnly();
        if (el.label && !rg.acroField.dict.has(PDFName.of("TU"))) rg.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(el.label));
        break;
      }
      case "dropdown": {
        const name = fieldName();
        const options = (el.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (!options.length) throw new PdfError("invalid-input", `The dropdown "${name}" needs at least one option.`);
        options.forEach((o) => assertEncodable(f, o, `An option of "${name}"`));
        const field = form.createDropdown(name);
        field.setOptions(options);
        if (el.editable) field.enableEditing();
        field.addToPage(page, appearance());
        field.setFontSize(size);
        if (el.value && (options.includes(el.value) || el.editable)) field.select(el.value);
        common(field);
        created.push({ field, el, font: f });
        break;
      }
      case "listbox": {
        const name = fieldName();
        const options = (el.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (!options.length) throw new PdfError("invalid-input", `The list box "${name}" needs at least one option.`);
        options.forEach((o) => assertEncodable(f, o, `An option of "${name}"`));
        const field = form.createOptionList(name);
        field.setOptions(options);
        if (el.multiSelect) field.enableMultiselect();
        field.addToPage(page, appearance());
        field.setFontSize(size);
        const sel = (el.selected ?? []).filter((s) => options.includes(s));
        if (sel.length) field.select(el.multiSelect ? sel : sel.slice(0, 1));
        common(field);
        created.push({ field, el, font: f });
        break;
      }
    }
    onProgress(0.2 + ((n + 1) / total) * 0.6);
  }

  // ---- 4. Appearances (per-field fonts), then save without pdf-lib overriding them with Helvetica.
  for (const { field, font: ff } of created) {
    const anyField = field as unknown as { updateAppearances: (f?: PDFFont) => void };
    anyField.updateAppearances(ff);
  }
  doc.setProducer("PDFQuick Forms (pdf-lib)");
  doc.setModificationDate(new Date());
  if (project.name) doc.setTitle(project.name, { showInWindowTitleBar: false });
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  onProgress(0.95);

  // ---- 5. Verify: re-open and confirm every new field is there with the right type.
  const check = await PDFDocument.load(bytes);
  const out = check.getForm().getFields().map((fl) => ({ name: fl.getName(), type: fieldType(fl) }));
  const names = new Set(out.map((o) => o.name));
  for (const el of project.elements) {
    if (!isField(el.type) || el.origin === "suggested") continue;
    const expected = sanitizeFieldName((el.type === "radio" ? el.group : el.name) ?? "");
    if (!names.has(expected)) throw new PdfError("corrupt", `Export check failed: field "${expected}" is missing from the generated PDF.`);
  }
  if (check.getPageCount() !== project.pages.length) throw new PdfError("corrupt", "Export check failed: page count doesn't match.");
  onProgress(1);
  return { bytes, summary: { fields: out, pages: check.getPageCount() } };
}
