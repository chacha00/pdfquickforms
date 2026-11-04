/**
 * HTTP handlers for /api/*. Pure: everything external comes in via `deps`,
 * so the same code runs on Cloudflare Pages Functions and in Node tests.
 * One-time payments only — Checkout is always created with mode "payment".
 */
import type Stripe from "stripe";
import { catalog, productById } from "./catalog";
import { balance } from "./credits";
import { LICENSE_RE, licenseKeyFor, normalizeLicenseKey, randomLetters, sha256Hex } from "./crypto";
import { alreadyProcessed, findLicense, recordCheckoutSession, reversePayment } from "./fulfillment";
import { HttpError, checkOrigin, clientIp, errorResponse, json, paymentsEnabled, rateLimit, readJson, requirePayments } from "./http";
import { PACKS } from "./premium/packs";
import type { Deps } from "./types";

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export const managedPayments = (deps: Deps) => deps.env.STRIPE_MANAGED_PAYMENTS !== "false";

function origin(req: Request, deps: Deps) {
  return deps.env.PUBLIC_ORIGIN || new URL(req.url).origin;
}

// ------------------------------------------------------------ GET /api/products
export async function productsHandler(_req: Request, deps: Deps): Promise<Response> {
  return json(
    {
      paymentsEnabled: paymentsEnabled(deps.env),
      products: catalog()
        .filter((p) => p.active)
        .map(({ id, kind, name, description, amount, currency, packId, includes }) => ({ id, kind, name, description, amount, currency, packId, includes })),
    },
    200,
    { "cache-control": "public, max-age=60" },
  );
}

// ------------------------------------------------------------ POST /api/checkout
export async function checkoutHandler(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    requirePayments(deps.env);
    checkOrigin(req, deps.env);
    await rateLimit(deps, `checkout:${clientIp(req)}`, 20, 600);
    const body = await readJson<{ productId?: unknown }>(req);
    const product = typeof body.productId === "string" ? productById(body.productId) : undefined;
    if (!product || !product.active) throw new HttpError(404, "That product isn't available.", "unknown_product");

    const base = origin(req, deps);
    const session = await deps.stripe!.checkout.sessions.create({
      mode: "payment", // one-time purchase — never "subscription"
      line_items: [
        {
          quantity: 1,
          // Price comes from the server catalog, never from the client.
          price_data: {
            currency: product.currency,
            unit_amount: product.amount,
            product_data: { name: product.name, description: product.description, ...(product.taxCode ? { tax_code: product.taxCode } : {}) },
          },
        },
      ],
      success_url: `${base}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/premium?canceled=1`,
      metadata: { product_id: product.id },
      payment_intent_data: { metadata: { product_id: product.id } },
      customer_creation: "if_required",
      integration_identifier: `pdfquick-forms-${product.id}-${randomLetters(8)}`,
      submit_type: "pay",
      // Managed Payments: Stripe is merchant of record (tax/VAT/GST, fraud, disputes). Adaptive Pricing is always on.
      // Do not add automatic_tax, tax_id_collection, invoice_creation, custom_text or statement descriptors — unsupported with it.
      ...(managedPayments(deps) ? { managed_payments: { enabled: true } } : {}),
      // Dynamic payment methods: payment_method_types is intentionally omitted.
    });
    if (!session.url) throw new HttpError(502, "Stripe didn't return a checkout page.", "stripe_no_url");
    return json({ url: session.url });
  } catch (e) {
    return errorResponse(e);
  }
}

