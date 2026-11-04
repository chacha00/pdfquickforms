import { useEffect, useRef, useState } from "react";
import { Button, SegmentedControl, inputClass } from "../../components/ui/primitives";
import type { ProjectImage } from "../../lib/forms/model";

/**
 * Draw or type a signature *appearance*. This is an image placed on the page —
 * not a cryptographic digital signature, and not a legally binding e-signature
 * workflow. The UI says so.
 */
export function SignaturePad({ onDone, onCancel }: { onDone: (img: ProjectImage) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (mode === "type" && typed) {
      ctx.fillStyle = "#0f172a";
      ctx.font = `italic 64px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
      ctx.textBaseline = "middle";
      ctx.fillText(typed, 20, c.height / 2, c.width - 40);
    }
    setHasInk(mode === "type" ? !!typed.trim() : false);
  }, [mode, typed]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };

  async function done() {
    const c = canvas.current!;
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't create image"))), "image/png"));
    onDone({ kind: "png", bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height });
  }

  return (
    <div className="space-y-4">
      <SegmentedControl
        legend="How do you want to add it?"
        name="sig-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "draw", label: "Draw" },
          { value: "type", label: "Type" },
        ]}
      />
      {mode === "type" && (
        <div>
          <label htmlFor="sig-typed" className="mb-1.5 block text-sm font-semibold">
            Your name
          </label>
          <input id="sig-typed" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <canvas
        ref={canvas}
        width={600}
        height={180}
        aria-label={mode === "draw" ? "Signature drawing area. Draw with your mouse, finger or stylus." : "Typed signature preview"}
        role="img"
        className={`w-full touch-none rounded-xl border border-line bg-white ${mode === "draw" ? "cursor-crosshair" : ""}`}
        onPointerDown={(e) => {
          if (mode !== "draw") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#0f172a";
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          setHasInk(true);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <p className="text-xs text-muted-strong">
        This places an image of your signature on the page. It is <strong>not</strong> a cryptographic digital signature and doesn't by itself make a document legally signed.
      </p>
      <div className="flex justify-end gap-2">
        {mode === "draw" && (
          <Button variant="ghost" onClick={() => {
              canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
              setHasInk(false);
            }} disabled={!hasInk}>
            Clear
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void done()} disabled={!hasInk}>
          Use signature
        </Button>
      </div>
    </div>
  );
}
