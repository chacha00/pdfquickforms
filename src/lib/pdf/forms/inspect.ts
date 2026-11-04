/**
 * Read the interactive form fields that already exist in a PDF (Stage 1 of
 * field detection) and fill them (the "Fill a PDF" tool).
 */
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  PDFButton,
  PDFName,
  type PDFField,
} from "pdf-lib";
import { PdfError, loadPdf } from "../engine";
import { userRectToDisplayBox, type DisplayBox } from "../../coordinates/geometry";
import { fontCache, pageGeometry } from "./shared";

export type ExistingFieldType = "text" | "checkbox" | "radio" | "dropdown" | "listbox" | "signature" | "button" | "unknown";
export type FieldValue = string | boolean | string[];

export interface ExistingWidget {
  page: number;
  box: DisplayBox;
  /** Radio: export value this widget selects. */
  option?: string;
}

export interface ExistingField {
  name: string;
  type: ExistingFieldType;
  readOnly: boolean;
  required: boolean;
  multiline?: boolean;
  maxLength?: number;
  options?: string[];
  multiSelect?: boolean;
  editable?: boolean;
  value: FieldValue;
  widgets: ExistingWidget[];
  /** Signature field that already holds a signature. */
  signed?: boolean;
}

export interface PdfInspection {
  pages: { width: number; height: number }[];
  fields: ExistingField[];
  warnings: string[];
}

export function fieldType(f: PDFField): ExistingFieldType {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "listbox";
  if (f instanceof PDFSignature) return "signature";
  if (f instanceof PDFButton) return "button";
  return "unknown";
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const geo = pages.map(pageGeometry);
  const refToIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  const form = doc.getForm();
  const warnings: string[] = [];
  if (form.hasXFA()) {
    warnings.push(
      "This PDF contains an XFA (dynamic) form. PDFQuick Forms works with standard PDF form fields; when you download, the XFA layer is removed so every PDF reader shows the same fields.",
    );
  }

  const fields: ExistingField[] = [];
  let signed = 0;
  for (const f of form.getFields()) {
    const type = fieldType(f);
    const acro = f.acroField;
    const widgets: ExistingWidget[] = [];
    const radioOptions = f instanceof PDFRadioGroup ? f.getOptions() : [];
    acro.getWidgets().forEach((w, wi) => {
      const pageRef = w.P();
      let pageIndex = pageRef ? refToIndex.get(pageRef.toString()) : undefined;
      if (pageIndex === undefined) {
        // Some writers omit /P: find the page whose /Annots holds this widget.
        pageIndex = pages.findIndex((p) => p.node.Annots()?.asArray().some((a) => a.toString() === doc.context.getObjectRef(w.dict)?.toString()));
      }
      if (pageIndex === undefined || pageIndex < 0) return;
      const g = geo[pageIndex]!;
      const rect = w.getRectangle();
      // With /Opt, on-values are indexes ("0", "1"…) and labels live in Opt (widget order).
      const option = f instanceof PDFRadioGroup ? (radioOptions[wi] ?? w.getOnValue()?.decodeText()) : undefined;
      widgets.push({ page: pageIndex, box: userRectToDisplayBox(rect, g.box, g.rotation), ...(option !== undefined ? { option } : {}) });
    });

    let value: FieldValue = "";
    const extra: Partial<ExistingField> = {};
    if (f instanceof PDFTextField) {
      value = f.getText() ?? "";
      extra.multiline = f.isMultiline();
      const max = f.getMaxLength();
      if (max !== undefined) extra.maxLength = max;
    } else if (f instanceof PDFCheckBox) value = f.isChecked();
    else if (f instanceof PDFRadioGroup) {
      value = f.getSelected() ?? "";
      extra.options = radioOptions;
    } else if (f instanceof PDFDropdown) {
      value = f.getSelected()[0] ?? "";
      extra.options = f.getOptions();
      extra.editable = f.isEditable();
    } else if (f instanceof PDFOptionList) {
      value = f.getSelected();
      extra.options = f.getOptions();
      extra.multiSelect = f.isMultiselect();
    } else if (f instanceof PDFSignature) {
      extra.signed = acro.dict.has(PDFName.of("V"));
      if (extra.signed) signed++;
    }
    fields.push({ name: f.getName(), type, readOnly: f.isReadOnly(), required: f.isRequired(), value, widgets, ...extra });
  }
  if (signed > 0) {
    warnings.push(
      `This PDF contains ${signed === 1 ? "a digital signature" : `${signed} digital signatures`}. Any change, including filling fields, will invalidate ${signed === 1 ? "it" : "them"}.`,
    );
  }
  return { pages: geo.map((g) => g.display), fields, warnings };
}

/** Apply values to existing fields. Read-only fields and unknown names are left untouched. */
export async function applyExistingValues(doc: PDFDocument, values: Record<string, FieldValue>): Promise<string[]> {
  const form = doc.getForm();
  const font = await fontCache(doc)("helvetica");
  const changed: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f || f.isReadOnly()) continue;
    try {
      if (f instanceof PDFTextField && typeof value === "string") {
        const max = f.getMaxLength();
        f.setText(max !== undefined ? value.slice(0, max) : value);
        f.updateAppearances(font);
      } else if (f instanceof PDFCheckBox) {
        if (value === true) f.check();
        else f.uncheck();
      } else if (f instanceof PDFRadioGroup && typeof value === "string") {
        if (value) f.select(value);
        else f.clear();
      } else if (f instanceof PDFDropdown && typeof value === "string") {
        if (value) f.select(value);
        else f.clear();
        f.updateAppearances(font);
      } else if (f instanceof PDFOptionList && Array.isArray(value)) {
        if (value.length) f.select(value);
        else f.clear();
        f.updateAppearances(font);
      } else continue;
      changed.push(name);
    } catch (e) {
      throw new PdfError("invalid-input", `The value for "${name}" couldn't be saved: ${(e as Error).message}`);
    }
  }
  return changed;
}

export async function fillPdf(bytes: Uint8Array, values: Record<string, FieldValue>, opts: { flatten: boolean }): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const form = doc.getForm();
  if (form.hasXFA()) form.deleteXFA();
  await applyExistingValues(doc, values);
  if (opts.flatten) {
    try {
      form.flatten({ updateFieldAppearances: false });
    } catch {
      throw new PdfError("invalid-input", "This form couldn't be flattened (some fields have no printable appearance). Download the editable version instead.");
    }
  }
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true, updateFieldAppearances: false });
}
