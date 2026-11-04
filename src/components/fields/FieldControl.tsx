import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { formatDate, parseDate, type DateFormat, type FontFamily } from "../../lib/forms/model";

export const CSS_FONT: Record<FontFamily, string> = {
  helvetica: "Helvetica, Arial, sans-serif", // Arial is metric-compatible with the PDF's Helvetica
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
};

export type ControlKind = "text" | "multiline" | "email" | "phone" | "date" | "checkbox" | "radio" | "dropdown" | "listbox" | "signature";
export type ControlValue = string | boolean | string[];

export interface ControlProps {
  kind: ControlKind;
  label: string;
  value: ControlValue;
  onChange: (v: ControlValue) => void;
  /** CSS px per PDF point. */
  scale: number;
  fontSize?: number;
  font?: FontFamily;
  color?: string;
  background?: string | null;
  border?: string | null;
  borderWidth?: number;
  align?: "left" | "center" | "right";
  options?: string[];
  multiSelect?: boolean;
  dateFormat?: DateFormat;
  maxLength?: number;
  readOnly?: boolean;
  required?: boolean;
  invalid?: string | null;
  /** Radio: whether this option is the selected one. */
  radioChecked?: boolean;
  onFocus?: () => void;
  inputRef?: React.Ref<HTMLElement>;
  placeholder?: string;
  id?: string;
}

/**
 * A live HTML control that mirrors a PDF form field. Used in the editor
 * (design + preview) and in the Fill tool.
 */
export function FieldControl(p: ControlProps) {
  const s = p.scale;
  const fontSize = (p.fontSize ?? 11) * s;
  const style: CSSProperties = {
    fontSize: Math.max(6, fontSize),
    fontFamily: CSS_FONT[p.font ?? "helvetica"],
    color: p.color ?? "#000",
    background: p.background ?? "transparent",
    border: p.border ? `${Math.max(1, (p.borderWidth ?? 1) * s)}px solid ${p.border}` : "1px dashed rgb(148 163 184 / 0.6)",
    textAlign: p.align ?? "left",
    padding: `0 ${2 * s}px`,
    lineHeight: 1.15,
  };
  const common = {
    id: p.id,
    "aria-label": p.label,
    "aria-required": p.required || undefined,
    "aria-invalid": p.invalid ? true : undefined,
    onFocus: p.onFocus,
    disabled: p.readOnly,
  };
  const invalidRing = p.invalid ? "outline outline-2 outline-error" : "";
  const base = `block h-full w-full focus:outline-2 focus:outline-primary disabled:cursor-not-allowed ${invalidRing}`;

  switch (p.kind) {
    case "checkbox":
    case "radio": {
      const checked = p.kind === "checkbox" ? p.value === true : !!p.radioChecked;
      return (
        <button
          ref={p.inputRef as React.Ref<HTMLButtonElement>}
          type="button"
          role={p.kind}
          aria-checked={checked}
          {...common}
          onClick={() => !p.readOnly && p.onChange(p.kind === "checkbox" ? !checked : true)}
          // Hit area at least 24×24 px (WCAG 2.5.8) even when the box is drawn smaller.
          className="absolute left-1/2 top-1/2 flex min-h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none [&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-primary [&:focus-visible>span]:outline"
          style={{ width: "100%", height: "100%" }}
        >
          <span
            className={`flex h-full w-full items-center justify-center ${p.kind === "radio" ? "rounded-full" : ""} ${invalidRing}`}
            style={{ background: style.background, border: style.border, color: style.color, maxWidth: "100%" }}
          >
            {checked &&
              (p.kind === "checkbox" ? (
                <Check style={{ width: "85%", height: "85%" }} strokeWidth={3} aria-hidden />
              ) : (
                <span className="block rounded-full" style={{ width: "50%", height: "50%", background: p.color ?? "#000" }} aria-hidden />
              ))}
          </span>
        </button>
      );
    }
    case "dropdown":
      return (
        <select
          ref={p.inputRef as React.Ref<HTMLSelectElement>}
          {...common}
          value={typeof p.value === "string" ? p.value : ""}
          onChange={(e) => p.onChange(e.target.value)}
          className={`${base} appearance-auto`}
          style={style}
        >
          <option value="">{p.placeholder ?? ""}</option>
          {(p.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "listbox": {
      const sel = Array.isArray(p.value) ? p.value : [];
      return (
        <select
          ref={p.inputRef as React.Ref<HTMLSelectElement>}
          {...common}
          multiple
          value={sel}
          onChange={(e) => {
            const values = [...e.target.selectedOptions].map((o) => o.value);
            p.onChange(p.multiSelect ? values : values.slice(-1));
          }}
          className={`${base} overflow-auto`}
          style={{ ...style, padding: 0 }}
        >
          {(p.options ?? []).map((o) => (
            <option key={o} value={o} style={{ padding: `0 ${2 * s}px` }}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case "date": {
      const fmt = p.dateFormat ?? "mm/dd/yyyy";
      const str = typeof p.value === "string" ? p.value : "";
      return (
        <input
          ref={p.inputRef as React.Ref<HTMLInputElement>}
          type="date"
          {...common}
          value={parseDate(str, fmt) || (/^\d{4}-\d{2}-\d{2}$/.test(str) ? str : "")}
          onChange={(e) => p.onChange(e.target.value ? formatDate(e.target.value, fmt) : "")}
          className={base}
          style={style}
        />
      );
    }
    case "multiline":
      return (
        <textarea
          ref={p.inputRef as React.Ref<HTMLTextAreaElement>}
          {...common}
          value={typeof p.value === "string" ? p.value : ""}
          maxLength={p.maxLength}
          placeholder={p.placeholder}
          onChange={(e) => p.onChange(e.target.value)}
          className={`${base} resize-none`}
          style={style}
        />
      );
    case "signature":
      return (
        <div className="pointer-events-none flex h-full w-full flex-col justify-end" style={{ fontFamily: style.fontFamily, color: p.color ?? "#000" }}>
          <div className="border-b" style={{ borderColor: p.color ?? "#000", marginBottom: 2 * s }} />
          <span style={{ fontSize: Math.max(6, 9 * s) }}>{p.label || "Signature"}</span>
        </div>
      );
    default:
      return (
        <input
          ref={p.inputRef as React.Ref<HTMLInputElement>}
          type={p.kind === "email" ? "email" : p.kind === "phone" ? "tel" : "text"}
          inputMode={p.kind === "phone" ? "tel" : p.kind === "email" ? "email" : undefined}
          autoComplete="off"
          {...common}
          value={typeof p.value === "string" ? p.value : ""}
          maxLength={p.maxLength}
          placeholder={p.placeholder}
          onChange={(e) => p.onChange(e.target.value)}
          className={base}
          style={style}
        />
      );
  }
}
