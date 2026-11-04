import { useCallback, useMemo, useRef, useState } from "react";
import {
  PAGE_SIZES,
  createElement,
  isField,
  newId,
  nextName,
  projectIssues,
  uniqueName,
  usedNames,
  type El,
  type ElementType,
  type PageModel,
  type Project,
  type ProjectImage,
} from "../../lib/forms/model";
import { canRedo, canUndo, commit, initHistory, redo, replace, undo, type History } from "../../lib/forms/history";
import { clampBox } from "../../lib/coordinates/geometry";
import { runJob } from "../../lib/pdf/workerClient";
import type { FieldValue, PdfInspection } from "../../lib/pdf/forms/inspect";
import type { ExportSummary } from "../../lib/pdf/forms/exportProject";
import { saveProject, loadProject } from "../../lib/storage/projects";
import { templateById } from "../../lib/forms/templates";
import type { StartRequest } from "../start/session";
import { track } from "../../lib/analytics";

export interface Doc {
  pages: PageModel[];
  elements: El[];
  existingValues: Record<string, FieldValue>;
}

export type Tool = "select" | ElementType;
export type Zoom = "fit-width" | "fit-page" | number;
export type Mode = "design" | "preview";

export interface EditorState {
  ready: boolean;
  projectId: string;
  name: string;
  source: Uint8Array | null;
  sourceName: string | null;
  inspection: PdfInspection | null;
  images: Record<string, ProjectImage>;
  history: History<Doc>;
  selectedId: string | null;
  tool: Tool;
  mode: Mode;
  zoom: Zoom;
  grid: boolean;
  previewValues: Record<string, FieldValue>;
  savedAt: number | null;
  dirty: boolean;
}

const emptyDoc: Doc = { pages: [], elements: [], existingValues: {} };

export function blankPage(size: { width: number; height: number }, orientation: "portrait" | "landscape" = "portrait"): PageModel {
  const [short, long] = [Math.min(size.width, size.height), Math.max(size.width, size.height)];
  return { id: newId("p"), kind: "blank", ...(orientation === "landscape" ? { width: long, height: short } : { width: short, height: long }) };
}

