import JSZip from "jszip";
import { uniqueNames } from "./pdf/naming";

export interface OutputFile {
  name: string;
  blob: Blob;
  pages?: number;
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Trigger a browser download of a Blob. The object URL is revoked shortly after. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function zipFiles(files: OutputFile[]): Promise<Blob> {
  const zip = new JSZip();
  const names = uniqueNames(files.map((f) => f.name));
  files.forEach((f, i) => zip.file(names[i]!, f.blob));
  // PDFs and JPGs are already compressed; STORE avoids wasted CPU.
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
