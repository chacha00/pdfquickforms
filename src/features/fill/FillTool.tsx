import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Logo } from "../../components/layout/Logo";
import { PageBackground } from "../../components/canvas/PageBackground";
import { FieldControl, type ControlKind } from "../../components/fields/FieldControl";
import { FileDropzone } from "../../components/upload/FileDropzone";
import { Alert, Button, SegmentedControl } from "../../components/ui/primitives";
import { usePdfDocument } from "../../hooks/usePdfDocument";
import { downloadBlob, pdfBlob } from "../../lib/download";
import { formatBytes, pluralize } from "../../lib/format";
import { LIMITS } from "../../lib/limits";
import { baseName } from "../../lib/pdf/naming";
import { runJob } from "../../lib/pdf/workerClient";
import type { ExistingField, FieldValue, PdfInspection } from "../../lib/pdf/forms/inspect";
import { track } from "../../lib/analytics";
import { setEditorStart, takeFillStart } from "../start/session";

export function FillTool() {
  const [file, setFile] = useState<{ bytes: Uint8Array; name: string } | null>(() => takeFillStart() ?? null);
  if (!file) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <FillUpload onFile={setFile} />
      </div>
    );
  }
  return <Filler file={file} onReset={() => setFile(null)} />;
}

export function FillUpload({ onFile }: { onFile: (f: { bytes: Uint8Array; name: string }) => void }) {
  return (
    <FileDropzone
      rules={{ accept: ["pdf"], ...LIMITS.pdf }}
      multiple={false}
      title="Drop a fillable PDF here"
      onAccepted={(f) => {
        track("files_added", { tool: "fill", count: 1 });
        onFile({ bytes: f[0]!.bytes, name: f[0]!.file.name });
      }}
    />
  );
}

function kindOf(f: ExistingField): ControlKind | null {
  if (f.type === "text") return f.multiline ? "multiline" : "text";
  if (f.type === "checkbox" || f.type === "radio" || f.type === "dropdown" || f.type === "listbox" || f.type === "signature") return f.type;
  return null;
}

