import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FilePlus2, FileText, LayoutTemplate, Trash2, Upload } from "lucide-react";
import { FileDropzone } from "../../components/upload/FileDropzone";
import { Button, SegmentedControl, inputClass } from "../../components/ui/primitives";
import { LIMITS } from "../../lib/limits";
import { PAGE_SIZES, validPageDimension, type PageSizeId } from "../../lib/forms/model";
import { deleteProject, listProjects, type ProjectSummary } from "../../lib/storage/projects";
import { setEditorStart, setFillStart } from "./session";
import { FillUpload } from "../fill/FillTool";

export type StartVariant = "fillable" | "create" | "fill" | "both";

/** The working tool on every landing page: upload, blank form, templates, saved projects. */
export function StartPanel({ variant = "both" }: { variant?: StartVariant }) {
  const navigate = useNavigate();
  if (variant === "fill") {
    return (
      <div className="space-y-3">
        <FillUpload
          onFile={(f) => {
            setFillStart(f);
            navigate("/fill");
          }}
        />
        <p className="text-center text-sm text-muted-strong">
          Not fillable yet? <Link to="/make-pdf-fillable" className="font-semibold text-primary underline">Make a PDF fillable</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className={`grid gap-5 ${variant === "both" ? "lg:grid-cols-2" : ""}`}>
        {(variant === "both" || variant === "fillable") && <UploadCard />}
        {(variant === "both" || variant === "create") && <BlankCard />}
      </div>
      {variant !== "both" && (
        <p className="text-center text-sm text-muted-strong">
          {variant === "fillable" ? (
            <>
              No PDF yet? <Link to="/create-fillable-pdf" className="font-semibold text-primary underline">Create a new form</Link>
            </>
          ) : (
            <>
              Already have a PDF? <Link to="/make-pdf-fillable" className="font-semibold text-primary underline">Make it fillable</Link>
            </>
          )}{" "}
          · <Link to="/free-pdf-templates" className="font-semibold text-primary underline">Browse free templates</Link>
        </p>
      )}
      <SavedProjects />
    </div>
  );
}

function UploadCard() {
  const navigate = useNavigate();
  const [detect, setDetect] = useState(true);
  return (
    <section aria-labelledby="start-upload" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="start-upload" className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
        <Upload className="h-5 w-5 text-primary" aria-hidden /> Make a PDF fillable
      </h2>
      <FileDropzone
        rules={{ accept: ["pdf"], ...LIMITS.pdf }}
        multiple={false}
        compact
        title="Drop your PDF here"
        onAccepted={(f) => {
          setEditorStart({ kind: "pdf", bytes: f[0]!.bytes, name: f[0]!.file.name, autoDetect: detect });
          navigate("/editor");
        }}
      />
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={detect} onChange={(e) => setDetect(e.target.checked)} />
        Suggest fields automatically (Auto-detect, free)
      </label>
    </section>
  );
}

function BlankCard() {
  const navigate = useNavigate();
  const [size, setSize] = useState<PageSizeId | "custom">("letter");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [w, setW] = useState("8.5");
  const [h, setH] = useState("11");
  const customOk = validPageDimension(Number(w) * 72) && validPageDimension(Number(h) * 72);

  return (
    <section aria-labelledby="start-blank" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="start-blank" className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
        <FilePlus2 className="h-5 w-5 text-primary" aria-hidden /> Create a new form
      </h2>
      <div className="space-y-4">
        <SegmentedControl
          legend="Page size"
          name="start-size"
          value={size}
          onChange={setSize}
          options={[
            ...(Object.keys(PAGE_SIZES) as PageSizeId[]).map((k) => ({ value: k, label: PAGE_SIZES[k].label })),
            { value: "custom" as const, label: "Custom" },
          ]}
        />
        {size === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cw" className="mb-1 block text-sm font-semibold">Width (inches)</label>
              <input id="cw" type="number" step="0.1" min="1" max="200" className={inputClass} value={w} onChange={(e) => setW(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ch" className="mb-1 block text-sm font-semibold">Height (inches)</label>
              <input id="ch" type="number" step="0.1" min="1" max="200" className={inputClass} value={h} onChange={(e) => setH(e.target.value)} />
            </div>
            {!customOk && <p role="alert" className="col-span-2 text-sm text-error">Use sizes between 1 and 200 inches.</p>}
          </div>
        )}
        {size !== "custom" && (
          <SegmentedControl
            legend="Orientation"
            name="start-orient"
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: "portrait", label: "Portrait" },
              { value: "landscape", label: "Landscape" },
            ]}
          />
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={size === "custom" && !customOk}
            onClick={() => {
              setEditorStart({
                kind: "blank",
                size: size === "custom" ? { width: Number(w) * 72, height: Number(h) * 72 } : size,
                orientation: size === "custom" ? (Number(w) > Number(h) ? "landscape" : "portrait") : orientation,
              });
              navigate("/editor");
            }}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> Start with a blank page
          </Button>
          <Link to="/free-pdf-templates" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-slate-50">
            <LayoutTemplate className="h-4 w-4" aria-hidden /> Use a template
          </Link>
        </div>
      </div>
    </section>
  );
}

function SavedProjects() {
  const navigate = useNavigate();
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  useEffect(() => {
    listProjects().then(setList).catch(() => setList([]));
  }, []);
  if (!list || list.length === 0) return null;
  return (
    <section aria-labelledby="saved" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 id="saved" className="text-base font-bold text-ink">
        Your saved forms <span className="text-sm font-normal text-muted-strong">(stored in this browser only)</span>
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left"
              onClick={() => {
                setEditorStart({ kind: "project", id: p.id });
                navigate("/editor");
              }}
            >
              <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="block text-xs text-muted-strong">
                  {p.pages} page{p.pages === 1 ? "" : "s"} · {p.fields} field{p.fields === 1 ? "" : "s"} · saved {new Date(p.updatedAt).toLocaleString()}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete saved form ${p.name}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-strong hover:bg-red-50 hover:text-error"
              onClick={async () => {
                if (!window.confirm(`Delete “${p.name}” from this browser? This can't be undone.`)) return;
                await deleteProject(p.id);
                setList((l) => l?.filter((x) => x.id !== p.id) ?? null);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
