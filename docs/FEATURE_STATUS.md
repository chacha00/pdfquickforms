# Feature status — 2026-11-04

| Feature | Status | Evidence |
| --- | --- | --- |
| Upload & render existing PDF (multi-page, mixed sizes, rotation) | Complete · Tested | e2e acceptance; rotation round-trip tests |
| Text / email / phone / date fields | Complete · Tested | integration (values, flags, AA actions), e2e |
| Checkboxes, radio groups, dropdowns, list boxes | Complete · Tested | integration + PDF.js recognition, e2e |
| Signature area (unsigned /Sig field + line) and drawn/typed image | Complete · Tested | integration, e2e |
| Headings, paragraphs, images/logos, dividers, rectangles | Complete · Tested | integration (text found by PDF.js), e2e |
| Move/resize/snap/guides/keyboard positioning/duplicate/delete/layers | Complete · Tested | unit (snap), e2e |
| Undo/redo | Complete · Tested | unit (history), e2e |
| Page add/duplicate/delete/reorder/orientation | Complete · Tested | integration (page tree), e2e |
| Zoom, fit width/page, preview mode with validation | Complete · Tested | e2e |
| Existing AcroForm fields shown, fillable, preserved | Complete · Tested | integration, e2e |
| Fill a PDF (editable / flattened) | Complete · Tested | integration, e2e acceptance |
| Save projects locally (IndexedDB) | Complete · Tested | e2e (reload) |
| 24 templates | Complete · Tested | e2e exports every template |
| Auto-Detect Stage 1 (existing fields) | Complete · Tested | |
| Auto-Detect Stage 2 (text heuristics) | Partial · Tested | unit + e2e; no vector lines/boxes, no tables |
| Auto-Detect Stage 3 (OCR / AI) | Blocked | needs OCR engine |
| SEO: 22 prerendered routes, sitemap, robots, JSON-LD | Complete · Tested | e2e on raw HTML |
| Accessibility (WCAG 2.2 AA via axe) | Tested on 8 pages + editor (design & preview) + filler | axe finds no violations; manual screen-reader testing not done |
| Mobile | Tested (Pixel 7 emulation): no overflow, build + download, fill | real devices not tested |
| Ad slots + consent gate | Built · Tested with placeholders | **Unconfigured**: needs AdSense approval + certified CMP for EEA/UK |
| Stripe one-time purchases (Checkout, webhooks, idempotent fulfillment, refunds, disputes, receipts) | Built · Tested | 27 server tests + 7 Workers-runtime e2e; **unconfigured** until the owner adds Stripe keys (docs/STRIPE.md); live Stripe API calls not exercised |
| Premium pack: Small Business (8 templates), license keys, cross-device keys | Built · Tested | content verified absent from public JS |
| Purchase recovery by email | Built · Tested with a fake mailer | needs a Resend account |
| Credit ledger (atomic, idempotent, restore on failure) | Built · Tested | no credit product sold: nothing consumes credits yet |
| Batch processing | Pending | not built |
| Admin dashboard, analytics backend | Pending | needs backend |
| Edit geometry/properties of *existing* fields | Pending | values only today |
| Unicode fonts (non-Latin, emoji) | Pending | needs font embedding (fontkit) |

## Reader compatibility matrix

| Reader | Status |
| --- | --- |
| PDF.js / Firefox viewer | Automated: every field type recognized as interactive |
| pdf-lib reopen | Automated: names, values, flags, options |
| Chrome / Edge PDF viewer | Not hand-tested (headless Chromium has no PDF viewer) |
| Adobe Acrobat Reader | Not hand-tested |
| macOS Preview | Not hand-tested |

**Before launch**, open an exported form in each reader, fill it, save, and reopen. See docs/CHECKLISTS.md.
