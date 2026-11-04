import { useId, useRef, useState, type DragEvent } from "react";
import { UploadCloud, ShieldCheck } from "lucide-react";
import { validateFiles, type AcceptedFile, type FileRules, type Rejection } from "../../lib/validation/validateFiles";
import { KIND_MIME } from "../../lib/validation/fileSignature";
import { formatBytes } from "../../lib/format";
import { Alert, Button } from "../ui/primitives";

interface Props {
  rules: FileRules;
  multiple: boolean;
  onAccepted: (files: AcceptedFile[]) => void;
  existing?: { count: number; bytes: number };
  title?: string;
  compact?: boolean;
}

export function FileDropzone({ rules, multiple, onAccepted, existing = { count: 0, bytes: 0 }, title, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<Rejection[]>([]);
  const hintId = useId();

  const acceptAttr = [
    ...rules.accept.map((k) => KIND_MIME[k]),
    ...rules.accept.flatMap((k) => (k === "jpeg" ? [".jpg", ".jpeg"] : [`.${k}`])),
  ].join(",");
  const typeLabel = rules.accept.map((k) => (k === "jpeg" ? "JPG" : k.toUpperCase())).join(", ");

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    const files = multiple ? Array.from(list) : [list[0]!];
    const { accepted, rejected } = await validateFiles(files, rules, existing);
    setRejected(rejected);
    setBusy(false);
    if (accepted.length) onAccepted(accepted);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors ${
          compact ? "px-4 py-6" : "px-6 py-12 sm:py-16"
        } ${dragging ? "border-primary bg-primary-soft" : "border-slate-300 bg-surface"}`}
      >
        {!compact && <UploadCloud className="mb-4 h-12 w-12 text-primary" aria-hidden />}
        <p className={`font-semibold text-ink ${compact ? "text-base" : "text-lg"}`}>
          {title ?? (multiple ? `Drop ${typeLabel} files here` : `Drop a ${typeLabel} file here`)}
        </p>
        <p className="mt-1 text-sm text-muted-strong">or</p>
        <Button
          size={compact ? "md" : "lg"}
          className="mt-3"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby={hintId}
        >
          {busy ? "Reading…" : multiple ? "Choose files" : "Choose file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept={acceptAttr}
          multiple={multiple}
          onChange={(e) => void handle(e.target.files)}
          data-testid="file-input"
        />
        <p id={hintId} className="mt-4 text-xs text-muted-strong">
          {typeLabel} · up to {formatBytes(rules.maxFileBytes)} per file{multiple ? ` · up to ${rules.maxFiles} files` : ""}
        </p>
        {!compact && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success-ink">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Files are opened on your device. Nothing is uploaded.
          </p>
        )}
      </div>
      {rejected.length > 0 && (
        <Alert tone="error" title={rejected.length === 1 ? "1 file wasn't added" : `${rejected.length} files weren't added`}>
          <ul className="list-disc space-y-1 pl-4">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="font-medium break-all">{r.name}</span>: {r.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
