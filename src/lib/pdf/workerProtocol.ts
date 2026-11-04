import type { Project, ProjectImage } from "../forms/model";
import type { FieldValue, PdfInspection } from "./forms/inspect";
import type { ExportSummary } from "./forms/exportProject";

export type WorkerJob =
  | { op: "inspect"; bytes: Uint8Array }
  | { op: "export"; source: Uint8Array | null; project: Project; images: Record<string, ProjectImage> }
  | { op: "fill"; bytes: Uint8Array; values: Record<string, FieldValue>; flatten: boolean };

export type WorkerData = PdfInspection | ExportSummary | null;

export type WorkerRequest = WorkerJob & { id: number };

export type WorkerResponse =
  | { id: number; type: "progress"; fraction: number }
  | { id: number; type: "done"; outputs: Uint8Array[]; data: WorkerData }
  | { id: number; type: "error"; code: string; message: string };
