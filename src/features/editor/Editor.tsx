import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlignStartVertical,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Heading,
  Image as ImageIcon,
  List,
  Loader2,
  Mail,
  Minus,
  PenLine,
  Pencil,
  Phone,
  Pilcrow,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Sparkles,
  Square,
  TextCursorInput,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "../../components/layout/Logo";
import { Alert, Button } from "../../components/ui/primitives";
import { Modal } from "../../components/ui/Modal";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { TYPE_LABEL, type El, type ElementType } from "../../lib/forms/model";
import { downloadBlob, pdfBlob } from "../../lib/download";
import { formatBytes, pluralize } from "../../lib/format";
import { baseName } from "../../lib/pdf/naming";
import { validateFiles } from "../../lib/validation/validateFiles";
import { LIMITS } from "../../lib/limits";
import { track } from "../../lib/analytics";
import { setFillStart, type StartRequest } from "../start/session";
import { PageFrame, TOOL_MIME } from "./PageFrame";
import { PropertiesPanel } from "./PropertiesPanel";
import { runDetection } from "./detectRunner";
import { pickImage } from "./pickImage";
import { useEditor, type Zoom } from "./useEditor";

const FIELD_TOOLS: [ElementType, LucideIcon][] = [
  ["text", TextCursorInput],
  ["checkbox", CheckSquare],
  ["radio", CircleDot],
  ["dropdown", ChevronDown],
  ["listbox", List],
  ["date", CalendarDays],
  ["email", Mail],
  ["phone", Phone],
  ["signature", PenLine],
];
const LAYOUT_TOOLS: [ElementType, LucideIcon][] = [
  ["heading", Heading],
  ["paragraph", Pilcrow],
  ["image", ImageIcon],
  ["line", Minus],
  ["rect", Square],
];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PT_TO_PX = 96 / 72;

