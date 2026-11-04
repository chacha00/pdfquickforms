import { useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PageBackground } from "../../components/canvas/PageBackground";
import { FieldControl } from "../../components/fields/FieldControl";
import { TYPE_LABEL, type El, type ElementType, type PageModel } from "../../lib/forms/model";
import type { Guides } from "../../lib/forms/snap";
import type { ExistingField, FieldValue } from "../../lib/pdf/forms/inspect";
import { ElementBox } from "./ElementBox";
import type { EditorApi, Tool } from "./useEditor";

export const TOOL_MIME = "application/x-pdfquick-tool";

export function PageFrame({
  api,
  page,
  index,
  total,
  scale,
  pdf,
  existing,
  focusId,
  onFocused,
  onPlaced,
}: {
  api: EditorApi;
  page: PageModel;
  index: number;
  total: number;
  scale: number;
  pdf: PDFDocumentProxy | null;
  existing: ExistingField[];
  focusId: string | null;
  onFocused: () => void;
  onPlaced: (el: El) => void;
}) {
  const { s, doc } = api;
  const [guides, setGuides] = useState<Guides | null>(null);
  const els = useMemo(() => doc.elements.filter((e) => e.pageId === page.id), [doc.elements, page.id]);
  const tool: Tool = s.tool;
  const design = s.mode === "design";
  const w = page.width * scale;
  const h = page.height * scale;

  function place(type: ElementType, clientX: number, clientY: number, rect: DOMRect) {
    const el = api.addElement(type, page.id, { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale });
    if (el) onPlaced(el);
  }

  return (
    <section aria-label={`Page ${index + 1} of ${total}`} className="mx-auto" style={{ width: w }} data-page-index={index}>
      <div className="relative bg-white shadow-lift ring-1 ring-slate-300" style={{ width: w, height: h }}>
        <PageBackground doc={page.kind === "pdf" ? pdf : null} index={page.kind === "pdf" ? page.index : null} width={w} height={h} />
        <div
          data-testid={`page-surface-${index + 1}`}
          className={`absolute inset-0 ${design && tool !== "select" ? "cursor-crosshair" : ""}`}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget || !design) return;
            if (tool === "select") return api.set({ selectedId: null });
            e.preventDefault(); // keep focus on the field we're about to create
            place(tool, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
          }}
          onDragOver={(e) => {
            if (design && e.dataTransfer.types.includes(TOOL_MIME)) e.preventDefault();
          }}
          onDrop={(e) => {
            const type = e.dataTransfer.getData(TOOL_MIME) as ElementType;
            if (!type || !design) return;
            e.preventDefault();
            place(type, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
          }}
        >
          {existing.flatMap((f) =>
            f.widgets
              .filter((wd) => page.kind === "pdf" && wd.page === page.index)
              .map((wd, wi) => {
                const value = (s.history.present.existingValues[f.name] ?? f.value) as FieldValue;
                const kind = f.type === "text" ? (f.multiline ? "multiline" : "text") : f.type === "checkbox" || f.type === "radio" || f.type === "dropdown" || f.type === "listbox" || f.type === "signature" ? f.type : null;
                return (
                  <div
                    key={`${f.name}-${wi}`}
                    data-testid="existing-field"
                    className="absolute"
                    style={{ left: wd.box.left * scale, top: wd.box.top * scale, width: wd.box.width * scale, height: wd.box.height * scale, zIndex: 5 }}
                  >
                    {kind ? (
                      <FieldControl
                        kind={kind}
                        label={`Existing field ${f.name}${wd.option ? `: ${wd.option}` : ""}`}
                        value={value}
                        radioChecked={f.type === "radio" ? value === wd.option : undefined}
                        onChange={(v) => api.setExistingValue(f.name, f.type === "radio" ? (wd.option ?? "") : v)}
                        scale={scale}
                        options={f.options}
                        multiSelect={f.multiSelect}
                        maxLength={f.maxLength}
                        readOnly={f.readOnly}
                        required={f.required}
                        background="rgb(255 251 235 / 0.85)"
                        border="#d97706"
                      />
                    ) : (
                      <div className="h-full w-full border border-dashed border-amber-600 bg-amber-50/70" title={`Existing ${f.type} field "${f.name}"`} />
                    )}
                    {design && wi === 0 && (
                      <span className="pointer-events-none absolute -top-4 left-0 whitespace-nowrap rounded bg-amber-600 px-1 text-[9px] font-bold uppercase leading-4 text-white">Existing</span>
                    )}
                  </div>
                );
              }),
          )}
          {els.map((el) => (
            <ElementBox
              key={el.id}
              el={el}
              scale={scale}
              page={page}
              others={els.filter((o) => o.id !== el.id)}
              mode={s.mode}
              selected={s.selectedId === el.id}
              grid={s.grid}
              images={s.images}
              autoFocus={focusId === el.id}
              onFocused={onFocused}
              previewValue={s.previewValues[el.type === "radio" ? `radio:${el.group}` : el.id]}
              onSelect={() => design && s.selectedId !== el.id && api.set({ selectedId: el.id })}
              onChange={(patch, key) => api.updateEl(el.id, patch, key)}
              onPreviewChange={(v) => api.set({ previewValues: { ...s.previewValues, [el.type === "radio" ? `radio:${el.group}` : el.id]: v } })}
              onRadioSelect={() => api.selectRadio(el.id)}
              onRemove={() => api.removeEl(el.id)}
              onGuides={setGuides}
            />
          ))}
          {guides?.x.map((x, i) => <div key={`gx${i}`} className="pointer-events-none absolute top-0 h-full w-px bg-fuchsia-500" style={{ left: x * scale }} />)}
          {guides?.y.map((y, i) => <div key={`gy${i}`} className="pointer-events-none absolute left-0 h-px w-full bg-fuchsia-500" style={{ top: y * scale }} />)}
        </div>
      </div>
      {design && tool !== "select" && (
        <p className="sr-only" aria-live="polite">
          Click on page {index + 1} to place the {TYPE_LABEL[tool].toLowerCase()}.
        </p>
      )}
    </section>
  );
}
