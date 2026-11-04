import type { WorkerData, WorkerJob, WorkerResponse } from "./workerProtocol";

export class JobError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface JobResult {
  outputs: Uint8Array[];
  data: WorkerData;
}

let nextId = 1;

/** Run one job in a dedicated worker (terminated afterwards, or on cancel). */
export function runPdfJob(job: WorkerJob, onProgress?: (fraction: number) => void): { promise: Promise<JobResult>; cancel: () => void } {
  const id = nextId++;
  const worker = new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), { type: "module" });
  let settled = false;
  let rejectFn: (e: Error) => void = () => {};
  const promise = new Promise<JobResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") return onProgress?.(msg.fraction);
      settled = true;
      worker.terminate();
      if (msg.type === "done") resolve({ outputs: msg.outputs, data: msg.data });
      else reject(new JobError(msg.code, msg.message));
    };
    worker.onerror = () => {
      settled = true;
      worker.terminate();
      reject(new JobError("unexpected", "The processing engine stopped unexpectedly. The file may be too large for this device."));
    };
  });
  worker.postMessage({ ...job, id });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectFn(new JobError("cancelled", "Cancelled."));
    },
  };
}

export async function runJob(job: WorkerJob, onProgress?: (f: number) => void): Promise<JobResult> {
  return runPdfJob(job, onProgress).promise;
}
