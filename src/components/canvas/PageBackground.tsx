import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Renders one page of a PDF as an image sized to `width` CSS px (at device
 * pixel ratio), without form widgets. Re-renders when zoom changes enough to
 * matter, lazily (only when near the viewport). Blank pages render white.
 */
export function PageBackground({ doc, index, width, height }: { doc: PDFDocumentProxy | null; index: number | null; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [img, setImg] = useState<{ url: string; width: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Render target in device pixels; only re-render when it changes by >20%.
  const target = Math.round(Math.min(2400, width * Math.min(2, window.devicePixelRatio || 1)));
  const stale = !img || Math.abs(img.width - target) / target > 0.2;

  useEffect(() => {
    if (!doc || index === null || !visible || !stale || target <= 0) return;
    let cancelled = false;
    let url: string | null = null;
    const t = setTimeout(async () => {
      try {
        const { renderPageToCanvas, canvasToBlob } = await import("../../lib/pdf/render");
        const page = await doc.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, index + 1, target / base.width, { hideFormFields: true });
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
        canvas.width = canvas.height = 0;
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImg((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: url!, width: target };
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, img ? 150 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, index, visible, stale, target, img]);

  const latest = useRef<string | null>(null);
  latest.current = img?.url ?? null;
  useEffect(() => () => {
    if (latest.current) URL.revokeObjectURL(latest.current);
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 bg-white" style={{ width, height }} aria-hidden>
      {index !== null && img && <img src={img.url} alt="" draggable={false} className="block h-full w-full select-none" />}
      {index !== null && !img && !failed && <div className="h-full w-full animate-pulse bg-slate-100" />}
      {failed && <div className="flex h-full items-center justify-center text-sm text-muted-strong">Preview unavailable for this page</div>}
    </div>
  );
}
