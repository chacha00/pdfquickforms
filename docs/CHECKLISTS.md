# Release checklists

## Security
- [ ] `npm audit --omit=dev` is clean
- [ ] `dist/_headers` is deployed: `curl -I https://<domain>/` shows the CSP, nosniff, X-Frame-Options and HSTS
- [ ] No secrets in any `VITE_*` variable; no `.env` file committed
- [ ] DevTools → Network while uploading, editing and downloading: no requests carry the document

## Performance
- [ ] Lighthouse on `/` and `/make-pdf-fillable` (mobile): check LCP and CLS; ad slots reserve height
- [ ] Open a 100+ page PDF: pages render lazily and the editor stays responsive
- [ ] The PDF engines load only on `/editor` and `/fill` (check the Network tab)

## Accessibility
- [ ] `npm run test:e2e` (axe, WCAG 2.2 AA) passes
- [ ] Build a form using only the keyboard: Tab, arrow keys on the Move tab, Delete, Ctrl+Z
- [ ] Screen reader pass (NVDA or VoiceOver) on the editor and the filler
- [ ] Zoom the browser to 200%: no lost content

## Reader compatibility (manual — required before launch)
For one form with every field type, check each reader: open, fill, save, reopen, print.
- [ ] Adobe Acrobat Reader (also sign the signature field and check date validation)
- [ ] Chrome / Edge
- [ ] Firefox
- [ ] macOS Preview
- [ ] Record any differences in FEATURE_STATUS.md

## Post-deployment
- [ ] Every route in `/sitemap.xml` returns 200 with its own `<title>`
- [ ] `/editor` and `/fill` are `noindex`
- [ ] Submit the sitemap in Google Search Console
- [ ] Run the acceptance flow on production: upload a flat PDF → add a text field and a checkbox → download → fill in a reader → reopen
- [ ] If ads are enabled: the consent banner appears; declining loads no ad script; there are no ads in the editor or filler