export function useEditor() {
  const [s, setS] = useState<EditorState>({
    ready: false,
    projectId: newId("proj"),
    name: "Untitled form",
    source: null,
    sourceName: null,
    inspection: null,
    images: {},
    history: initHistory(emptyDoc),
    selectedId: null,
    tool: "select",
    mode: "design",
    zoom: "fit-width",
    grid: false,
    previewValues: {},
    savedAt: null,
    dirty: false,
  });
  const stateRef = useRef(s);
  stateRef.current = s;
  const doc = s.history.present;

  // ---- doc mutation helpers
  const change = useCallback((fn: (d: Doc) => Doc, coalesce?: string) => {
    setS((st) => {
      const next = fn(st.history.present);
      if (next === st.history.present) return st;
      return { ...st, history: commit(st.history, next, { coalesce }), dirty: true };
    });
  }, []);

  const set = useCallback((patch: Partial<EditorState>) => setS((st) => ({ ...st, ...patch })), []);

  const reservedNames = useMemo(() => (s.inspection?.fields ?? []).map((f) => f.name), [s.inspection]);

  // ---- loading
  const start = useCallback(async (req: StartRequest) => {
    if (req.kind === "pdf") {
      const { data } = await runJob({ op: "inspect", bytes: req.bytes });
      const info = data as PdfInspection;
      const pages: PageModel[] = info.pages.map((p, index) => ({ id: newId("p"), kind: "pdf", index, ...p }));
      const name = req.name.replace(/\.pdf$/i, "") || "Untitled form";
      setS((st) => ({
        ...st,
        ready: true,
        projectId: newId("proj"),
        name,
        source: req.bytes,
        sourceName: req.name,
        inspection: info,
        images: {},
        history: initHistory({ pages, elements: [], existingValues: {} }),
        selectedId: null,
        dirty: false,
      }));
      track("files_added", { tool: "editor", count: 1 });
      return info;
    }
    if (req.kind === "blank") {
      const size = typeof req.size === "string" ? PAGE_SIZES[req.size] : req.size;
      setS((st) => ({
        ...st,
        ready: true,
        projectId: newId("proj"),
        name: "Untitled form",
        source: null,
        sourceName: null,
        inspection: null,
        images: {},
        history: initHistory({ pages: [blankPage(size, req.orientation)], elements: [], existingValues: {} }),
        selectedId: null,
        dirty: false,
      }));
      return null;
    }
    if (req.kind === "templateData") {
      setS((st) => ({
        ...st,
        ready: true,
        projectId: newId("proj"),
        name: req.title,
        source: null,
        sourceName: null,
        inspection: null,
        images: {},
        history: initHistory({ pages: req.pages, elements: req.elements, existingValues: {} }),
        selectedId: null,
        dirty: false,
      }));
      return null;
    }
    if (req.kind === "template") {
      const tpl = templateById(req.id);
      if (!tpl) throw new Error("That template doesn't exist.");
      const built = tpl.build();
      setS((st) => ({
        ...st,
        ready: true,
        projectId: newId("proj"),
        name: tpl.title,
        source: null,
        sourceName: null,
        inspection: null,
        images: {},
        history: initHistory({ ...built, existingValues: {} }),
        selectedId: null,
        dirty: false,
      }));
      track("files_added", { tool: `template:${tpl.id}`, count: 0 });
      return null;
    }
    const saved = await loadProject(req.id);
    if (!saved) throw new Error("That saved project couldn't be found on this device.");
    const inspection = saved.source ? ((await runJob({ op: "inspect", bytes: saved.source })).data as PdfInspection) : null;
    setS((st) => ({
      ...st,
      ready: true,
      projectId: saved.id,
      name: saved.name,
      source: saved.source,
      sourceName: saved.sourceName,
      inspection,
      images: saved.images,
      history: initHistory({ pages: saved.project.pages, elements: saved.project.elements, existingValues: saved.project.existingValues }),
      selectedId: null,
      savedAt: saved.updatedAt,
      dirty: false,
    }));
    return inspection;
  }, []);

  // ---- elements
  const addElement = useCallback(
    (type: ElementType, pageId: string, at: { x: number; y: number }, extra: Partial<El> = {}) => {
      const st = stateRef.current;
      const page = st.history.present.pages.find((p) => p.id === pageId);
      if (!page) return null;
      const el = { ...createElement(type, pageId, at, { elements: st.history.present.elements, reserved: reservedNames }), ...extra };
      Object.assign(el, clampBox(el, page));
      change((d) => ({ ...d, elements: [...d.elements, el] }));
      setS((x) => ({ ...x, selectedId: el.id, tool: "select" }));
      return el;
    },
    [change, reservedNames],
  );

  const updateEl = useCallback(
    (id: string, patch: Partial<El>, coalesce?: string) => {
      change((d) => {
        const page = (e: El) => d.pages.find((p) => p.id === e.pageId);
        return {
          ...d,
          elements: d.elements.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, ...patch };
            const pg = page(next);
            return pg ? { ...next, ...clampBox(next, pg) } : next;
          }),
        };
      }, coalesce ?? `el:${id}:${Object.keys(patch).join(",")}`);
    },
    [change],
  );

  /** Rename a radio group across all its options. */
  const renameGroup = useCallback(
    (from: string, to: string) => change((d) => ({ ...d, elements: d.elements.map((e) => (e.type === "radio" && e.group === from ? { ...e, group: to } : e)) }), `group:${from}`),
    [change],
  );

  /** Selecting a radio option un-selects the others in its group. */
  const selectRadio = useCallback(
    (id: string) =>
      change((d) => {
        const el = d.elements.find((e) => e.id === id);
        if (!el) return d;
        return { ...d, elements: d.elements.map((e) => (e.type === "radio" && e.group === el.group ? { ...e, checked: e.id === id } : e)) };
      }),
    [change],
  );

  const removeEl = useCallback(
    (id: string) => {
      change((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
      setS((x) => (x.selectedId === id ? { ...x, selectedId: null } : x));
    },
    [change],
  );

  const duplicateEl = useCallback(
    (id: string, opts: { sameGroup?: boolean } = {}) => {
      const st = stateRef.current;
      const d = st.history.present;
      const el = d.elements.find((e) => e.id === id);
      if (!el) return;
      const page = d.pages.find((p) => p.id === el.pageId)!;
      const copy: El = { ...el, id: newId(), origin: "user", top: el.top + el.height + 6 };
      if (el.type === "radio") {
        if (opts.sameGroup !== false) {
          const opts2 = new Set(d.elements.filter((e) => e.type === "radio" && e.group === el.group).map((e) => e.option));
          let n = opts2.size + 1;
          while (opts2.has(`Option ${n}`)) n++;
          copy.option = `Option ${n}`;
          copy.checked = false;
          copy.top = el.top;
          copy.left = el.left + Math.max(el.width + 60, 80);
          if (copy.left + copy.width > page.width) {
            copy.left = el.left;
            copy.top = el.top + el.height + 8;
          }
        } else copy.group = uniqueName(el.group ?? "Choice", usedNames(d.elements, reservedNames));
      } else if (isField(el.type)) copy.name = uniqueName(el.name ?? nextName(el.type, d.elements), usedNames(d.elements, reservedNames));
      Object.assign(copy, clampBox(copy, page));
      change((x) => ({ ...x, elements: [...x.elements, copy] }));
      set({ selectedId: copy.id });
    },
    [change, set, reservedNames],
  );

  const layer = useCallback(
    (id: string, dir: "front" | "back" | "forward" | "backward") =>
      change((d) => {
        const i = d.elements.findIndex((e) => e.id === id);
        if (i < 0) return d;
        const els = d.elements.slice();
        const [el] = els.splice(i, 1);
        const to = dir === "front" ? els.length : dir === "back" ? 0 : dir === "forward" ? Math.min(els.length, i + 1) : Math.max(0, i - 1);
        els.splice(to, 0, el!);
        return { ...d, elements: els };
      }),
    [change],
  );

  // ---- pages
  const pageHasExistingFields = useCallback(
    (p: PageModel) => p.kind === "pdf" && !!stateRef.current.inspection?.fields.some((f) => f.widgets.some((w) => w.page === p.index)),
    [],
  );

  const addPage = useCallback(
    (afterIndex: number, size?: { width: number; height: number }) => {
      change((d) => {
        const ref = d.pages[afterIndex] ?? d.pages[d.pages.length - 1];
        const pg = blankPage(size ?? ref ?? PAGE_SIZES.letter, ref && ref.width > ref.height ? "landscape" : "portrait");
        const pages = d.pages.slice();
        pages.splice(afterIndex + 1, 0, pg);
        return { ...d, pages };
      });
    },
    [change],
  );

  const duplicatePage = useCallback(
    (index: number) =>
      change((d) => {
        const src = d.pages[index];
        if (!src) return d;
        const copy: PageModel = { ...src, id: newId("p") };
        const used = usedNames(d.elements, reservedNames);
        const copies = d.elements
          .filter((e) => e.pageId === src.id)
          .map((e) => {
            const c: El = { ...e, id: newId(), pageId: copy.id };
            if (e.type === "radio") {
              c.group = uniqueName(e.group ?? "Choice", used);
              used.add(c.group);
            } else if (isField(e.type)) {
              c.name = uniqueName(e.name ?? "Field", used);
              used.add(c.name);
            }
            return c;
          });
        // Radio options that shared a group on the source page must share the new group too.
        const groupMap = new Map<string, string>();
        d.elements.filter((e) => e.pageId === src.id && e.type === "radio").forEach((e, i) => {
          if (!groupMap.has(e.group!)) groupMap.set(e.group!, copies.filter((c) => c.type === "radio")[i]!.group!);
        });
        const radioCopies = copies.filter((c) => c.type === "radio");
        d.elements.filter((e) => e.pageId === src.id && e.type === "radio").forEach((e, i) => (radioCopies[i]!.group = groupMap.get(e.group!)));
        const pages = d.pages.slice();
        pages.splice(index + 1, 0, copy);
        return { ...d, pages, elements: [...d.elements, ...copies] };
      }),
    [change, reservedNames],
  );

  const deletePage = useCallback(
    (index: number) =>
      change((d) => {
        if (d.pages.length <= 1) return d;
        const pg = d.pages[index]!;
        return { ...d, pages: d.pages.filter((_, i) => i !== index), elements: d.elements.filter((e) => e.pageId !== pg.id) };
      }),
    [change],
  );

  const movePage = useCallback(
    (from: number, to: number) =>
      change((d) => {
        if (to < 0 || to >= d.pages.length) return d;
        const pages = d.pages.slice();
        const [p] = pages.splice(from, 1);
        pages.splice(to, 0, p!);
        return { ...d, pages };
      }),
    [change],
  );

  /** Swap orientation of a blank page, keeping elements inside it. */
  const rotateBlankPage = useCallback(
    (index: number) =>
      change((d) => {
        const p = d.pages[index];
        if (!p || p.kind !== "blank") return d;
        const np = { ...p, width: p.height, height: p.width };
        return { ...d, pages: d.pages.map((x, i) => (i === index ? np : x)), elements: d.elements.map((e) => (e.pageId === p.id ? { ...e, ...clampBox(e, np) } : e)) };
      }),
    [change],
  );

  // ---- suggestions
  const addSuggestions = useCallback((els: El[]) => change((d) => ({ ...d, elements: [...d.elements, ...els] })), [change]);
  const acceptSuggestion = useCallback((id: string | "all") => change((d) => ({ ...d, elements: d.elements.map((e) => (e.origin === "suggested" && (id === "all" || e.id === id) ? { ...e, origin: "user" } : e)) })), [change]);
  const discardSuggestion = useCallback((id: string | "all") => change((d) => ({ ...d, elements: d.elements.filter((e) => !(e.origin === "suggested" && (id === "all" || e.id === id))) })), [change]);

  // ---- existing fields
  const setExistingValue = useCallback(
    (name: string, value: FieldValue) => change((d) => ({ ...d, existingValues: { ...d.existingValues, [name]: value } }), `existing:${name}`),
    [change],
  );

  // ---- images
  const addImage = useCallback((img: ProjectImage) => {
    const id = newId("img");
    setS((st) => ({ ...st, images: { ...st.images, [id]: img }, dirty: true }));
    return id;
  }, []);

  // ---- history
  const doUndo = useCallback(() => setS((st) => ({ ...st, history: undo(st.history), dirty: true })), []);
  const doRedo = useCallback(() => setS((st) => ({ ...st, history: redo(st.history), dirty: true })), []);

  // ---- persistence / export
  const project = useCallback((): Project => {
    const st = stateRef.current;
    const d = st.history.present;
    return { version: 1, id: st.projectId, name: st.name, pages: d.pages, elements: d.elements, existingValues: d.existingValues };
  }, []);

  const save = useCallback(async () => {
    const st = stateRef.current;
    await saveProject({ id: st.projectId, name: st.name, updatedAt: Date.now(), project: project(), source: st.source, sourceName: st.sourceName, images: st.images });
    setS((x) => ({ ...x, savedAt: Date.now(), dirty: false }));
  }, [project]);

  const issues = useMemo(() => projectIssues({ version: 1, id: "", name: "", ...doc }, reservedNames), [doc, reservedNames]);

  const exportPdf = useCallback(async () => {
    const st = stateRef.current;
    const p = project();
    const { outputs, data } = await runJob({ op: "export", source: st.source, project: p, images: st.images });
    return { bytes: outputs[0]!, summary: data as ExportSummary };
  }, [project]);

  return {
    s,
    doc,
    set,
    start,
    addElement,
    updateEl,
    renameGroup,
    selectRadio,
    removeEl,
    duplicateEl,
    layer,
    addPage,
    duplicatePage,
    deletePage,
    movePage,
    rotateBlankPage,
    pageHasExistingFields,
    addSuggestions,
    acceptSuggestion,
    discardSuggestion,
    setExistingValue,
    addImage,
    undo: doUndo,
    redo: doRedo,
    canUndo: canUndo(s.history),
    canRedo: canRedo(s.history),
    save,
    exportPdf,
    issues,
    reservedNames,
    replaceDoc: (d: Doc) => setS((st) => ({ ...st, history: replace(st.history, d) })),
  };
}

export type EditorApi = ReturnType<typeof useEditor>;
