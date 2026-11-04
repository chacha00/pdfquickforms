/// <reference lib="webworker" />
/**
 * Runs pdf-lib work off the main thread so large documents don't freeze the UI.
 * Cancellation = the client terminates this worker.
 */
import { PdfError } from "../lib/pdf/engine";
import { inspectPdf, fillPdf } from "../lib/pdf/forms/inspect";
import { exportProject } from "../lib/pdf/forms/exportProject";
import type { WorkerData, WorkerRequest, WorkerResponse } from "../lib/pdf/workerProtocol";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const progress = (fraction: number) => post({ id: req.id, type: "progress", fraction });
  try {
    let outputs: Uint8Array[] = [];
    let data: WorkerData = null;
    switch (req.op) {
      case "inspect":
        data = await inspectPdf(req.bytes);
        break;
      case "export": {
        const r = await exportProject({ source: req.source, project: req.project, images: req.images }, progress);
        outputs = [r.bytes];
        data = r.summary;
        break;
      }
      case "fill":
        outputs = [await fillPdf(req.bytes, req.values, { flatten: req.flatten })];
        break;
      default: {
        const never: never = req;
        throw new Error(`Unknown operation ${(never as { op: string }).op}`);
      }
    }
    post({ id: req.id, type: "done", outputs, data }, outputs.map((o) => o.buffer as ArrayBuffer));
  } catch (err) {
    const code = err instanceof PdfError ? err.code : "unexpected";
    const message = err instanceof PdfError ? err.message : "Something went wrong while processing. Your file was not changed.";
    if (!(err instanceof PdfError)) console.warn("[pdfquick-forms worker]", err);
    post({ id: req.id, type: "error", code, message });
  }
};
