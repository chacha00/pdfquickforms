/**
 * PDFQuick Forms document model. Everything the editor shows is described by a
 * `Project`; the export engine turns a Project (+ optional source PDF bytes)
 * into a PDF with genuine AcroForm fields.
 *
 * Coordinates are "display space": PDF points, origin at the page's top-left
 * as the user sees it (page /Rotate already applied). See lib/coordinates.
 */

export type FieldType = "text" | "checkbox" | "radio" | "dropdown" | "listbox" | "date" | "email" | "phone" | "signature";
export type LayoutType = "heading" | "paragraph" | "line" | "rect" | "image";
export type ElementType = FieldType | LayoutType;
export type FontFamily = "helvetica" | "times" | "courier";
export type Align = "left" | "center" | "right";
export type DateFormat = "mm/dd/yyyy" | "dd/mm/yyyy" | "yyyy-mm-dd";

export const FIELD_TYPES: FieldType[] = ["text", "checkbox", "radio", "dropdown", "listbox", "date", "email", "phone", "signature"];
export const LAYOUT_TYPES: LayoutType[] = ["heading", "paragraph", "line", "rect", "image"];

export const TYPE_LABEL: Record<ElementType, string> = {
  text: "Text field",
  checkbox: "Checkbox",
  radio: "Radio button",
  dropdown: "Dropdown",
  listbox: "List box",
  date: "Date",
  email: "Email",
  phone: "Phone",
  signature: "Signature area",
  heading: "Heading",
  paragraph: "Paragraph",
  line: "Divider",
  rect: "Rectangle",
  image: "Image",
};

export function isField(t: ElementType): t is FieldType {
  return (FIELD_TYPES as string[]).includes(t);
}

export interface El {
  id: string;
  type: ElementType;
  pageId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** "suggested" = proposed by Auto-Detect and not yet accepted. */
  origin?: "user" | "suggested";

  // ---- field properties
  name?: string;
  /** Tooltip / accessible name shown by PDF readers (/TU). */
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  /** Default value: text-like fields, dropdown selection. */
  value?: string;
  /** Checkbox state; for a radio option: whether it is the selected one. */
  checked?: boolean;
  /** Radio: group (field) name and this option's export value. */
  group?: string;
  option?: string;
  /** Dropdown / list box choices. */
  options?: string[];
  /** List box selection. */
  selected?: string[];
  multiSelect?: boolean;
  /** Dropdown accepts typed custom values. */
  editable?: boolean;
  multiline?: boolean;
  maxLength?: number;
  align?: Align;
  dateFormat?: DateFormat;

  // ---- appearance (fields and layout)
  font?: FontFamily;
  bold?: boolean;
  fontSize?: number;
  color?: string;
  background?: string | null;
  border?: string | null;
  borderWidth?: number;
  /** Image element / drawn-or-typed signature appearance. */
  imageId?: string;
}

export type PageModel =
  | { id: string; kind: "pdf"; index: number; width: number; height: number }
  | { id: string; kind: "blank"; width: number; height: number };

export interface ProjectImage {
  kind: "png" | "jpeg";
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  pages: PageModel[];
  elements: El[];
  /** Values typed into fields that already existed in the uploaded PDF, by field name. */
  existingValues: Record<string, string | boolean | string[]>;
}

// ---------------------------------------------------------------- sizes

export const PAGE_SIZES = {
  letter: { label: "US Letter", width: 612, height: 792 },
  a4: { label: "A4", width: 595.28, height: 841.89 },
  legal: { label: "Legal", width: 612, height: 1008 },
} as const;
export type PageSizeId = keyof typeof PAGE_SIZES;

/** PDF limits: 3..14400 pt per side. */
export function validPageDimension(n: number): boolean {
  return Number.isFinite(n) && n >= 72 && n <= 14400;
}

// ---------------------------------------------------------------- ids & names

