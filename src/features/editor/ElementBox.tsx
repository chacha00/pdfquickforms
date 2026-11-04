import { useEffect, useLayoutEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { Move, Sparkles } from "lucide-react";
import { FieldControl, CSS_FONT, type ControlKind } from "../../components/fields/FieldControl";
import { TYPE_LABEL, isField, validateValue, type El } from "../../lib/forms/model";
import { snapMove, snapResize, type Guides } from "../../lib/forms/snap";
import type { DisplayBox } from "../../lib/coordinates/geometry";
import type { FieldValue } from "../../lib/pdf/forms/inspect";
import type { Mode } from "./useEditor";

export function controlKind(el: El): ControlKind | null {
  switch (el.type) {
    case "text":
      return el.multiline ? "multiline" : "text";
    case "email":
    case "phone":
    case "date":
    case "checkbox":
    case "radio":
    case "dropdown":
    case "listbox":
    case "signature":
      return el.type;
    default:
      return null;
  }
}

export function elementLabel(el: El): string {
  if (el.type === "radio") return `${TYPE_LABEL.radio} "${el.option}" in group "${el.group}"`;
  if (isField(el.type)) return `${TYPE_LABEL[el.type]} "${el.name}"`;
  if (el.type === "heading" || el.type === "paragraph") return `${TYPE_LABEL[el.type]} "${(el.value ?? "").slice(0, 30)}"`;
  return TYPE_LABEL[el.type];
}

/** Design value of an element (its default) as a control value. */
export function designValue(el: El): FieldValue {
  if (el.type === "checkbox") return !!el.checked;
  if (el.type === "listbox") return el.selected ?? [];
  return el.value ?? "";
}

interface Props {
  el: El;
  scale: number;
  page: { width: number; height: number };
  others: DisplayBox[];
  mode: Mode;
  selected: boolean;
  grid: boolean;
  images: Record<string, { bytes: Uint8Array; kind: string }>;
  autoFocus: boolean;
  previewValue: FieldValue | undefined;
  onSelect: () => void;
  onChange: (patch: Partial<El>, coalesce?: string) => void;
  onPreviewChange: (v: FieldValue) => void;
  onRadioSelect: () => void;
  onRemove: () => void;
  onGuides: (g: Guides | null) => void;
  onFocused: () => void;
}

const MIN: Record<string, { width: number; height: number }> = { checkbox: { width: 8, height: 8 }, radio: { width: 8, height: 8 }, line: { width: 20, height: 4 } };

export function ElementBox(p: Props) {
  const { el, scale: s } = p;
  const inputRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; box: DisplayBox; mode: "move" | "resize" } | null>(null);
  const design = p.mode === "design";
  const label = elementLabel(el);
  const kind = controlKind(el);

  // Focus a newly placed field synchronously after it renders, so keys typed right away land in it.
  // (The placing pointerdown calls preventDefault, so the browser won't move focus afterwards.)
  useLayoutEffect(() => {
    if (!p.autoFocus) return;
    inputRef.current?.focus();
    p.onFocused();
  }, [p.autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(e: RPointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, box: { left: el.left, top: el.top, width: el.width, height: el.height }, mode };
    p.onSelect();
  }
  function move(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / s;
    const dy = (e.clientY - d.y) / s;
    const opts = { grid: p.grid ? 6 : null, threshold: 5 / Math.max(0.5, s) };
    if (d.mode === "move") {
      const r = snapMove({ ...d.box, left: d.box.left + dx, top: d.box.top + dy }, p.others, p.page, opts);
      p.onGuides(r.guides.x.length || r.guides.y.length ? r.guides : null);
      p.onChange({ left: r.box.left, top: r.box.top }, `drag:${el.id}`);
    } else {
      const square = el.type === "checkbox" || el.type === "radio";
      const min = MIN[el.type] ?? { width: 20, height: 10 };
      const r = snapResize({ ...d.box, width: d.box.width + dx, height: d.box.height + dy }, p.others, p.page, opts, min);
      let { width, height } = r.box;
      if (square) width = height = Math.max(width, height);
      if (el.type === "line") height = d.box.height;
      p.onGuides(r.guides.x.length || r.guides.y.length ? r.guides : null);
      p.onChange({ width, height }, `resize:${el.id}`);
    }
  }
  function end() {
    drag.current = null;
    p.onGuides(null);
  }

  const value: FieldValue = design ? designValue(el) : (p.previewValue ?? designValue(el));
  const error = !design && isField(el.type) ? validateValue(el, value) : null;

  const setValue = (v: FieldValue) => {
    if (!design) return p.onPreviewChange(v);
    if (el.type === "checkbox") p.onChange({ checked: v === true });
    else if (el.type === "listbox") p.onChange({ selected: v as string[] });
    else p.onChange({ value: v as string }, `value:${el.id}`);
  };

  let content: React.ReactNode = null;
  if (kind) {
    content = (
      <FieldControl
        kind={kind}
        label={el.type === "radio" ? `${el.group}: ${el.option}` : (el.label || el.name || TYPE_LABEL[el.type])}
        value={value}
        radioChecked={el.type === "radio" ? (design ? !!el.checked : p.previewValue !== undefined ? p.previewValue === el.option : !!el.checked) : undefined}
        onChange={(v) => {
          if (el.type === "radio") {
            if (design) p.onRadioSelect();
            else p.onPreviewChange(el.option ?? "");
          } else setValue(v);
        }}
        scale={s}
        fontSize={el.fontSize}
        font={el.font}
        color={el.color}
        background={el.background}
        border={el.border}
        borderWidth={el.borderWidth}
        align={el.align}
        options={el.options}
        multiSelect={el.multiSelect}
        dateFormat={el.dateFormat}
        maxLength={el.maxLength}
        readOnly={!design && el.readOnly}
        required={el.required}
        invalid={error}
        onFocus={p.onSelect}
        inputRef={inputRef}
        placeholder={design && s > 0.7 ? (el.type === "dropdown" ? "Choose…" : el.type === "email" ? "name@example.com" : el.type === "phone" ? "(555) 555-0100" : "") : ""}
      />
    );
    if (el.type === "signature" && el.imageId && p.images[el.imageId]) content = <SignaturePreview el={el} scale={s} img={p.images[el.imageId]!} />;
  } else if (el.type === "heading" || el.type === "paragraph") {
    const style = {
      fontFamily: CSS_FONT[el.font ?? "helvetica"],
      fontSize: Math.max(5, (el.fontSize ?? 11) * s),
      fontWeight: el.bold ? 700 : 400,
      color: el.color ?? "#000",
      textAlign: el.align ?? "left",
      lineHeight: 1.2,
      background: el.background ?? "transparent",
      border: el.border ? `${Math.max(1, (el.borderWidth ?? 1) * s)}px solid ${el.border}` : undefined,
      padding: el.background || el.border ? 4 * s : 0,
    } as const;
    content = design ? (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        aria-label={`${TYPE_LABEL[el.type]} text`}
        value={el.value ?? ""}
        onFocus={p.onSelect}
        onChange={(e) => p.onChange({ value: e.target.value }, `value:${el.id}`)}
        className="block h-full w-full resize-none overflow-hidden bg-transparent focus:outline-none"
        style={style}
      />
    ) : (
      <div className="h-full w-full overflow-hidden whitespace-pre-wrap" style={style}>
        {el.value}
      </div>
    );
  } else if (el.type === "line") {
    content = <div className="absolute inset-x-0 top-1/2" style={{ borderTop: `${Math.max(1, (el.borderWidth ?? 1) * s)}px solid ${el.color ?? "#94a3b8"}` }} />;
  } else if (el.type === "rect") {
    content = <div className="h-full w-full" style={{ background: el.background ?? "transparent", border: el.border ? `${Math.max(1, (el.borderWidth ?? 1) * s)}px solid ${el.border}` : "1px dashed #cbd5e1" }} />;
  } else if (el.type === "image") {
    content = el.imageId && p.images[el.imageId] ? <ImagePreview img={p.images[el.imageId]!} /> : <div className="flex h-full w-full items-center justify-center border border-dashed border-slate-400 bg-slate-50 text-xs text-muted-strong">Choose an image</div>;
  }

  const suggested = el.origin === "suggested";
  const focusableDecor = design && (el.type === "line" || el.type === "rect" || el.type === "image" || el.type === "signature");

  return (
    <div
      data-testid="form-element"
      data-type={el.type}
      data-id={el.id}
      className={`absolute ${design && p.selected ? "outline-2 outline-offset-2 outline-primary outline" : ""} ${suggested ? "outline-2 outline-dashed outline-amber-500 outline" : ""}`}
      style={{ left: el.left * s, top: el.top * s, width: el.width * s, height: el.height * s, zIndex: p.selected ? 30 : 10 }}
      title={error ?? undefined}
    >
      {focusableDecor ? (
        <button
          ref={inputRef as React.Ref<HTMLButtonElement>}
          type="button"
          aria-label={`${label}. Press Enter to select.`}
          className="block h-full w-full text-left focus:outline-none"
          onFocus={p.onSelect}
          onPointerDown={(e) => start(e, "move")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {suggested && design && (
        <span className="pointer-events-none absolute -top-5 right-0 flex items-center gap-1 rounded bg-amber-500 px-1.5 text-[10px] font-bold uppercase text-white">
          <Sparkles className="h-3 w-3" aria-hidden /> Suggested
        </span>
      )}
      {error && <span className="sr-only">{error}</span>}
      {design && p.selected && (
        <>
          <button
            type="button"
            aria-label={`Move ${label}. Arrow keys move it (Shift for 10 points), Delete removes it.`}
            title="Drag to move"
            className="absolute -top-10 left-0 flex h-7 cursor-move touch-none items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-white shadow"
            onPointerDown={(e) => start(e, "move")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              const m = moves[e.key];
              if (m) {
                e.preventDefault();
                p.onChange({ left: el.left + m[0], top: el.top + m[1] }, `kbd:${el.id}`);
              } else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                p.onRemove();
              }
            }}
          >
            <Move className="h-3.5 w-3.5" aria-hidden /> Move
          </button>
          <span
            aria-hidden
            title="Drag to resize"
            className="absolute -bottom-4 -right-4 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-primary shadow"
            onPointerDown={(e) => start(e, "resize")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </>
      )}
    </div>
  );
}

function useObjectUrl(img: { bytes: Uint8Array; kind: string }) {
  const ref = useRef<{ img: typeof img; url: string } | null>(null);
  if (!ref.current || ref.current.img !== img) {
    if (ref.current) URL.revokeObjectURL(ref.current.url);
    ref.current = { img, url: URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: img.kind === "png" ? "image/png" : "image/jpeg" })) };
  }
  useEffect(
    () => () => {
      if (ref.current) URL.revokeObjectURL(ref.current.url);
    },
    [],
  );
  return ref.current.url;
}

function ImagePreview({ img }: { img: { bytes: Uint8Array; kind: string } }) {
  const url = useObjectUrl(img);
  return <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full object-fill" />;
}

function SignaturePreview({ el, scale: s, img }: { el: El; scale: number; img: { bytes: Uint8Array; kind: string } }) {
  const url = useObjectUrl(img);
  return (
    <div className="pointer-events-none flex h-full w-full flex-col justify-end" style={{ color: el.color ?? "#000" }}>
      <img src={url} alt="" className="min-h-0 flex-1 object-contain object-left-bottom" />
      <div className="border-b" style={{ borderColor: el.color ?? "#000", marginBottom: 2 * s }} />
      <span style={{ fontSize: Math.max(6, 9 * s), fontFamily: CSS_FONT.helvetica }}>{el.label || "Signature"}</span>
    </div>
  );
}