function Filler({ file, onReset }: { file: { bytes: Uint8Array; name: string }; onReset: () => void }) {
  const navigate = useNavigate();
  const pdf = usePdfDocument(file.bytes);
  const [info, setInfo] = useState<PdfInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [flatten, setFlatten] = useState<"editable" | "flat">("editable");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(800);

  useEffect(() => {
    runJob({ op: "inspect", bytes: file.bytes })
      .then((r) => setInfo(r.data as PdfInspection))
      .catch((e: Error) => setError(e.message));
  }, [file]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [info]);

  const fillable = useMemo(() => (info?.fields ?? []).filter((f) => kindOf(f) && f.type !== "signature"), [info]);
  const missing = fillable.filter((f) => f.required && !f.readOnly && isEmpty(values[f.name] ?? f.value));

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);
    track("process_start", { tool: "fill" });
    try {
      const { outputs } = await runJob({ op: "fill", bytes: file.bytes, values, flatten: flatten === "flat" });
      const name = `${baseName(file.name)}-${flatten === "flat" ? "flattened" : "filled"}.pdf`;
      downloadBlob(pdfBlob(outputs[0]!), name);
      setDone(`Downloaded ${name} (${formatBytes(outputs[0]!.length)}).`);
      track("process_success", { tool: "fill", count: Object.keys(values).length });
      track("download", { tool: "fill", format: "pdf" });
    } catch (e) {
      setError((e as Error).message);
      track("process_error", { tool: "fill", errorCode: "fill" });
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Alert tone="error" title="This PDF can't be opened">{error}</Alert>
        <Button variant="secondary" className="mt-4" onClick={onReset}>Choose another file</Button>
      </div>
    );
  }
  if (!info || pdf.status === "loading") {
    return (
      <p className="flex h-screen items-center justify-center gap-2 text-muted-strong" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening PDF…
      </p>
    );
  }

  const maxW = Math.max(...info.pages.map((p) => p.width));
  const scale = Math.min(2, (vw - (vw < 640 ? 16 : 48)) / maxW);

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Link to="/" aria-label="PDFQuick Forms home" className="rounded-lg">
          <Logo compact />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={file.name}>
          Filling: {file.name}
        </p>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Another PDF
        </Button>
      </header>

      <div className="shrink-0 space-y-2 border-b border-line bg-surface px-3 py-2">
        {info.warnings.map((w) => (
          <Alert key={w} tone="info">{w}</Alert>
        ))}
        {fillable.length === 0 ? (
          <Alert tone="info" title="This PDF has no fillable fields">
            You can add fields to it in the form editor — it's free.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                setEditorStart({ kind: "pdf", bytes: file.bytes, name: file.name });
                navigate("/editor");
              }}
            >
              Make this PDF fillable
            </button>
          </Alert>
        ) : (
          <p className="text-sm text-muted-strong" role="status">
            {pluralize(fillable.length, "field")} to fill. Read-only fields are shown but can't be changed.
          </p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {done && <Alert tone="success">{done}</Alert>}
      </div>

      <main ref={scroller} id="main" className="min-h-0 flex-1 overflow-auto pb-40" tabIndex={-1}>
        <div className="space-y-6 py-6">
          {info.pages.map((p, i) => (
            <section key={i} aria-label={`Page ${i + 1} of ${info.pages.length}`} className="mx-auto" style={{ width: p.width * scale }}>
              <div className="relative bg-white shadow-lift ring-1 ring-slate-300" style={{ width: p.width * scale, height: p.height * scale }}>
                <PageBackground doc={pdf.status === "ready" ? pdf.doc : null} index={i} width={p.width * scale} height={p.height * scale} />
                {fillable.flatMap((f) =>
                  f.widgets
                    .filter((w) => w.page === i)
                    .map((w, wi) => {
                      const v = values[f.name] ?? f.value;
                      return (
                        <div key={`${f.name}-${wi}`} className="absolute" style={{ left: w.box.left * scale, top: w.box.top * scale, width: w.box.width * scale, height: w.box.height * scale }}>
                          <FieldControl
                            kind={kindOf(f)!}
                            label={f.type === "radio" ? `${f.name}: ${w.option}` : f.name}
                            value={v}
                            radioChecked={f.type === "radio" ? v === w.option : undefined}
                            onChange={(nv) => setValues((x) => ({ ...x, [f.name]: f.type === "radio" ? (w.option ?? "") : nv }))}
                            scale={scale}
                            options={f.options}
                            multiSelect={f.multiSelect}
                            maxLength={f.maxLength}
                            readOnly={f.readOnly}
                            required={f.required}
                            invalid={f.required && !f.readOnly && isEmpty(v) && Object.keys(values).length > 0 ? "Required" : null}
                            background="rgb(238 243 255 / 0.9)"
                            border="#94a3b8"
                          />
                        </div>
                      );
                    }),
                )}
              </div>
            </section>
          ))}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface p-3 shadow-lift">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <SegmentedControl
              legend="Download as"
              name="fill-out"
              value={flatten}
              onChange={setFlatten}
              options={[
                { value: "editable", label: "Editable filled PDF" },
                { value: "flat", label: "Flattened (final)" },
              ]}
            />
            <p className="mt-1 text-xs text-muted-strong">
              {flatten === "editable" ? "Your answers are saved in the fields and can still be changed later." : "Answers become part of the page and the fields are removed — nobody can change them."}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-1 md:items-end">
            {missing.length > 0 && <p className="text-xs font-medium text-amber-800">{pluralize(missing.length, "required field")} still empty.</p>}
            <Button size="lg" onClick={() => void download()} disabled={busy || fillable.length === 0} data-testid="download">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />} Download filled PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isEmpty(v: FieldValue | undefined) {
  return v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}