let seq = 0;
export function newId(prefix = "e"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

const NAME_BASE: Partial<Record<ElementType, string>> = {
  text: "Text",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  listbox: "List",
  date: "Date",
  email: "Email",
  phone: "Phone",
  signature: "Signature",
};

/** All field names in use (radio uses its group name). */
export function usedNames(elements: El[], reserved: Iterable<string> = []): Set<string> {
  const s = new Set(reserved);
  for (const e of elements) {
    if (e.type === "radio" && e.group) s.add(e.group);
    else if (isField(e.type) && e.name) s.add(e.name);
  }
  return s;
}

export function uniqueName(base: string, used: Set<string>): string {
  const clean = sanitizeFieldName(base) || "Field";
  if (!used.has(clean)) return clean;
  // "Text 1" -> "Text 2", "Name" -> "Name 2"
  const m = /^(.*?)\s(\d+)$/.exec(clean);
  const stem = m ? m[1]! : clean;
  let n = m ? Number(m[2]) + 1 : 2;
  while (used.has(`${stem} ${n}`)) n++;
  return `${stem} ${n}`;
}

export function nextName(type: ElementType, elements: El[], reserved: Iterable<string> = []): string {
  const base = NAME_BASE[type] ?? "Field";
  const used = usedNames(elements, reserved);
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** "." means hierarchy in PDF field names; control chars are invalid. */
export function sanitizeFieldName(name: string): string {
  return name.replace(/\./g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
}

// ---------------------------------------------------------------- element factory

export function createElement(
  type: ElementType,
  pageId: string,
  at: { x: number; y: number },
  ctx: { elements: El[]; reserved?: Iterable<string> },
): El {
  const base = { id: newId(), type, pageId, origin: "user" as const };
  const field = isField(type) ? { name: nextName(type, ctx.elements, ctx.reserved), required: false, readOnly: false, label: "" } : {};
  const text = { font: "helvetica" as FontFamily, fontSize: 11, color: "#000000", align: "left" as Align };
  const boxed = { background: "#eef3ff", border: "#94a3b8", borderWidth: 1 };
  const place = (w: number, h: number) => ({ left: at.x, top: at.y - h / 2, width: w, height: h });

  switch (type) {
    case "text":
    case "email":
    case "phone":
      return { ...base, ...field, ...text, ...boxed, ...place(200, 22), value: "", multiline: false };
    case "date":
      return { ...base, ...field, ...text, ...boxed, ...place(110, 22), value: "", dateFormat: "mm/dd/yyyy" };
    case "checkbox":
      return { ...base, ...field, ...boxed, ...place(14, 14), checked: false, color: "#000000" };
    case "radio": {
      const used = usedNames(ctx.elements, ctx.reserved);
      let n = 1;
      while (used.has(`Choice ${n}`)) n++;
      return { ...base, ...field, ...boxed, ...place(14, 14), name: undefined, group: `Choice ${n}`, option: "Option 1", checked: false, color: "#000000" };
    }
    case "dropdown":
      return { ...base, ...field, ...text, ...boxed, ...place(160, 22), options: ["Option 1", "Option 2", "Option 3"], value: "", editable: false };
    case "listbox":
      return { ...base, ...field, ...text, ...boxed, ...place(160, 60), options: ["Option 1", "Option 2", "Option 3"], selected: [], multiSelect: false };
    case "signature":
      return { ...base, ...field, ...place(200, 40), background: null, border: null, borderWidth: 0, color: "#000000", fontSize: 9, font: "helvetica" };
    case "heading":
      return { ...base, ...text, ...place(300, 26), fontSize: 20, bold: true, value: "Heading", background: null, border: null };
    case "paragraph":
      return { ...base, ...text, ...place(320, 48), fontSize: 11, value: "Instructions or other text.", background: null, border: null };
    case "line":
      return { ...base, ...place(300, 8), color: "#94a3b8", borderWidth: 1 };
    case "rect":
      return { ...base, ...place(200, 80), background: null, border: "#94a3b8", borderWidth: 1 };
    case "image":
      return { ...base, ...place(120, 60) };
  }
}

// ---------------------------------------------------------------- validation

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "");
}

export function isValidPhone(v: string): boolean {
  const d = phoneDigits(v);
  return d.length >= 7 && d.length <= 15 && /^[+(\d][\d\s().-]*$/.test(v.trim());
}

/** Format an ISO date (yyyy-mm-dd from <input type=date>) for the PDF. */
export function formatDate(iso: string, fmt: DateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return fmt === "mm/dd/yyyy" ? `${mo}/${d}/${y}` : fmt === "dd/mm/yyyy" ? `${d}/${mo}/${y}` : `${y}-${mo}-${d}`;
}

/** Parse a stored date value back to ISO for the date input. */
export function parseDate(value: string, fmt: DateFormat): string {
  const parts = value.split(/[/-]/);
  if (parts.length !== 3) return "";
  const [a, b, c] = parts as [string, string, string];
  const [y, mo, d] = fmt === "mm/dd/yyyy" ? [c, a, b] : fmt === "dd/mm/yyyy" ? [c, b, a] : [a, b, c];
  const iso = `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? "" : iso;
}

/** Validate a filled-in value the way the web editor does (PDF readers may not). */
export function validateValue(el: El, value: string | boolean | string[] | undefined): string | null {
  const empty = value === undefined || value === "" || value === false || (Array.isArray(value) && value.length === 0);
  if (el.required && empty) return "This field is required.";
  if (empty || typeof value !== "string") return null;
  if (el.type === "email" && !isValidEmail(value)) return "Enter a valid email address.";
  if (el.type === "phone" && !isValidPhone(value)) return "Enter a valid phone number.";
  if (el.type === "date" && el.dateFormat && !parseDate(value, el.dateFormat)) return `Use the format ${el.dateFormat.toUpperCase()}.`;
  if (el.maxLength && value.length > el.maxLength) return `Use at most ${el.maxLength} characters.`;
  return null;
}

export interface ProjectIssue {
  elementId?: string;
  message: string;
}

/** Structural checks before export (names, options, sizes). */
export function projectIssues(p: Project, reservedNames: Iterable<string> = []): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const reserved = new Set(reservedNames);
  const seen = new Map<string, string>();
  const pageIds = new Set(p.pages.map((pg) => pg.id));
  for (const e of p.elements) {
    if (!pageIds.has(e.pageId)) issues.push({ elementId: e.id, message: `${TYPE_LABEL[e.type]} is on a page that no longer exists.` });
    if (e.width <= 0 || e.height <= 0) issues.push({ elementId: e.id, message: `${TYPE_LABEL[e.type]} has no size.` });
    if (!isField(e.type)) continue;
    const name = e.type === "radio" ? e.group : e.name;
    if (!name || !sanitizeFieldName(name)) {
      issues.push({ elementId: e.id, message: `A ${TYPE_LABEL[e.type].toLowerCase()} needs a name.` });
      continue;
    }
    if (reserved.has(name)) issues.push({ elementId: e.id, message: `"${name}" is already used by a field in the original PDF.` });
    const key = e.type === "radio" ? `radio:${name}` : `field:${e.id}`;
    const prev = seen.get(name);
    if (prev && prev !== key) issues.push({ elementId: e.id, message: `Two fields are named "${name}". Field names must be unique (radio buttons share their group name).` });
    else seen.set(name, key);
    if ((e.type === "dropdown" || e.type === "listbox") && !(e.options ?? []).some((o) => o.trim())) {
      issues.push({ elementId: e.id, message: `"${name}" needs at least one option.` });
    }
  }
  // Radio option values must be unique within a group.
  const groups = new Map<string, Set<string>>();
  for (const e of p.elements.filter((x) => x.type === "radio")) {
    const set = groups.get(e.group!) ?? new Set<string>();
    if (set.has(e.option ?? "")) issues.push({ elementId: e.id, message: `Radio group "${e.group}" has two options called "${e.option}".` });
    set.add(e.option ?? "");
    groups.set(e.group!, set);
  }
  return issues;
}
