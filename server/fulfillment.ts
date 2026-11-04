/**
 * Purchase fulfillment and reversal. Every write for one event runs in a
 * single D1 batch (one transaction), and every statement is idempotent
 * (UNIQUE keys + ON CONFLICT), so webhook retries, duplicate deliveries and
 * a racing /claim can never grant twice.
 */
import type Stripe from "stripe";
import { productById } from "./catalog";
import { licenseHash, licenseKeyFor, purchaseIdFor } from "./crypto";
import { HttpError } from "./http";
import type { D1Like, D1Stmt, Env } from "./types";

export type PurchaseStatus = "pending" | "paid" | "failed" | "refunded" | "disputed";

const iso = (d: Date) => d.toISOString();

function audit(db: D1Like, kind: string, subject: string | null, detail: unknown, now: Date): D1Stmt {
  return db.prepare("INSERT INTO audit_events (kind, subject, detail, created_at) VALUES (?, ?, ?, ?)").bind(kind, subject, JSON.stringify(detail ?? null), iso(now));
}

function eventRow(db: D1Like, event: Stripe.Event | null, objectId: string | null, now: Date): D1Stmt[] {
  if (!event) return [];
  return [db.prepare("INSERT INTO payment_events (stripe_event_id, type, object_id, received_at) VALUES (?, ?, ?, ?) ON CONFLICT(stripe_event_id) DO NOTHING").bind(event.id, event.type, objectId, iso(now))];
}

export async function alreadyProcessed(db: D1Like, eventId: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM payment_events WHERE stripe_event_id = ?").bind(eventId).first());
}

function paymentIntentId(s: Stripe.Checkout.Session): string | null {
  return typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
}

function receiptUrl(s: Stripe.Checkout.Session): string | null {
  const pi = s.payment_intent;
  if (!pi || typeof pi === "string") return null;
  const ch = pi.latest_charge;
  return ch && typeof ch !== "string" ? (ch.receipt_url ?? null) : null;
}

/**
 * Record a Checkout Session. If it is paid (and the amount matches the
 * catalog), mark the purchase paid, issue the license and grant credits.
 */