export function Editor({ startWith }: { startWith: StartRequest }) {
  const api = useEditor();
  const { s, doc } = api;
  const navigate = useNavigate();
  const pdf = usePdfDocument(s.source);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "export" | "save" | "detect">(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"add" | "pages">("add");
  const [mobileSheet, setMobileSheet] = useState<null | "add" | "pages" | "props">(null);
  const [exportDialog, setExportDialog] = useState<null | { kind: "issues" } | { kind: "suggestions" } | { kind: "done"; bytes: Uint8Array; fields: number }>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const loaded = useRef(false);
  const isLg = useMediaQuery("(min-width: 1024px)");
  const isMd = useMediaQuery("(min-width: 768px)");
  const [pendingDetect, setPendingDetect] = useState(false);

  // ---- start
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api
      .start(startWith)
      .then((info) => {
        if (info?.warnings.length) setNotice(info.warnings.join(" "));
        if (startWith.kind === "pdf" && startWith.autoDetect) setPendingDetect(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, startWith]);

  // Auto-detect requested from the start page: run once the PDF is open for rendering.
  useEffect(() => {
    if (pendingDetect && s.ready && pdf.status === "ready") {
      setPendingDetect(false);
      void detect();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- viewport size for fit modes
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [s.ready]);

  const maxW = Math.max(1, ...doc.pages.map((p) => p.width));
  const maxH = Math.max(1, ...doc.pages.map((p) => p.height));
  const pad = viewport.w < 640 ? 16 : 48;
  const scale =
    s.zoom === "fit-width"
      ? Math.min(3, (viewport.w - pad) / maxW)
      : s.zoom === "fit-page"
        ? Math.min((viewport.w - pad) / maxW, (viewport.h - pad) / maxH)
        : s.zoom * PT_TO_PX;

  const selected = doc.elements.find((e) => e.id === s.selectedId) ?? null;
  const suggestions = doc.elements.filter((e) => e.origin === "suggested").length;
  const fieldCount = doc.elements.filter((e) => e.origin !== "suggested" && ["text", "checkbox", "radio", "dropdown", "listbox", "date", "email", "phone", "signature"].includes(e.type)).length;

  // ---- unsaved-changes guard
  useEffect(() => {
    if (!s.dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [s.dirty]);

  // ---- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") return api.set({ tool: "select", selectedId: null });
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        return void save();
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        api.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        api.redo();
      } else if (mod && e.key.toLowerCase() === "d" && s.selectedId) {
        e.preventDefault();
        api.duplicateEl(s.selectedId, { sameGroup: false });
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selectedId) {
        e.preventDefault();
        api.removeEl(s.selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPlaced = useCallback(
    async (el: El) => {
      setFocusId(el.id);
      setMobileSheet(null);
      if (el.type === "image") {
        try {
          const img = await pickImage();
          if (img) {
            const id = api.addImage(img);
            api.updateEl(el.id, { imageId: id, height: Math.round((el.width * img.height) / img.width) });
          }
        } catch (e) {
          setError((e as Error).message);
        }
      }
    },
    [api],
  );

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await api.save();
      setNotice("Saved on this device. Find it under “Your saved forms” on the start page.");
      track("process_success", { tool: "save" });
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function download(force = false) {
    if (api.issues.length && !force) return setExportDialog({ kind: "issues" });
    if (suggestions && !force) return setExportDialog({ kind: "suggestions" });
    setExportDialog(null);
    setBusy("export");
    setError(null);
    track("process_start", { tool: "export" });
    try {
      const { bytes, summary } = await api.exportPdf();
      downloadBlob(pdfBlob(bytes), `${baseName(s.name || "form")}.pdf`);
      setExportDialog({ kind: "done", bytes, fields: summary.fields.length });
      track("process_success", { tool: "export", count: summary.fields.length });
      track("download", { tool: "export", format: "pdf" });
    } catch (e) {
      setError((e as Error).message);
      track("process_error", { tool: "export", errorCode: "export" });
    } finally {
      setBusy(null);
    }
  }

  async function detect() {
    if (pdf.status !== "ready") return;
    setBusy("detect");
    setError(null);
    try {
      const found = await runDetection(pdf.doc, doc.pages, doc.elements, s.inspection);
      api.addSuggestions(found);
      setNotice(
        found.length
          ? `Found ${pluralize(found.length, "possible field")}. Review the highlighted suggestions — accept, adjust or discard each one. Only accepted fields are exported.`
          : "No likely fields were found from the text on these pages. Lines and boxes drawn as graphics, and scanned pages, aren't detected yet — place fields manually.",
      );
      track("process_success", { tool: "detect", count: found.length });
    } catch (e) {
      setError(`Auto-detect failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function openPdf(files: FileList | null) {
    if (!files?.[0]) return;
    if (s.dirty && !window.confirm("Open a different PDF? Unsaved changes to this form will be lost.")) return;
    const { accepted, rejected } = await validateFiles([files[0]], { accept: ["pdf"], ...LIMITS.pdf }, { count: 0, bytes: 0 });
    if (rejected[0]) return setError(`${rejected[0].name}: ${rejected[0].reason}`);
    try {
      const info = await api.start({ kind: "pdf", bytes: accepted[0]!.bytes, name: accepted[0]!.file.name });
      setNotice(info?.warnings.join(" ") || null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const setZoom = (z: Zoom) => api.set({ zoom: z });
  const zoomStep = (dir: 1 | -1) => {
    const cur = scale / PT_TO_PX;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.01) : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
    if (next) setZoom(next);
  };

  if (error && !s.ready) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Alert tone="error" title="This document can't be opened">
          {error}
        </Alert>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary underline">
          Back to start
        </Link>
      </div>
    );
  }
  if (!s.ready || (s.source && pdf.status === "loading")) {
    return (
      <p className="flex h-screen items-center justify-center gap-2 text-muted-strong" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening the editor…
      </p>
    );
  }

  const design = s.mode === "design";

  const toolsPanel = (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sidebar" className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {(["add", "pages"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={panel === t} onClick={() => setPanel(t)} className={`h-9 rounded-lg ${panel === t ? "bg-surface shadow-card" : "text-muted-strong"}`}>
            {t === "add" ? "Add" : `Pages (${doc.pages.length})`}
          </button>
        ))}
      </div>
      {panel === "add" ? (
        <>
          <ToolGroup title="Form fields" tools={FIELD_TOOLS} api={api} />
          <ToolGroup title="Layout" tools={LAYOUT_TOOLS} api={api} />
          <p className="text-xs text-muted-strong">Click a tool, then click the page. Or drag a tool onto the page.</p>
        </>
      ) : (
        <PagesList api={api} onDelete={(i) => (doc.elements.some((e) => e.pageId === doc.pages[i]!.id) || api.pageHasExistingFields(doc.pages[i]!) ? setConfirmDelete(i) : api.deletePage(i))} />
      )}
    </div>
  );

  const props = selected && design ? <PropertiesPanel api={api} el={selected} /> : <FormSummary api={api} fieldCount={fieldCount} />;

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      {/* ---------- top toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5 sm:gap-2 sm:px-3">
        <Link to="/" aria-label="PDFQuick Forms home" className="mr-1 hidden rounded-lg sm:block">
          <Logo compact />
        </Link>
        <label className="sr-only" htmlFor="form-name">
          Form name
        </label>
        <input
          id="form-name"
          value={s.name}
          onChange={(e) => api.set({ name: e.target.value, dirty: true })}
          className="h-9 w-32 min-w-0 rounded-lg border border-transparent px-2 text-sm font-semibold text-ink hover:border-line focus:border-primary sm:w-48"
        />
        <div className="hidden items-center gap-0.5 md:flex">
          <TopButton icon={FilePlus2} label="New form" onClick={() => (!s.dirty || window.confirm("Start a new form? Unsaved changes will be lost.")) && navigate("/create-fillable-pdf")} />
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-slate-100 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-primary">
            <FolderOpen className="h-4 w-4" aria-hidden /> Open PDF
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void openPdf(e.target.files)} data-testid="open-pdf" />
          </label>
          <TopButton icon={busy === "save" ? Loader2 : Save} label="Save project" onClick={() => void save()} disabled={busy !== null} />
        </div>
        <span className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden />
        <TopButton icon={Undo2} label="Undo" iconOnly onClick={api.undo} disabled={!api.canUndo} shortcut="Control+Z" />
        <TopButton icon={Redo2} label="Redo" iconOnly onClick={api.redo} disabled={!api.canRedo} shortcut="Control+Shift+Z" />
        <div className="hidden items-center gap-0.5 lg:flex" role="group" aria-label="Zoom">
          <TopButton icon={Minus} label="Zoom out" iconOnly onClick={() => zoomStep(-1)} />
          <label className="sr-only" htmlFor="zoom">
            Zoom
          </label>
          <select
            id="zoom"
            className="h-9 rounded-lg border border-line bg-surface px-1 text-sm"
            value={typeof s.zoom === "number" ? String(s.zoom) : s.zoom}
            onChange={(e) => setZoom(e.target.value === "fit-width" || e.target.value === "fit-page" ? e.target.value : Number(e.target.value))}
          >
            <option value="fit-width">Fit width</option>
            <option value="fit-page">Fit page</option>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z * 100}%
              </option>
            ))}
          </select>
          <TopButton icon={Plus} label="Zoom in" iconOnly onClick={() => zoomStep(1)} />
          <TopButton icon={Grid3x3} label="Snap to grid" iconOnly pressed={s.grid} onClick={() => api.set({ grid: !s.grid })} />
        </div>
        {s.source && (
          <TopButton id="btn-detect" icon={busy === "detect" ? Loader2 : Sparkles} label="Auto-detect fields" onClick={() => void detect()} disabled={busy !== null || !design} className="hidden md:inline-flex" />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={design ? "secondary" : "primary"}
            size="sm"
            aria-pressed={!design}
            onClick={() => api.set({ mode: design ? "preview" : "design", selectedId: null, tool: "select", previewValues: {} })}
          >
            {design ? <Eye className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">{design ? "Preview" : "Back to editing"}</span>
          </Button>
          <Button size="sm" onClick={() => void download()} disabled={busy !== null} data-testid="download">
            {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">Download Fillable PDF</span>
            <span className="sm:hidden">Download</span>
          </Button>
        </div>
      </header>

      {(error || notice || suggestions > 0 || !design) && (
        <div className="shrink-0 space-y-2 border-b border-line bg-surface px-3 py-2">
          {!design && (
            <Alert tone="info">
              <strong>Preview:</strong> try the form as someone filling it in would. Values you type here are for testing and aren't saved to the download.
            </Alert>
          )}
          {error && (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Alert tone="error">{error}</Alert>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setError(null)} aria-label="Dismiss error">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Alert tone="success">{notice}</Alert>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNotice(null)} aria-label="Dismiss message">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          {suggestions > 0 && design && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
              <Sparkles className="h-4 w-4" aria-hidden /> {pluralize(suggestions, "suggested field")} to review.
              <Button size="sm" onClick={() => api.acceptSuggestion("all")} className="ml-auto">
                Accept all
              </Button>
              <Button size="sm" variant="secondary" onClick={() => api.discardSuggestion("all")}>
                Discard all
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------- left sidebar (desktop) */}
        {design && isMd && <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-surface p-3" aria-label="Tools and pages">{toolsPanel}</aside>}

        {/* ---------- canvas */}
        <main ref={scroller} id="main" className="relative min-w-0 flex-1 overflow-auto" tabIndex={-1}>
          <div className="space-y-6 py-6 pb-28 md:pb-10" style={{ minWidth: maxW * scale + pad }}>
            {doc.pages.map((p, i) => (
              <PageFrame
                key={p.id}
                api={api}
                page={p}
                index={i}
                total={doc.pages.length}
                scale={scale}
                pdf={pdf.status === "ready" ? pdf.doc : null}
                existing={s.inspection?.fields ?? []}
                focusId={focusId}
                onFocused={() => setFocusId(null)}
                onPlaced={(el) => void onPlaced(el)}
              />
            ))}
          </div>
        </main>

        {/* ---------- right sidebar (desktop) */}
        {isLg && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-line bg-surface p-4" aria-label="Properties">
            {props}
          </aside>
        )}
      </div>

      {/* ---------- mobile / tablet bottom bar */}
      <nav aria-label="Editor actions" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface lg:hidden">
        {design && (
          <MobileTab icon={Plus} label="Add" onClick={() => setMobileSheet(mobileSheet === "add" ? null : "add")} active={mobileSheet === "add"} className="md:hidden" />
        )}
        {design && <MobileTab icon={Copy} label="Pages" onClick={() => { setPanel("pages"); setMobileSheet(mobileSheet === "pages" ? null : "pages"); }} active={mobileSheet === "pages"} className="md:hidden" />}
        <MobileTab icon={AlignStartVertical} label={selected ? "Properties" : "Form"} onClick={() => setMobileSheet(mobileSheet === "props" ? null : "props")} active={mobileSheet === "props"} />
        <MobileTab icon={Save} label="Save" onClick={() => void save()} />
      </nav>
      {mobileSheet && !isLg && !(isMd && mobileSheet !== "props") && (
        <div className="fixed inset-x-0 bottom-14 z-40 max-h-[60dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 shadow-lift lg:hidden" role="dialog" aria-label={mobileSheet === "props" ? "Properties" : mobileSheet === "add" ? "Add elements" : "Pages"}>
          <div className="mb-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setMobileSheet(null)} aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {mobileSheet === "props" ? props : mobileSheet === "add" ? toolsPanel : <PagesList api={api} onDelete={(i) => setConfirmDelete(i)} />}
        </div>
      )}

      {/* ---------- dialogs */}
      <Modal open={exportDialog?.kind === "issues"} title="Fix these before downloading" onClose={() => setExportDialog(null)}>
        <ul className="space-y-2 text-sm">
          {api.issues.map((iss, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-red-50 p-2 text-red-900">
              <span>{iss.message}</span>
              {iss.elementId && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    api.set({ selectedId: iss.elementId!, mode: "design" });
                    setExportDialog(null);
                    setTimeout(() => document.querySelector(`[data-id="${iss.elementId}"]`)?.scrollIntoView({ block: "center" }), 50);
                  }}
                >
                  Show
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={exportDialog?.kind === "suggestions"} title="Unreviewed suggestions" onClose={() => setExportDialog(null)}>
        <p className="text-sm text-muted-strong">
          {pluralize(suggestions, "suggested field")} haven't been accepted. Only accepted fields are added to your PDF.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void download(true)}>
            Download without them
          </Button>
          <Button
            onClick={() => {
              api.acceptSuggestion("all");
              setExportDialog(null);
              setTimeout(() => document.querySelector<HTMLButtonElement>('[data-testid="download"]')?.click(), 50);
            }}
          >
            Accept all and download
          </Button>
        </div>
      </Modal>
      <Modal open={exportDialog?.kind === "done"} title="Your fillable PDF is ready!" onClose={() => setExportDialog(null)}>
        {exportDialog?.kind === "done" && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-strong" role="status">
              {baseName(s.name || "form")}.pdf · {formatBytes(exportDialog.bytes.length)} · {pluralize(exportDialog.fields, "interactive field")}. It was checked by reopening it before download.
            </p>
            <p className="text-muted-strong">Open it in Adobe Acrobat Reader, your browser, or macOS Preview and the fields can be filled in.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => downloadBlob(pdfBlob(exportDialog.bytes), `${baseName(s.name || "form")}.pdf`)}>
                <Download className="h-4 w-4" aria-hidden /> Download again
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setFillStart({ bytes: exportDialog.bytes, name: `${baseName(s.name || "form")}.pdf` });
                  navigate("/fill");
                }}
              >
                Fill it in now
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={confirmDelete !== null} title={`Delete page ${confirmDelete !== null ? confirmDelete + 1 : ""}?`} onClose={() => setConfirmDelete(null)}>
        <p className="text-sm text-muted-strong">
          Everything you added to this page will be removed{confirmDelete !== null && api.pageHasExistingFields(doc.pages[confirmDelete]!) ? ", including the form fields that were already in the original PDF" : ""}. You can undo this.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              api.deletePage(confirmDelete!);
              setConfirmDelete(null);
            }}
          >
            Delete page
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function TopButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  iconOnly,
  pressed,
  shortcut,
  className = "",
  id,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  iconOnly?: boolean;
  pressed?: boolean;
  shortcut?: string;
  className?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={label}
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink hover:bg-slate-100 disabled:opacity-40 aria-pressed:bg-primary-soft aria-pressed:text-primary-hover ${className}`}
    >
      <Icon className={`h-4 w-4 ${Icon === Loader2 ? "animate-spin" : ""}`} aria-hidden />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

function ToolGroup({ title, tools, api }: { title: string; tools: [ElementType, LucideIcon][]; api: ReturnType<typeof useEditor> }) {
  return (
    <section aria-labelledby={`tg-${title}`}>
      <h2 id={`tg-${title}`} className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-strong">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map(([type, Icon]) => (
          <button
            key={type}
            type="button"
            draggable
            aria-pressed={api.s.tool === type}
            onDragStart={(e) => {
              e.dataTransfer.setData(TOOL_MIME, type);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => api.set({ tool: api.s.tool === type ? "select" : type, selectedId: null })}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-2 text-left text-xs font-semibold text-ink hover:border-slate-300 hover:bg-slate-50 aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-hover"
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {TYPE_LABEL[type]}
          </button>
        ))}
      </div>
    </section>
  );
}

function PagesList({ api, onDelete }: { api: ReturnType<typeof useEditor>; onDelete: (i: number) => void }) {
  const { doc } = api;
  return (
    <div className="space-y-3">
      <ol className="space-y-1.5" aria-label="Pages">
        {doc.pages.map((p, i) => {
          const hasExisting = api.pageHasExistingFields(p);
          return (
            <li key={p.id} className="rounded-lg border border-line p-2" data-testid="page-row">
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="font-semibold text-ink hover:text-primary"
                  onClick={() => document.querySelector(`[data-page-index="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Page {i + 1}
                </button>
                <span className="text-muted-strong">
                  {p.kind === "pdf" ? `Original p.${p.index + 1}` : "Blank"} · {Math.round(p.width)}×{Math.round(p.height)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-0.5">
                <IconBtn label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => api.movePage(i, i - 1)} icon={ChevronUp} />
                <IconBtn label={`Move page ${i + 1} down`} disabled={i === doc.pages.length - 1} onClick={() => api.movePage(i, i + 1)} icon={ChevronDown} />
                <IconBtn label={hasExisting ? `Page ${i + 1} has original form fields and can't be duplicated` : `Duplicate page ${i + 1}`} disabled={hasExisting} onClick={() => api.duplicatePage(i)} icon={Copy} />
                <IconBtn label={p.kind === "blank" ? `Change orientation of page ${i + 1}` : "Orientation can only be changed on blank pages"} disabled={p.kind !== "blank"} onClick={() => api.rotateBlankPage(i)} icon={RotateCw} />
                <IconBtn label={`Insert blank page after page ${i + 1}`} onClick={() => api.addPage(i)} icon={FilePlus2} />
                <IconBtn label={`Delete page ${i + 1}`} disabled={doc.pages.length <= 1} onClick={() => onDelete(i)} icon={Trash2} />
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" className="w-full" onClick={() => api.addPage(doc.pages.length - 1)}>
        <FilePlus2 className="h-4 w-4" aria-hidden /> Add page
      </Button>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, icon: Icon }: { label: string; onClick: () => void; disabled?: boolean; icon: LucideIcon }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-strong hover:bg-slate-100 hover:text-ink disabled:opacity-30">
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

function MobileTab({ icon: Icon, label, onClick, active, className = "" }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? "text-primary" : "text-ink"} ${className}`}>
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}

function FormSummary({ api, fieldCount }: { api: ReturnType<typeof useEditor>; fieldCount: number }) {
  const { s, doc } = api;
  const existing = s.inspection?.fields.length ?? 0;
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of doc.elements) if (e.origin !== "suggested") c.set(TYPE_LABEL[e.type], (c.get(TYPE_LABEL[e.type]) ?? 0) + 1);
    return [...c.entries()];
  }, [doc.elements]);
  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-sm font-bold text-ink">This form</h2>
      <p className="text-muted-strong">
        {pluralize(doc.pages.length, "page")} · {pluralize(fieldCount, "new field")}
        {existing > 0 && ` · ${pluralize(existing, "original field")}`}
      </p>
      {counts.length > 0 && (
        <ul className="space-y-0.5 text-muted-strong">
          {counts.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
      {existing > 0 && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-950">
          Fields marked <strong>Existing</strong> came with the PDF. They're kept as they are; you can type values into them here.
        </p>
      )}
      <p className="text-xs text-muted-strong">
        {s.savedAt ? `Last saved ${new Date(s.savedAt).toLocaleTimeString()} on this device.` : "Not saved yet. Projects are saved only in this browser."}
      </p>
      <p className="text-xs text-muted-strong">Select an element on the page to edit its properties.</p>
    </div>
  );
}
