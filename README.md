# PDFQuick Forms

**Make Any PDF Fillable. Free. Fast. Easy.**

A browser-based editor that turns existing PDFs into fillable forms and builds new forms from scratch. Downloads contain genuine interactive **AcroForm** fields. Documents are processed in the browser and never uploaded. Free, with no accounts, no watermarks and **no subscriptions**.

## What works (tested)

- **Make a PDF fillable** (`/make-pdf-fillable`): upload a PDF, place fields, preview, and download. The original content and any existing form fields are preserved.
- **Create from scratch** (`/create-fillable-pdf`): US Letter, A4, Legal or custom page sizes, portrait or landscape. Includes 24 free templates.
- **Field types**: text (single/multiline, max length, alignment, default value), checkbox, radio group, dropdown (optionally editable), list box (optionally multi-select), date (Acrobat format actions), email, phone, and signature area (an unsigned `/Sig` field plus an optional drawn or typed signature image).
- **Layout elements**: heading, paragraph, image/logo, divider, rectangle. Fonts are Helvetica, Times or Courier; colors and borders are configurable.
- **Editor**: click-to-place and drag-to-place; move and resize; snap to grid and alignment guides; keyboard positioning; duplicate; delete; layer order; undo/redo; zoom, fit to width and fit to page; preview mode with validation.
- **Pages**: add, duplicate, delete, reorder, and change the orientation of blank pages.
- **Existing fields**: shown in the editor as **Existing**, can be filled, and are kept on export (never flattened).
- **Auto-Detect** (free, runs locally): suggests fields from underscore lines, `[ ]`/☐ boxes and `Label:` text. You review every suggestion before export.
- **Fill a PDF** (`/fill-pdf-online`): download an editable or a flattened copy.
- **Save projects** in the browser (IndexedDB, on this device only).
- **SEO**: 22 prerendered routes with unique metadata, JSON-LD and FAQs, plus a sitemap and robots.txt.
- **Ads**: an allow-list of placements, a consent gate, and labeled placeholders in development. **Disabled until configured.**
- **One-time purchases** (Stripe Checkout, `mode: "payment"` only; **no subscriptions**): the Small Business Forms Pack, $4.99, with 8 premium templates delivered server-side to license holders. Includes idempotent webhooks, refund and dispute revocation, receipts, cross-device license keys and optional email recovery. **Off until configured**; see [docs/STRIPE.md](docs/STRIPE.md).

Not built yet: batch processing, OCR, and an admin dashboard. See [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

## Quick start

```bash
npm install
npm run dev                         # http://localhost:5173
npm test                            # Vitest unit + integration + server (146 tests)
npx playwright install chromium     # first time
npm run test:e2e                    # builds, serves prod build on :4174, Playwright + axe (64 tests)
npm run test:payments               # payments e2e in the Cloudflare Workers runtime + local D1 (7 tests)
npm run build                       # dist/ — static, prerendered
```

`npm run fixtures` regenerates the test PDFs.

## Layout

```
src/
  lib/coordinates/geometry.ts   display ⇄ PDF user-space mapping (rotation, crop box, pdf-lib widget quirks)
  lib/forms/model.ts            document model, names, validation
  lib/forms/{history,snap,detect,templates}.ts
  lib/pdf/forms/exportProject.ts  project → PDF with AcroForm fields (+ verification)
  lib/pdf/forms/inspect.ts      read existing fields, fill PDFs
  lib/storage/projects.ts       IndexedDB
  workers/pdf.worker.ts         pdf-lib work off the main thread
  features/editor/*             editor UI (canvas, properties, pages, auto-detect)
  features/fill/FillTool.tsx    fill tool
  components/advertising/*      AdSlot, consent
  content/site.json             all page copy, FAQs, guides (shared with prerender)
scripts/prerender.mjs           SEO HTML per route, sitemap, CSP for ads
public/_headers                 CSP + security headers (Cloudflare Pages)
tests/unit, tests/integration, tests/e2e
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Advertising](docs/ADVERTISING.md) · [Feature status](docs/FEATURE_STATUS.md) · [Release checklists](docs/CHECKLISTS.md)
