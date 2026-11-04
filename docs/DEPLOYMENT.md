# Deployment

The app is a static site plus a small `/api` (Cloudflare Pages Functions + D1) that is used **only for optional purchases**. Document processing never touches it. Free-tier hosting is enough. Check current limits before launch (for example, Cloudflare Pages: max 20,000 files and 25 MiB per file; this build is about 120 files, the largest about 1.3 MB).

## External accounts

| Service | Needed for | Required now? |
| --- | --- | --- |
| Cloudflare (Pages + DNS) | hosting | **Yes** |
| A domain registrar | custom domain | Optional |
| Google AdSense (+ certified CMP) | ads | Optional, see ADVERTISING.md |
| Stripe | optional one-time purchases | Only to sell premium packs; see STRIPE.md |
| Resend | purchase-recovery email | Optional |

## Build
```bash
npm ci
npm test
npm run test:e2e
npm run build      # → dist/
```
Environment variables are documented in `.env.example`. They're all optional, all read at build time, and all public.

## Deploy: Git integration (recommended)
Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
Build command: `npm run build`. Output directory: `dist`. Environment variable: `NODE_VERSION=22` (or newer), plus any `VITE_*` values.

## Deploy: CLI
```bash
npm run build
npx wrangler pages deploy dist --project-name pdfquick-forms
```

## Domain
Pages project → Custom domains → add for example `forms.yourdomain.com`. It's a CNAME to `<project>.pages.dev`, created automatically if the DNS is on Cloudflare.
If your domain isn't `forms.pdfquick.app`, change `site.origin` in `src/content/site.json` and the sitemap line in `public/robots.txt`, then rebuild. Canonical URLs and the sitemap are derived from these.

## Monitoring
- Cloudflare Web Analytics (cookie-less). If you enable it, add its domains to the CSP and update the privacy policy.
- Error reporting (for example Sentry's free tier) isn't wired in. If you add it, disable breadcrumbs and input capture so form values and file names are never sent.

## Backup & rollback
- Documents and projects live only in each visitor's browser. The server holds **purchase records only** (D1).
- D1 has built-in point-in-time recovery (Time Travel): `npx wrangler d1 time-travel restore pdfquick-forms --timestamp=<ISO time>`. Check your plan's retention window. For an extra off-platform copy, run `npx wrangler d1 export pdfquick-forms --remote --output=backup.sql` on a schedule. Stripe remains the system of record for payments.
- Back up the Git repository.
- Rollback: Pages → Deployments → choose a previous deployment → *Rollback*.

## Payments
See [STRIPE.md](STRIPE.md). The D1 binding `DB` is required for `/api` even with payments off. Without it, `/api/products` errors and the premium page shows purchases as unavailable.