// ------------------------------------------------------------ POST /api/stripe-webhook
export async function webhookHandler(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    if (!deps.env.STRIPE_WEBHOOK_SECRET || !deps.stripe) throw new HttpError(503, "Webhooks aren't configured.", "payments_disabled");
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Missing signature.", "bad_signature");
    const payload = await req.text(); // raw body — must not be re-serialized before verification
    if (payload.length > 1_000_000) throw new HttpError(413, "Payload too large.", "too_large");
    let event: Stripe.Event;
    try {
      event = await deps.stripe.webhooks.constructEventAsync(payload, signature, deps.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new HttpError(400, "Invalid signature.", "bad_signature");
    }
    if (await alreadyProcessed(deps.db, event.id)) return json({ received: true, duplicate: true });
    const now = deps.now();

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await recordCheckoutSession(deps.db, deps.env, event.data.object as Stripe.Checkout.Session, event, now);
        break;
      case "checkout.session.async_payment_failed":
        await recordCheckoutSession(deps.db, deps.env, event.data.object as Stripe.Checkout.Session, event, now, "failed");
        break;
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
        await reversePayment(deps.db, pi, "refunded", event, now, charge.refunded === true);
        break;
      }
      case "charge.dispute.created": {
        const d = event.data.object as Stripe.Dispute;
        const pi = typeof d.payment_intent === "string" ? d.payment_intent : (d.payment_intent?.id ?? null);
        await reversePayment(deps.db, pi, "disputed", event, now);
        break;
      }
      default:
        // Acknowledge other events so Stripe doesn't retry them; record for audit.
        await deps.db
          .prepare("INSERT INTO payment_events (stripe_event_id, type, object_id, received_at) VALUES (?, ?, NULL, ?) ON CONFLICT(stripe_event_id) DO NOTHING")
          .bind(event.id, event.type, now.toISOString())
          .run();
    }
    return json({ received: true });
  } catch (e) {
    // 4xx = permanent (bad signature); 5xx makes Stripe retry later.
    return errorResponse(e);
  }
}

