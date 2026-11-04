/**
 * Layout DSL for form templates. Shared by the free templates (client bundle)
 * and the premium packs (server only — functions/, never imported by src/).
 */
import { PAGE_SIZES, newId, type El, type ElementType, type PageModel } from "./model";

export type TemplateCategory = "business" | "employment" | "housing" | "education" | "personal";

export interface Template {
  id: string;
  title: string;
  category: TemplateCategory;
  description: string;
  build: () => { pages: PageModel[]; elements: El[] };
}

const M = 54; // margin
const W = PAGE_SIZES.letter.width;
const H = PAGE_SIZES.letter.height;
const CONTENT = W - M * 2;

export class Builder {
  pages: PageModel[] = [];
  els: El[] = [];
  y = M;
  private pageId = "";
  private names = new Set<string>();

  constructor(title: string, intro?: string) {
    this.newPage();
    this.add("heading", { left: M, top: this.y, width: CONTENT, height: 28, value: title, fontSize: 20, bold: true });
    this.y += 32;
    if (intro) this.paragraph(intro);
    this.add("line", { left: M, top: this.y, width: CONTENT, height: 8, color: "#cbd5e1", borderWidth: 1 });
    this.y += 16;
  }

  private newPage() {
    this.pageId = newId("p");
    this.pages.push({ id: this.pageId, kind: "blank", width: W, height: H });
    this.y = M;
  }

  private ensure(h: number) {
    if (this.y + h > H - M) this.newPage();
  }

  private name(base: string) {
    let n = base;
    let i = 2;
    while (this.names.has(n)) n = `${base} ${i++}`;
    this.names.add(n);
    return n;
  }

  private add(type: ElementType, props: Partial<El>): El {
    const el: El = {
      id: newId(),
      type,
      pageId: this.pageId,
      left: 0,
      top: 0,
      width: 10,
      height: 10,
      origin: "user",
      font: "helvetica",
      fontSize: 10,
      color: "#000000",
      align: "left",
      ...(type === "text" || type === "email" || type === "phone" || type === "date" || type === "dropdown" || type === "listbox"
        ? { background: "#eef3ff", border: "#94a3b8", borderWidth: 1, required: false, readOnly: false, label: "" }
        : type === "checkbox" || type === "radio"
          ? { background: "#ffffff", border: "#64748b", borderWidth: 1, required: false, readOnly: false, label: "" }
          : { background: null, border: null }),
      ...props,
    };
    this.els.push(el);
    return el;
  }

  section(title: string) {
    this.ensure(40);
    this.y += 6;
    this.add("heading", { left: M, top: this.y, width: CONTENT, height: 18, value: title, fontSize: 12, bold: true, color: "#1d4ed8" });
    this.y += 22;
    return this;
  }

  paragraph(text: string, size = 9.5) {
    const lines = Math.ceil((text.length * size * 0.5) / CONTENT) + text.split("\n").length - 1;
    const h = Math.max(1, lines) * size * 1.2 + 4;
    this.ensure(h);
    this.add("paragraph", { left: M, top: this.y, width: CONTENT, height: h, value: text, fontSize: size, color: "#334155" });
    this.y += h + 6;
    return this;
  }

  /** Label on the left, field on the right. */
  field(label: string, type: ElementType = "text", opts: Partial<El> = {}) {
    const height = opts.height ?? (opts.multiline ? 54 : 20);
    this.ensure(height + 8);
    this.add("paragraph", { left: M, top: this.y + 4, width: 140, height: 14, value: label, fontSize: 10 });
    this.add(type, {
      left: M + 150,
      top: this.y,
      width: opts.width ?? CONTENT - 150,
      height,
      name: this.name(label.replace(/[:*]/g, "").trim()),
      ...(type === "date" ? { dateFormat: "mm/dd/yyyy" as const, width: opts.width ?? 120 } : {}),
      ...opts,
    });
    this.y += height + 8;
    return this;
  }