export async function recordCheckoutSession(
  db: D1Like,
  env: Env,
  session: Stripe.Checkout.Session,
  event: Stripe.Event | null,
  now: Date,
  overrideStatus?: "failed",
): Promise<{ purchaseId: string; status: PurchaseStatus | "rejected" }> {
  const productId = session.metadata?.product_id ?? "";
  const product = productById(productId);
  const purchaseId = await purchaseIdFor(session.id);
  if (session.mode !== "payment" || !product) {
    await db.batch([audit(db, "rejected_session", session.id, { reason: "unknown product or mode", productId, mode: session.mode }, now), ...eventRow(db, event, session.id, now)]);
    return { purchaseId, status: "rejected" };
  }
  // Server-side price validation against the catalog, on the PRE-TAX price in the ORIGINAL currency:
  // with Managed Payments, Stripe adds tax and Adaptive Pricing may charge in the buyer's currency,
  // so amount_total/currency legitimately differ from the catalog.
  const original = session.currency_conversion
    ? { amount: session.currency_conversion.amount_subtotal, currency: session.currency_conversion.source_currency }
    : { amount: session.amount_subtotal, currency: session.currency };
  if (original.amount !== product.amount || (original.currency ?? "").toLowerCase() !== product.currency) {
    await db.batch([
      audit(db, "price_mismatch", session.id, { expected: [product.amount, product.currency], got: [original.amount, original.currency] }, now),
      ...eventRow(db, event, session.id, now),
    ]);
    return { purchaseId, status: "rejected" };
  }

  const paid = session.payment_status === "paid";
  const status: PurchaseStatus = overrideStatus ?? (paid ? "paid" : "pending");
  const licenseId = `lic_${purchaseId.slice(4)}`;
  const stmts: D1Stmt[] = [
    db
      .prepare(
        `INSERT INTO products (id, kind, name, amount, currency, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, amount = excluded.amount, currency = excluded.currency, active = excluded.active, updated_at = excluded.updated_at`,
      )
      .bind(product.id, product.kind, product.name, product.amount, product.currency, product.active ? 1 : 0, iso(now)),
    db
      .prepare(
        `INSERT INTO purchases (id, checkout_session_id, payment_intent_id, product_id, amount, currency, email, status, created_at, paid_at, receipt_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(checkout_session_id) DO UPDATE SET
           status = CASE WHEN purchases.status IN ('pending', 'failed') THEN excluded.status ELSE purchases.status END,
           paid_at = COALESCE(purchases.paid_at, excluded.paid_at),
           payment_intent_id = COALESCE(excluded.payment_intent_id, purchases.payment_intent_id),
           email = COALESCE(purchases.email, excluded.email),
           receipt_url = COALESCE(excluded.receipt_url, purchases.receipt_url)`,
      )
      .bind(
        purchaseId,
        session.id,
        paymentIntentId(session),
        product.id,
        session.amount_total,
        (session.currency ?? product.currency).toLowerCase(),
        session.customer_details?.email?.toLowerCase() ?? null,
        status,
        iso(now),
        status === "paid" ? iso(now) : null,
        receiptUrl(session),
      ),
  ];
  if (status === "paid") {
    if (!env.LICENSE_SECRET) throw new HttpError(503, "LICENSE_SECRET is not configured.", "misconfigured");
    const key = await licenseKeyFor(env.LICENSE_SECRET, purchaseId);
    stmts.push(
      db
        .prepare("INSERT INTO licenses (id, purchase_id, key_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(purchase_id) DO NOTHING")
        .bind(licenseId, purchaseId, await licenseHash(key), iso(now)),
    );
    if (product.kind === "credits" && product.credits) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO credit_transactions (license_id, amount, kind, reason, idempotency_key, created_at)
             SELECT ?, ?, 'grant', ?, ?, ? WHERE (SELECT status FROM purchases WHERE id = ?) = 'paid'
             ON CONFLICT(idempotency_key) DO NOTHING`,
          )
          .bind(licenseId, product.credits, `purchase ${product.id}`, `grant:${purchaseId}`, iso(now), purchaseId),
      );
    }
  }
  stmts.push(audit(db, `purchase_${status}`, purchaseId, { session: session.id, product: product.id }, now), ...eventRow(db, event, session.id, now));
  await db.batch(stmts);
  const row = await db.prepare("SELECT status FROM purchases WHERE id = ?").bind(purchaseId).first<{ status: PurchaseStatus }>();
  return { purchaseId, status: row?.status ?? status };
}

/** Full refund or dispute → revoke access and remaining credits. Partial refunds are only audited. */
export async function reversePayment(db: D1Like, paymentIntent: string | null, to: "refunded" | "disputed", event: Stripe.Event, now: Date, full = true) {
  if (!paymentIntent) {
    await db.batch(eventRow(db, event, null, now));
    return null;
  }
  const row = await db.prepare("SELECT id FROM purchases WHERE payment_intent_id = ?").bind(paymentIntent).first<{ id: string }>();
  if (!row || !full) {
    await db.batch([audit(db, row ? "partial_refund" : "reversal_unknown_purchase", row?.id ?? paymentIntent, { to }, now), ...eventRow(db, event, paymentIntent, now)]);
    return row?.id ?? null;
  }
  await db.batch([
    db.prepare("UPDATE purchases SET status = ?, refunded_at = ? WHERE id = ? AND status IN ('paid', 'pending', 'disputed', 'refunded')").bind(to, iso(now), row.id),
    db
      .prepare(
        `INSERT INTO credit_transactions (license_id, amount, kind, reason, idempotency_key, created_at)
         SELECT l.id, -MAX(0, COALESCE((SELECT SUM(amount) FROM credit_transactions c WHERE c.license_id = l.id), 0)), 'revoke', ?, ?, ?
         FROM licenses l WHERE l.purchase_id = ?
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .bind(to, `revoke:${row.id}`, iso(now), row.id),
    audit(db, `purchase_${to}`, row.id, { paymentIntent }, now),
    ...eventRow(db, event, paymentIntent, now),
  ]);
  return row.id;
}

/** Look up an active license by its key. */
export async function findLicense(db: D1Like, key: string) {
  return db
    .prepare(
      `SELECT l.id AS license_id, p.id AS purchase_id, p.status, p.product_id, p.email, p.receipt_url
       FROM licenses l JOIN purchases p ON p.id = l.purchase_id WHERE l.key_hash = ?`,
    )
    .bind(await licenseHash(key))
    .first<{ license_id: string; purchase_id: string; status: PurchaseStatus; product_id: string; email: string | null; receipt_url: string | null }>();
}
