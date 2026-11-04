import { detectKind, KIND_LABEL, type DetectedKind } from "./fileSignature";
import { formatBytes } from "../format";

export interface FileRules {
  accept: Exclude<DetectedKind, "unknown">[];
  maxFileBytes: number;
  maxFiles: number;
  maxTotalBytes: number;
}

export interface AcceptedFile {
  id: string;
  file: File;
  kind: Exclude<DetectedKind, "unknown">;
  bytes: Uint8Array;
}

export interface Rejection {
  name: string;
  reason: string;
}

let counter = 0;
export function newId(prefix = "f"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Read and validate files locally. Nothing is uploaded: File.arrayBuffer()
 * reads from the user's disk into memory in this tab.
 */
export async function validateFiles(
  files: File[],
  rules: FileRules,
  alreadySelected: { count: number; bytes: number },
): Promise<{ accepted: AcceptedFile[]; rejected: Rejection[] }> {
  const accepted: AcceptedFile[] = [];
  const rejected: Rejection[] = [];
  let count = alreadySelected.count;
  let total = alreadySelected.bytes;
  const allowed = rules.accept.map((k) => KIND_LABEL[k]).join(", ");

  for (const file of files) {
    if (count >= rules.maxFiles) {
      rejected.push({ name: file.name, reason: `You can add up to ${rules.maxFiles} file${rules.maxFiles === 1 ? "" : "s"} for this tool.` });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: "The file is empty." });
      continue;
    }
    if (file.size > rules.maxFileBytes) {
      rejected.push({ name: file.name, reason: `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(rules.maxFileBytes)} per file.` });
      continue;
    }
    if (total + file.size > rules.maxTotalBytes) {
      rejected.push({ name: file.name, reason: `Adding this file would exceed the ${formatBytes(rules.maxTotalBytes)} total limit.` });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      rejected.push({ name: file.name, reason: "The file could not be read from your device." });
      continue;
    }
    const kind = detectKind(bytes.subarray(0, 1100));
    if (kind === "unknown" || !rules.accept.includes(kind)) {
      const got = kind === "unknown" ? "an unsupported file type" : `a ${KIND_LABEL[kind]}`;
      rejected.push({ name: file.name, reason: `This looks like ${got}. Accepted: ${allowed}.` });
      continue;
    }
    accepted.push({ id: newId(), file, kind, bytes });
    count += 1;
    total += file.size;
  }
  return { accepted, rejected };
}