  /** Two label+field pairs side by side. */
  pair(a: [string, ElementType?], b: [string, ElementType?]) {
    this.ensure(28);
    const colW = CONTENT / 2 - 8;
    [a, b].forEach(([label, type = "text"], i) => {
      const left = M + i * (colW + 16);
      this.add("paragraph", { left, top: this.y + 4, width: 90, height: 14, value: label, fontSize: 10 });
      this.add(type, {
        left: left + 92,
        top: this.y,
        width: colW - 92,
        height: 20,
        name: this.name(label.replace(/[:*]/g, "").trim()),
        ...(type === "date" ? { dateFormat: "mm/dd/yyyy" as const } : {}),
      });
    });
    this.y += 28;
    return this;
  }

  checkboxes(items: string[], columns = 2, group = "") {
    const colW = CONTENT / columns;
    for (let i = 0; i < items.length; i += columns) {
      this.ensure(20);
      items.slice(i, i + columns).forEach((item, c) => {
        const left = M + c * colW;
        this.add("checkbox", { left, top: this.y + 1, width: 12, height: 12, name: this.name(group ? `${group} - ${item}` : item), checked: false });
        this.add("paragraph", { left: left + 18, top: this.y, width: colW - 22, height: 14, value: item, fontSize: 10 });
      });
      this.y += 20;
    }
    return this;
  }

  radios(label: string, options: string[]) {
    this.ensure(24);
    this.add("paragraph", { left: M, top: this.y + 1, width: 140, height: 14, value: label, fontSize: 10 });
    const group = this.name(label.replace(/[:*]/g, "").trim());
    let x = M + 150;
    for (const o of options) {
      const w = Math.min(140, o.length * 5.5 + 26);
      if (x + w > W - M) {
        this.y += 20;
        x = M + 150;
      }
      this.add("radio", { left: x, top: this.y + 1, width: 12, height: 12, group, option: o, checked: false });
      this.add("paragraph", { left: x + 17, top: this.y, width: w - 18, height: 14, value: o, fontSize: 10 });
      x += w;
    }
    this.y += 24;
    return this;
  }

  dropdown(label: string, options: string[]) {
    return this.field(label, "dropdown", { options, value: "", width: 200 });
  }

  signature(label = "Signature", withDate = true) {
    this.ensure(56);
    this.y += 10;
    this.add("signature", { left: M, top: this.y, width: 260, height: 40, name: this.name(label), label, background: null, border: null, borderWidth: 0, fontSize: 9 });
    if (withDate) {
      this.add("paragraph", { left: M + 300, top: this.y + 22, width: 40, height: 14, value: "Date", fontSize: 10 });
      this.add("date", { left: M + 340, top: this.y + 18, width: 120, height: 20, name: this.name(`${label} date`), dateFormat: "mm/dd/yyyy" });
    }
    this.y += 52;
    return this;
  }

  table(columns: string[], rows: number, prefix: string) {
    const colW = CONTENT / columns.length;
    this.ensure(18 + rows * 22);
    columns.forEach((c, i) => this.add("paragraph", { left: M + i * colW, top: this.y, width: colW - 4, height: 14, value: c, fontSize: 9.5, bold: true }));
    this.y += 16;
    for (let r = 1; r <= rows; r++) {
      this.ensure(22);
      columns.forEach((c, i) =>
        this.add("text", { left: M + i * colW, top: this.y, width: colW - 4, height: 18, fontSize: 9, name: this.name(`${prefix} ${r} ${c}`) }),
      );
      this.y += 22;
    }
    this.y += 4;
    return this;
  }

  done() {
    return { pages: this.pages, elements: this.els };
  }
}

export const t = (id: string, title: string, category: TemplateCategory, description: string, build: (b: Builder) => Builder, intro?: string): Template => ({
  id,
  title,
  category,
  description,
  build: () => build(new Builder(title, intro)).done(),
});

export const contact = (b: Builder) =>
  b.field("Full name").pair(["Phone", "phone"], ["Email", "email"]).field("Address").pair(["City"], ["Postal code"]);

