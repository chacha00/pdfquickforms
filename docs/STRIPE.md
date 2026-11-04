# One-time purchases with Stripe

**One-time payments only.** Every Checkout Session is created with `mode: "payment"`, and the webhook ignores any other mode. There are no subscription tables and no recurring billing. All the free tools stay free; payments only unlock optional premium template packs.

## Managed Payments (Stripe is merchant of record)
Chosen after running Stripe's integration planner (path: Stripe only → web → digital goods with Managed Payments → hosted Checkout). Sessions are created with `managed_payments: { enabled: true }`, so **Stripe is the merchant of record**. It calculates, collects, files and remits sales tax, VAT and GST in 80+ countries, and it handles fraud, disputes and transaction-level buyer support. Receipts and invoices come from Stripe ("Sold through Link").

What this changes in the code:
- `price_data.product_data.tax_code` is set from `taxCode` in `src/content/catalog.json` (currently `txcd_10000000`, the planner's default for electronically supplied services). **Confirm that the classification fits your products.** It must be an eligible code: docs.stripe.com/payments/managed-payments/eligibility.
- **Adaptive Pricing is always on**, so buyers may pay in their own currency, and tax is added on top. Fulfillment therefore checks the **pre-tax price in the original currency** (`currency_conversion.amount_subtotal` / `source_currency`, or `amount_subtotal` / `currency` when there's no conversion) against the catalog. It does not check `amount_total`. This is tested with a EUR-plus-VAT session, a US sales-tax session, and a tampered converted session.
- Parameters Managed Payments doesn't allow are never sent: `automatic_tax`, `tax_id_collection`, `invoice_creation`, `custom_text`, `payment_method_types`, statement descriptors and shipping. A test enforces this.
- Set `STRIPE_MANAGED_PAYMENTS="false"` to fall back to standard Checkout, where you are the merchant of record. For example, use it while your Managed Payments eligibility review is pending. Without Managed Payments you're responsible for tax.

Requirements: accept the Managed Payments terms at Dashboard → Settings → Managed Payments and pass Stripe's eligibility review (direct account, supported country, digital goods only). Fees differ from standard payments; see stripe.com/pricing. Stripe may issue refunds itself within 60 days to prevent chargebacks. Those arrive as `charge.refunded` and revoke the license like any other refund.

## How it works

```
Browser                      Pages Function (/api)                 Stripe
  │ POST /api/checkout {productId} ─▶ price from server catalog ─▶ Checkout Session (mode=payment)
  │ ◀──────────────────────── { url } ◀───────────────────────────
  │ ── redirect ─────────────────────────────────────────────────▶ hosted checkout
  │                                   ◀── checkout.session.completed (signed webhook)
  │                                       verify signature → D1 batch: purchase + license (+credits)
  │ ◀── /purchase/success?session_id=… 
  │ POST /api/purchase/claim ───────▶ paid? (DB, or retrieve from Stripe if the webhook is late)
  │ ◀── { licenseKey, receiptUrl }
  │ GET /api/packs/:id  (Bearer key) ▶ valid, unrefunded license → template JSON
```

- **Prices** live in `src/content/catalog.json`, which the server reads too. The client only ever sends a product ID. Fulfillment rejects any session whose `amount_total` or currency differs from the catalog.
- **Idempotency**: `payment_events.stripe_event_id` is unique; purchases are keyed by Checkout Session ID; licenses by purchase; credit grants and spends by idempotency key. Every fulfillment is one D1 batch (one transaction). Duplicate deliveries, retries and a racing claim all produce exactly one purchase and one license. This is tested.
- **License keys** are `PQF-XXXXX-XXXXX-XXXXX-XXXXX`, an HMAC of the purchase ID under `LICENSE_SECRET`. They are **never stored**; the database holds only a SHA-256 hash. Keys are re-derived on claim and for email recovery.
- **Refunds and disputes**: a full refund (`charge.refunded` with `refunded: true`) or `charge.dispute.created` marks the purchase refunded or disputed, deactivates the license and revokes remaining credits. Partial refunds are recorded in the audit log only.
- **Delayed payment methods**: `checkout.session.completed` with `payment_status: unpaid` records a pending purchase. `async_payment_succeeded` then fulfills it, and `async_payment_failed` marks it failed.
- **Premium content** lives in `server/premium/packs.ts` and is only sent by `/api/packs/:id` to valid licenses. A test scans every built JS file to confirm template content is not in the public bundle.
- **Credits** (`server/credits.ts`): an append-only ledger, where the balance is the sum. Spending is a single conditional INSERT (atomic, no overdraft), idempotent per job, and `restoreCredits` returns credits when a job fails. There's no credit product in the catalog yet, because nothing consumes credits today.

## Accounts you need
| Service | Purpose |
| --- | --- |
| Stripe | payments, receipts, refunds |
| Cloudflare (Pages + D1) | hosting, API, database |
| Resend (optional) | "Lost your key?" email recovery. Without it, recovery says it isn't configured |

## Setup

1. **Create the D1 database**
   ```bash
   npx wrangler d1 create pdfquick-forms        # copy the database_id into wrangler.toml
   npx wrangler d1 migrations apply pdfquick-forms --remote
   ```
   In the Pages project, go to Settings → Bindings → add D1 binding `DB` pointing to `pdfquick-forms`.

2. **Stripe keys.** Use a **restricted key** (`rk_…`), not your secret key. It needs:
   - Checkout Sessions: **Write**
   - PaymentIntents: **Read**, Charges: **Read** (for receipt links on `retrieve`)

   Start in **test mode** (use a sandbox: `stripe sandbox create`, or the Dashboard).

3. **Webhook endpoint.** In Dashboard → Developers → Webhooks, add `https://<your-domain>/api/stripe-webhook` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`.
   Copy the signing secret (`whsec_…`). For defense in depth you can also allowlist [Stripe's webhook IPs](https://docs.stripe.com/ips) in Cloudflare WAF.

4. **Secrets** (Cloudflare dashboard → Pages → Settings → Variables and secrets, as *encrypted*), or:
   ```bash
   npx wrangler pages secret put STRIPE_SECRET_KEY        # rk_test_… then later rk_live_…
   npx wrangler pages secret put STRIPE_WEBHOOK_SECRET    # whsec_…
   npx wrangler pages secret put LICENSE_SECRET           # 32+ random chars: openssl rand -base64 48
   npx wrangler pages secret put RESEND_API_KEY           # optional
   ```
   Plain variables go in `wrangler.toml` `[vars]`: `PUBLIC_ORIGIN`, `EMAIL_FROM`, and `PAYMENTS_ENABLED`. Purchases stay off until `PAYMENTS_ENABLED="true"` **and** all three secrets are present. The premium page then enables its Buy button automatically.
   **Never rotate `LICENSE_SECRET` after launch**, because existing keys would stop working.

5. **Stripe settings to review**
   - Settings → Managed Payments: accept the terms and check the eligibility status.
   - Settings → Emails: receipts are sent by Stripe under Managed Payments. Without it, turn on *Successful payments* receipts.
   - Settings → Payment methods: dynamic payment methods are used (the code never sets `payment_method_types`).
   - **Tax**: with Managed Payments on, Stripe handles it; don't enable `automatic_tax` (it's not allowed). If you turn Managed Payments off, tax becomes your responsibility. Only enable Stripe Tax after registering, or it collects nothing while appearing to be on.
   - Public business details, support email, and statement descriptor.

6. **Test end to end in test mode**
   ```bash
   stripe listen --forward-to https://<preview-domain>/api/stripe-webhook   # or use the Dashboard endpoint
   ```
   Pay with `4242 4242 4242 4242`, then check the success page, the key, the templates, and the receipt. Refund the payment in the Dashboard and check that the key stops working. Try `4000 0000 0000 0002` (declined).

7. **Go live**: swap in `rk_live_…`, add a live webhook endpoint and its `whsec_…`, and work through Stripe's [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).

## Local development of the API
```bash
npm run build
npx wrangler d1 migrations apply pdfquick-forms --local
# .dev.vars (gitignored): PAYMENTS_ENABLED, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, LICENSE_SECRET, PUBLIC_ORIGIN
npx wrangler pages dev dist
```

## Tests
- `npm test`: 27 server tests on real SQL (the migration file on Node's SQLite), real Stripe SDK signature generation and verification, and a fake for the two Stripe API calls.
- `npm run test:payments`: 7 browser tests in **Cloudflare's Workers runtime** (`wrangler pages dev` + local D1). Webhooks are signed exactly as Stripe signs them; the redirect to Stripe's hosted page is simulated.
- **Not tested here**: calls to the live Stripe API (`checkout.sessions.create` and `retrieve` with real keys), and Stripe's hosted checkout page. Do step 6 before launch.
