import { Seo } from "../components/layout/Seo";
import { pageMeta } from "../content/site";
import { Badge } from "../components/ui/primitives";

type S = "tested" | "partial" | "pending" | "blocked";
const ROWS: [string, S, string][] = [
  ["Make an existing PDF fillable (upload, render, place fields)", "tested", "Runs in your browser."],
  ["Create a form from scratch (Letter, A4, Legal, custom size)", "tested", ""],
  ["Text, checkbox, radio, dropdown, list box, date, email, phone fields", "tested", "Exported as genuine AcroForm fields; checked with pdf-lib and PDF.js after export."],
  ["Signature area (line + empty signature field) and drawn/typed signature image", "tested", "Images are not digital signatures."],
  ["Headings, paragraphs, images/logos, dividers, rectangles", "tested", "Standard PDF fonts only (Helvetica, Times, Courier)."],
  ["Move, resize, snap-to-grid, alignment guides, keyboard positioning", "tested", ""],
  ["Multi-page: add, duplicate, delete, reorder pages; blank-page orientation", "tested", "Pages with original form fields can't be duplicated."],
  ["Undo / redo, zoom, fit to width / page, preview mode", "tested", ""],
  ["Existing form fields shown in the editor and preserved on export", "tested", "Their position and properties can't be edited yet — only their values."],
  ["Fill a PDF online (editable or flattened download)", "tested", ""],
  ["Save projects in the browser (IndexedDB)", "tested", "Device-local only."],
  ["24 free templates", "tested", ""],
  ["Auto-Detect fields (text-based: underscores, ☐ symbols, “Label:”)", "partial", "Doesn't detect vector-drawn lines/boxes or scanned pages."],
  ["Advertising slots + consent gate", "partial", "Built and tested with placeholders. Live ads need an approved AdSense account and, in the EEA/UK, a Google-certified CMP."],
  ["Reader compatibility", "partial", "Verified with pdf-lib and PDF.js (Firefox's viewer engine). Adobe Acrobat Reader and macOS Preview not yet tested by hand."],
  ["One-time purchases via Stripe Checkout (no subscriptions)", "partial", "Built and tested against Stripe's webhook signing; live payments need the site owner's Stripe account and PAYMENTS_ENABLED=true."],
  ["Premium template pack: Small Business (8 templates)", "partial", "Delivered only to valid licenses. Available once payments are enabled."],
  ["Purchase recovery by email", "partial", "Needs an email provider (Resend) to be configured."],
  ["Batch processing, OCR credits", "pending", "Credit ledger is built; the paid features that would use it are not."],
  ["OCR for scanned PDFs, AI-assisted detection", "blocked", "Needs an OCR engine; not started."],
  ["Admin analytics dashboard", "pending", "Needs a backend; not built."],
];
const TONE = { tested: "green", partial: "amber", pending: "neutral", blocked: "neutral" } as const;
const LABEL = { tested: "Complete · Tested", partial: "Partial", pending: "Not built yet", blocked: "Blocked" } as const;

export function Status() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Seo {...pageMeta("/status")} path="/status" />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Feature status</h1>
      <p className="mt-3 max-w-2xl text-muted-strong">We only call a feature complete when it works, its output is checked, and automated tests pass.</p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-muted-strong">
            <tr>
              <th scope="col" className="px-4 py-3">Feature</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map(([f, s, n]) => (
              <tr key={f}>
                <th scope="row" className="px-4 py-3 font-medium text-ink">{f}</th>
                <td className="whitespace-nowrap px-4 py-3"><Badge tone={TONE[s]}>{LABEL[s]}</Badge></td>
                <td className="px-4 py-3 text-muted-strong">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