// ------------------------------------------------------------ POST /api/purchase/claim
/** Called by the success page. Works even if the webhook hasn't arrived yet. */
export async function claimHandler(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    requirePayments(deps.env);
    checkOrigin(req, deps.env);
    await rateLimit(deps, `claim:${clientIp(req)}`, 30, 600);
    const { sessionId } = await readJson<{ sessionId?: unknown }>(req);
    if (typeof sessionId !== "string" || !SESSION_RE.test(sessionId)) throw new HttpError(400, "Invalid purchase reference.", "bad_session");

    let row = await deps.db
      .prepare("SELECT id, status, product_id, email, receipt_url FROM purchases WHERE checkout_session_id = ?")
      .bind(sessionId)
      .first<{ id: string; status: string; product_id: string; email: string | null; receipt_url: string | null }>();

    if (!row || row.status === "pending" || !row.receipt_url) {
      // Webhook may be late: ask Stripe directly, then fulfil idempotently.
      let session: Stripe.Checkout.Session;
      try {
        session = await deps.stripe!.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] });
      } catch {
        throw new HttpError(404, "We couldn't find that purchase.", "unknown_session");
      }
      const r = await recordCheckoutSession(deps.db, deps.env, session, null, deps.now());
      if (r.status === "rejected") throw new HttpError(409, "This payment couldn't be matched to a product. Contact support with your receipt.", "rejected");
      row = await deps.db
        .prepare("SELECT id, status, product_id, email, receipt_url FROM purchases WHERE checkout_session_id = ?")
        .bind(sessionId)
        .first();
    }
    if (!row) throw new HttpError(404, "We couldn't find that purchase.", "unknown_session");
    if (row.status === "pending") return json({ status: "pending" }, 202);
    if (row.status !== "paid") return json({ status: row.status, error: `This purchase is ${row.status}.` }, 409);

    const product = productById(row.product_id);
    return json({
      status: "paid",
      licenseKey: await licenseKeyFor(deps.env.LICENSE_SECRET!, row.id),
      productId: row.product_id,
      productName: product?.name ?? row.product_id,
      packId: product?.packId ?? null,
      receiptUrl: row.receipt_url,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ------------------------------------------------------------ helpers for license-authenticated routes
async function requireLicense(req: Request, deps: Deps) {
  const auth = req.headers.get("authorization") ?? "";
  const key = normalizeLicenseKey(auth.replace(/^Bearer\s+/i, ""));
  if (!key) throw new HttpError(401, "A valid license key is required.", "no_license");
  await rateLimit(deps, `license:${clientIp(req)}`, 60, 600);
  const lic = await findLicense(deps.db, key);
  if (!lic) throw new HttpError(401, "That license key isn't recognized.", "bad_license");
  if (lic.status !== "paid") throw new HttpError(403, `This purchase was ${lic.status}, so its license is no longer active.`, "license_revoked");
  return lic;
}

// ------------------------------------------------------------ GET /api/packs/:id
export async function packHandler(req: Request, deps: Deps, packId: string): Promise<Response> {
  try {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed.");
    const lic = await requireLicense(req, deps);
    const product = productById(lic.product_id);
    if (!product || product.packId !== packId || !PACKS[packId]) throw new HttpError(403, "This license doesn't include that pack.", "not_entitled");
    await deps.db.prepare("INSERT INTO premium_downloads (license_id, pack_id, created_at) VALUES (?, ?, ?)").bind(lic.license_id, packId, deps.now().toISOString()).run();
    return json({
      packId,
      name: product.name,
      templates: PACKS[packId]!.map((t) => ({ id: t.id, title: t.title, description: t.description, ...t.build() })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ------------------------------------------------------------ GET /api/license
export async function licenseHandler(req: Request, deps: Deps): Promise<Response> {
  try {
    const lic = await requireLicense(req, deps);
    const product = productById(lic.product_id);
    return json({
      productId: lic.product_id,
      productName: product?.name ?? lic.product_id,
      packId: product?.packId ?? null,
      credits: await balance(deps.db, lic.license_id),
      receiptUrl: lic.receipt_url,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ------------------------------------------------------------ POST /api/purchase/restore
/** Email the license keys for an address. Responds the same whether or not purchases exist. */
export async function restoreHandler(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    requirePayments(deps.env);
    checkOrigin(req, deps.env);
    if (!deps.env.RESEND_API_KEY || !deps.env.EMAIL_FROM) throw new HttpError(501, "Email recovery isn't set up on this site. Contact support with your Stripe receipt.", "email_disabled");
    const { email } = await readJson<{ email?: unknown }>(req);
    if (typeof email !== "string" || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email.trim())) throw new HttpError(400, "Enter a valid email address.", "bad_email");
    const addr = email.trim().toLowerCase();
    await rateLimit(deps, `restore-ip:${clientIp(req)}`, 5, 3600);
    await rateLimit(deps, `restore-email:${await sha256Hex(addr)}`, 3, 86400);

    const { results } = await deps.db
      .prepare("SELECT id, product_id FROM purchases WHERE email = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 20")
      .bind(addr)
      .all<{ id: string; product_id: string }>();
    if (results.length) {
      const lines = await Promise.all(results.map(async (r) => `${productById(r.product_id)?.name ?? r.product_id}: ${await licenseKeyFor(deps.env.LICENSE_SECRET!, r.id)}`));
      const base = origin(req, deps);
      const res = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${deps.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: deps.env.EMAIL_FROM,
          to: [addr],
          subject: "Your PDFQuick Forms license keys",
          text: `Here are the license keys for purchases made with this email address:\n\n${lines.join("\n")}\n\nAdd a key at ${base}/purchases to download your templates.\n\nIf you didn't request this, you can ignore this email.`,
        }),
      });
      if (!res.ok) throw new HttpError(502, "We couldn't send the email right now. Please try again later.", "email_failed");
    }
    return json({ ok: true, message: "If there are purchases for that address, we've emailed the license keys." }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Route table used by the Pages Function. */
export async function route(req: Request, deps: Deps): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path === "/api/products") return productsHandler(req, deps);
  if (path === "/api/checkout") return checkoutHandler(req, deps);
  if (path === "/api/stripe-webhook") return webhookHandler(req, deps);
  if (path === "/api/purchase/claim") return claimHandler(req, deps);
  if (path === "/api/purchase/restore") return restoreHandler(req, deps);
  if (path === "/api/license") return licenseHandler(req, deps);
  const pack = /^\/api\/packs\/([a-z0-9-]{1,40})$/.exec(path);
  if (pack) return packHandler(req, deps, pack[1]!);
  return json({ error: "Not found." }, 404);
}

export { LICENSE_RE };
