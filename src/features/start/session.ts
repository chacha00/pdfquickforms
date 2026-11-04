/**
 * In-memory hand-off between a landing page's start panel and the full-screen
 * editor / filler. Files never leave the tab.
 */
import type { El, PageModel, PageSizeId } from "../../lib/forms/model";

export type StartRequest =
  | { kind: "pdf"; bytes: Uint8Array; name: string; autoDetect?: boolean }
  | { kind: "blank"; size: PageSizeId | { width: number; height: number }; orientation: "portrait" | "landscape" }
  | { kind: "template"; id: string }
  | { kind: "templateData"; title: string; pages: PageModel[]; elements: El[] }
  | { kind: "project"; id: string };

let pending: { editor?: StartRequest; fill?: { bytes: Uint8Array; name: string } } = {};

export function setEditorStart(r: StartRequest) {
  pending.editor = r;
}
export function takeEditorStart(): StartRequest | undefined {
  const r = pending.editor;
  pending.editor = undefined;
  return r;
}
export function setFillStart(f: { bytes: Uint8Array; name: string }) {
  pending.fill = f;
}
export function takeFillStart() {
  const r = pending.fill;
  pending.fill = undefined;
  return r;
}
export function resetSession() {
  pending = {};
}
