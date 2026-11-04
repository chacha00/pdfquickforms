# Architecture

## Stack
React 19 + TypeScript (strict) + Vite 8, React Router 8, Tailwind 4, Lucide, self-hosted Inter. **pdf-lib** for AcroForm creation and editing, run in a Web Worker. **PDF.js** (pdfjs-dist 6) for rendering and text extraction, with self-hosted CMaps, fonts and WASM. **IndexedDB** for saved projects. The site is static on Cloudflare Pages, with **no backend** today.

## Processing boundary
Everything happens in the browser: rendering, editing, auto-detect, export, filling and saving. No request ever carries a document; this is enforced by the CSP (`connect-src 'self'`) and asserted in an e2e test, which checks that no non-GET requests are made during upload, detect and export.

## Coordinates (`lib/coordinates/geometry.ts`)
The editor stores every element in **display space**: PDF points, top-left origin, with the page's `/Rotate` already applied. That's what the user sees at any zoom level. One module maps between display space and PDF user space for all four rotations and any crop-box offset (`displayToUser`, `userToDisplay`, and the rectangle variants).

`widgetPlacement` also inverts pdf-lib's behavior for `addToPage({rotate, borderWidth})`, which rotates the rectangle around (x, y) and grows it by half the border width. With that correction, widgets land exactly where they were drawn on rotated pages. This is verified by round-trip tests for 0/90/180/270°.

## Export (`lib/pdf/forms/exportProject.ts`)
1. Load the uploaded PDF and work on it **in place**, which keeps text, fonts, images and existing AcroForm fields. Any XFA layer is removed, with a warning, so every reader shows the same AcroForm.
2. Rebuild the page tree from the project's page list (reorder, delete, insert blank, duplicate). Fields whose widgets were only on deleted pages are removed. Duplicating a page that has its own original fields is refused, because the copied widgets would be orphans.
3. Apply values typed into existing fields.
4. Draw layout elements as page content, then create fields: text, checkbox, radio (one group, one widget per option), dropdown, list box, and signature (a low-level unsigned `/Sig` widget). Required, read-only, tooltip (`/TU`), default value (`/V` + `/DV`), max length, alignment and font size are set. Date fields get `AFDate_*` JavaScript actions, which only Acrobat-family readers run.
5. Generate appearances per field with that field's font, then save with `updateFieldAppearances: false`, so pdf-lib doesn't overwrite them with Helvetica.
6. **Verify**: re-open the output and check that every expected field name exists and the page count matches. Otherwise fail with a clear error.

Unaccepted Auto-Detect suggestions are never exported.

## Reader compatibility
Integration tests load each export with **PDF.js**, the engine inside Firefox's built-in PDF viewer, and assert that every widget is recognized as an interactive field (`Tx`, `Btn`, `Ch`, `Sig`). Chrome, Edge, Acrobat and Preview implement the same AcroForm standard but were **not** tested by hand. Known differences:
- Acrobat enforces date formats and required fields; most browsers don't.
- Only Acrobat-family readers let people sign `/Sig` fields.
- Text uses the standard 14 fonts, so it's WinAnsi only. Unsupported characters are rejected with the field's name.

## Editor state
`features/editor/useEditor.ts`: an immutable document (`pages`, `elements`, `existingValues`) inside an undo/redo history (`lib/forms/history.ts`). Rapid edits such as drags and typing coalesce into a single undo step. Selection, tool, zoom and preview values live outside history.

## Ads
`components/advertising`. Ads only appear in placements on an allow-list (home, templates, guides, landing-page content). The editor and filler never render an `AdSlot`, and a test enforces this. The AdSense script is injected only after consent. When `VITE_ADSENSE_CLIENT` is unset, there are no ads and no banner, and no third-party requests (also tested). The prerender script extends the CSP only when ads are configured.

## Payments (`server/`, `functions/api/[[path]].ts`, `migrations/`)
Cloudflare Pages Functions with D1 (SQLite) were chosen over Supabase: same platform, one less account, and transactional `batch()` writes. Handlers are pure functions over `{ db, stripe, env, now, fetch }`, so the same code is tested in Node (with Node's SQLite) and runs in workerd. The full design is in [STRIPE.md](STRIPE.md). One-time `mode: "payment"` only; there are no subscription tables and no recurring billing.

## Not built
Batch processing, OCR and the admin dashboard.
