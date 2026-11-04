import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type State =
  | { status: "loading" }
  | { status: "ready"; doc: PDFDocumentProxy; pageCount: number }
  | { status: "error"; message: string };

/** Open a PDF with PDF.js for previews. Destroys the document on unmount / change. */
export function usePdfDocument(bytes: Uint8Array | null): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setState({ status: "loading" });
    import("../lib/pdf/render")
      .then(({ openForRender }) => openForRender(bytes))
      .then((d) => {
        doc = d;
        if (cancelled) {
          void d.loadingTask.destroy();
          return;
        }
        setState({ status: "ready", doc: d, pageCount: d.numPages });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
      if (doc) void doc.loadingTask.destroy();
    };
  }, [bytes]);

  return state;
}
