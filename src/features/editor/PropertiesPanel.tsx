import { useId, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpToLine, Check, Copy, PenLine, Plus, Trash2, X } from "lucide-react";
import { Button, inputClass } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/Modal";
import { TYPE_LABEL, isField, sanitizeFieldName, usedNames, type DateFormat, type El, type FontFamily } from "../../lib/forms/model";
import { SignaturePad } from "./SignaturePad";
import { pickImage } from "./pickImage";
import type { EditorApi } from "./useEditor";

function Row({ label, children, htmlFor, hint }: { label: string; children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-strong">{hint}</p>}
    </div>
  );
}

const small = `${inputClass} !h-9 !text-sm`;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ColorRow({ label, value, onChange, allowNone }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {allowNone && (
          <label className="flex items-center gap-1 text-xs text-muted-strong">
            <input type="checkbox" className="accent-primary" checked={!value} onChange={(e) => onChange(e.target.checked ? null : "#000000")} /> None
          </label>
        )}
        <input id={id} type="color" value={value ?? "#ffffff"} disabled={!value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line disabled:opacity-40" />
      </div>
    </div>
  );
}

export function PropertiesPanel({ api, el }: { api: EditorApi; el: El }) {
  const [sigOpen, setSigOpen] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const u = (patch: Partial<El>, key?: string) => api.updateEl(el.id, patch, key);
  const field = isField(el.type);
  const textLike = ["text", "email", "phone", "date", "dropdown", "listbox"].includes(el.type);
  const typography = textLike || el.type === "heading" || el.type === "paragraph";
  const names = usedNames(api.doc.elements.filter((e) => e.id !== el.id), api.reservedNames);
  const nameValue = el.type === "radio" ? el.group ?? "" : el.name ?? "";
  const nameClash = field && nameValue && el.type !== "radio" && names.has(sanitizeFieldName(nameValue));
  const groupSize = el.type === "radio" ? api.doc.elements.filter((e) => e.type === "radio" && e.group === el.group).length : 0;

  return (
    <div className="space-y-4" data-testid="properties">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">{TYPE_LABEL[el.type]}</h2>
        {el.origin === "suggested" && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Suggested</span>}
      </div>

      {el.origin === "suggested" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => api.acceptSuggestion(el.id)}>
            <Check className="h-4 w-4" aria-hidden /> Accept
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => api.discardSuggestion(el.id)}>
            <X className="h-4 w-4" aria-hidden /> Discard
          </Button>
        </div>
      )}

      {/* ---- identity */}
      {field && el.type !== "radio" && (
        <Row label="Field name" htmlFor="p-name" hint={nameClash ? undefined : "Must be unique. Used by PDF readers and form data exports."}>
          <input id="p-name" className={small} value={el.name ?? ""} aria-invalid={nameClash || undefined} onChange={(e) => u({ name: e.target.value }, `name:${el.id}`)} />
          {nameClash && <p role="alert" className="mt-1 text-xs font-medium text-error">Another field already uses this name.</p>}
        </Row>
      )}
      {el.type === "radio" && (
        <>
          <Row label="Group name" htmlFor="p-group" hint={`Options in the same group are mutually exclusive. This group has ${groupSize} option${groupSize === 1 ? "" : "s"}.`}>
            <input id="p-group" className={small} value={el.group ?? ""} onChange={(e) => api.renameGroup(el.group ?? "", e.target.value)} />
          </Row>
          <Row label="Option value" htmlFor="p-option">
            <input id="p-option" className={small} value={el.option ?? ""} onChange={(e) => u({ option: e.target.value }, `opt:${el.id}`)} />
          </Row>
          <Toggle label="Selected by default" checked={!!el.checked} onChange={(v) => (v ? api.selectRadio(el.id) : u({ checked: false }))} />
          <Button size="sm" variant="secondary" className="w-full" onClick={() => api.duplicateEl(el.id, { sameGroup: true })}>
            <Plus className="h-4 w-4" aria-hidden /> Add option to this group
          </Button>
        </>
      )}
      {field && (
        <Row label={el.type === "signature" ? "Caption" : "Label (tooltip)"} htmlFor="p-label" hint={el.type === "signature" ? undefined : "Shown as a tooltip and read by screen readers in PDF readers."}>
          <input id="p-label" className={small} value={el.label ?? ""} onChange={(e) => u({ label: e.target.value }, `label:${el.id}`)} />
        </Row>
      )}

      {/* ---- values */}
      {(el.type === "text" || el.type === "email" || el.type === "phone") && (
        <Row label="Default value" htmlFor="p-value">
          {el.multiline ? (
            <textarea id="p-value" className={`${inputClass} !h-20 py-2 !text-sm`} value={el.value ?? ""} onChange={(e) => u({ value: e.target.value }, `value:${el.id}`)} />
          ) : (
            <input id="p-value" className={small} value={el.value ?? ""} onChange={(e) => u({ value: e.target.value }, `value:${el.id}`)} />
          )}
        </Row>
      )}
      {el.type === "date" && (
        <Row label="Date format" htmlFor="p-datefmt" hint="Acrobat Reader enforces this format; other readers accept any text.">
          <select id="p-datefmt" className={small} value={el.dateFormat} onChange={(e) => u({ dateFormat: e.target.value as DateFormat, value: "" })}>
            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
            <option value="dd/mm/yyyy">DD/MM/YYYY</option>
            <option value="yyyy-mm-dd">YYYY-MM-DD</option>
          </select>
        </Row>
      )}
      {el.type === "checkbox" && <Toggle label="Checked by default" checked={!!el.checked} onChange={(v) => u({ checked: v })} />}
      {(el.type === "dropdown" || el.type === "listbox") && (
        <>
          <Row label="Options (one per line)" htmlFor="p-options">
            <textarea
              id="p-options"
              className={`${inputClass} !h-24 py-2 !text-sm`}
              value={(el.options ?? []).join("\n")}
              onChange={(e) => {
                const options = e.target.value.split("\n");
                const clean = options.map((o) => o.trim()).filter(Boolean);
                u(
                  el.type === "dropdown"
                    ? { options, value: clean.includes(el.value ?? "") ? el.value : "" }
                    : { options, selected: (el.selected ?? []).filter((s) => clean.includes(s)) },
                  `options:${el.id}`,
                );
              }}
            />
          </Row>
          {el.type === "dropdown" ? (
            <>
              <Row label="Default selection" htmlFor="p-default">
                <select id="p-default" className={small} value={el.value ?? ""} onChange={(e) => u({ value: e.target.value })}>
                  <option value="">(none)</option>
                  {(el.options ?? []).filter((o) => o.trim()).map((o) => (
                    <option key={o}>{o.trim()}</option>
                  ))}
                </select>
              </Row>
              <Toggle label="Allow custom typed answers" checked={!!el.editable} onChange={(v) => u({ editable: v })} />
            </>
          ) : (
            <Toggle label="Allow multiple selections" checked={!!el.multiSelect} onChange={(v) => u({ multiSelect: v, selected: v ? el.selected : (el.selected ?? []).slice(0, 1) })} />
          )}
        </>
      )}
      {(el.type === "text" || el.type === "email" || el.type === "phone") && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Max characters" htmlFor="p-max">
            <input id="p-max" type="number" min={0} className={small} value={el.maxLength ?? ""} onChange={(e) => u({ maxLength: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })} />
          </Row>
          {el.type === "text" && (
            <div className="flex items-end">
              <Toggle label="Multiline" checked={!!el.multiline} onChange={(v) => u({ multiline: v, height: v ? Math.max(el.height, 48) : Math.min(el.height, 24) })} />
            </div>
          )}
        </div>
      )}
      {field && el.type !== "signature" && (
        <div className="flex flex-wrap gap-x-4">
          <Toggle label="Required" checked={!!el.required} onChange={(v) => u({ required: v })} />
          <Toggle label="Read-only" checked={!!el.readOnly} onChange={(v) => u({ readOnly: v })} />
        </div>
      )}
      {el.type === "signature" && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-muted-strong">
          <p>
            Exports a signing line plus an empty signature field that readers like Acrobat let people sign. You can also place a drawn or typed signature image — this is a picture, not a digital signature.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSigOpen(true)}>
              <PenLine className="h-4 w-4" aria-hidden /> {el.imageId ? "Replace signature" : "Draw or type signature"}
            </Button>
            {el.imageId && (
              <Button size="sm" variant="ghost" onClick={() => u({ imageId: undefined })}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---- layout text */}
      {(el.type === "heading" || el.type === "paragraph") && (
        <Row label="Text" htmlFor="p-text">
          <textarea id="p-text" className={`${inputClass} !h-20 py-2 !text-sm`} value={el.value ?? ""} onChange={(e) => u({ value: e.target.value }, `value:${el.id}`)} />
        </Row>
      )}
      {el.type === "image" && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              setImgError(null);
              try {
                const img = await pickImage();
                if (img) {
                  const id = api.addImage(img);
                  const ratio = img.height / img.width;
                  u({ imageId: id, height: Math.round(el.width * ratio) });
                }
              } catch (e) {
                setImgError((e as Error).message);
              }
            }}
          >
            {el.imageId ? "Replace image" : "Choose image (PNG or JPG)"}
          </Button>
          {imgError && <p role="alert" className="mt-1 text-xs text-error">{imgError}</p>}
        </div>
      )}

      {/* ---- typography */}
      {typography && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Font" htmlFor="p-font">
            <select id="p-font" className={small} value={el.font ?? "helvetica"} onChange={(e) => u({ font: e.target.value as FontFamily })}>
              <option value="helvetica">Helvetica</option>
              <option value="times">Times</option>
              <option value="courier">Courier</option>
            </select>
          </Row>
          <Row label="Size" htmlFor="p-size">
            <input id="p-size" type="number" min={4} max={96} className={small} value={el.fontSize ?? 11} onChange={(e) => u({ fontSize: Math.max(4, Math.min(96, Number(e.target.value) || 11)) }, `size:${el.id}`)} />
          </Row>
          <Row label="Align" htmlFor="p-align">
            <select id="p-align" className={small} value={el.align ?? "left"} onChange={(e) => u({ align: e.target.value as El["align"] })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Row>
          {(el.type === "heading" || el.type === "paragraph") && (
            <div className="flex items-end">
              <Toggle label="Bold" checked={!!el.bold} onChange={(v) => u({ bold: v })} />
            </div>
          )}
        </div>
      )}

      {/* ---- colours */}
      <div className="space-y-2">
        {(typography || el.type === "checkbox" || el.type === "radio" || el.type === "line" || el.type === "signature") && (
          <ColorRow label={el.type === "line" ? "Line color" : el.type === "checkbox" || el.type === "radio" ? "Mark color" : "Text color"} value={el.color} onChange={(v) => u({ color: v ?? "#000000" })} />
        )}
        {el.type !== "line" && el.type !== "image" && el.type !== "signature" && (
          <>
            <ColorRow label="Background" value={el.background} allowNone onChange={(v) => u({ background: v })} />
            <ColorRow label="Border" value={el.border} allowNone onChange={(v) => u({ border: v, borderWidth: v ? (el.borderWidth || 1) : 0 })} />
          </>
        )}
        {(el.border || el.type === "line") && (
          <Row label={el.type === "line" ? "Thickness (pt)" : "Border width (pt)"} htmlFor="p-bw">
            <input id="p-bw" type="number" min={0.25} max={12} step={0.25} className={small} value={el.borderWidth ?? 1} onChange={(e) => u({ borderWidth: Math.max(0.25, Number(e.target.value) || 1) })} />
          </Row>
        )}
      </div>

      {/* ---- geometry */}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink">Position and size (points)</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {(["left", "top", "width", "height"] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`p-${k}`} className="block text-[11px] text-muted-strong">
                {k === "left" ? "X" : k === "top" ? "Y" : k === "width" ? "W" : "H"}
              </label>
              <input
                id={`p-${k}`}
                type="number"
                className={`${small} !px-1.5`}
                value={Math.round(el[k])}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  const sq = (el.type === "checkbox" || el.type === "radio") && (k === "width" || k === "height");
                  u(sq ? { width: Math.max(6, v), height: Math.max(6, v) } : { [k]: k === "width" || k === "height" ? Math.max(4, v) : v }, `geo:${el.id}:${k}`);
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={() => api.layer(el.id, "front")} aria-label="Bring to front">
          <ArrowUpToLine className="h-4 w-4" aria-hidden /> Front
        </Button>
        <Button size="sm" variant="secondary" onClick={() => api.layer(el.id, "back")} aria-label="Send to back">
          <ArrowDownToLine className="h-4 w-4" aria-hidden /> Back
        </Button>
        <Button size="sm" variant="secondary" onClick={() => api.duplicateEl(el.id, { sameGroup: false })} aria-keyshortcuts="Control+D">
          <Copy className="h-4 w-4" aria-hidden /> Duplicate
        </Button>
        <Button size="sm" variant="secondary" onClick={() => api.removeEl(el.id)} className="hover:!text-error" aria-keyshortcuts="Delete">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </Button>
      </div>

      <Modal open={sigOpen} title="Add a signature appearance" onClose={() => setSigOpen(false)}>
        <SignaturePad
          onCancel={() => setSigOpen(false)}
          onDone={(img) => {
            const id = api.addImage(img);
            u({ imageId: id, height: Math.max(el.height, 50) });
            setSigOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
