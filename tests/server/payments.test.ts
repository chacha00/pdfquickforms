import { beforeEach, describe, expect, it } from "vitest";
import { route } from "../../server/handlers";
import { __setCatalog, catalog } from "../../server/catalog";
import { balance, consumeCredits, restoreCredits } from "../../server/credits";
import { LICENSE_RE, licenseKeyFor, purchaseIdFor } from "../../server/crypto";
import { LICENSE_SECRET, ORIGIN, deps, event, get, post, session } from "./harness";

const PACK = "pack-small-business";
const original = catalog();

beforeEach(() => __setCatalog(original));

async function webhook(h: ReturnType<typeof deps>, ev: object) {
  const { payload, header } = await h.stripe.signed(ev);
  return route(new Request(`${ORIGIN}/api/stripe-webhook`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload }), h.d);
}

async function buy(h: ReturnType<typeof deps>, productId = PACK) {
  const r = await route(post("/api/checkout", { productId }), h.d);
  expect(r.status).toBe(200);
  const { url } = (await r.json()) as { url: string };
  const id = url.split("/").pop()!;
  const s = h.stripe.sessions.get(id)!;
  return { id, s };
}

const count = (h: ReturnType<typeof deps>, sql: string) => (h.db.raw.prepare(sql).get() as { n: number }).n;

describe("GET /api/products", () => {
  it("lists active products and whether payments are enabled", async () => {
    const h = deps();
    const body = (await (await route(get("/api/products"), h.d)).json()) as { paymentsEnabled: boolean; products: { id: string; amount: number }[] };
    expect(body.paymentsEnabled).toBe(true);
    expect(body.products.map((p) => [p.id, p.amount])).toEqual([[PACK, 499]]);
  });

  it("reports payments disabled unless every secret is set and PAYMENTS_ENABLED=true", async () => {
    for (const over of [{ PAYMENTS_ENABLED: "false" }, { STRIPE_WEBHOOK_SECRET: undefined }, { LICENSE_SECRET: "short" }]) {
      const body = (await (await route(get("/api/products"), deps(over).d)).json()) as { paymentsEnabled: boolean };
      expect(body.paymentsEnabled).toBe(false);
    }
  });
});

describe("POST /api/checkout", () => {
  it("creates a one-time Checkout Session with the server's price", async () => {
    const h = deps();
    await buy(h);
    const p = h.stripe.created[0]!;
    expect(p.mode).toBe("payment");
    expect(p.line_items).toEqual([{ quantity: 1, price_data: { currency: "usd", unit_amount: 499, product_data: { name: "Small Business Forms Pack", description: expect.any(String), tax_code: "txcd_10000000" } } }]);
    expect(p.metadata).toEqual({ product_id: PACK });
    expect(p.success_url).toBe(`${ORIGIN}/purchase/success?session_id={CHECKOUT_SESSION_ID}`);
    expect(p).not.toHaveProperty("payment_method_types");
    // Managed Payments (Stripe as merchant of record) + digital-goods tax code
    expect(p.managed_payments).toEqual({ enabled: true });
    expect(p.line_items![0]!.price_data!.product_data!.tax_code).toBe("txcd_10000000");
    // parameters Managed Payments doesn't allow
    for (const k of ["automatic_tax", "tax_id_collection", "invoice_creation", "custom_text", "shipping_address_collection"]) expect(p).not.toHaveProperty(k);
    expect(p.payment_intent_data).not.toHaveProperty("statement_descriptor");
    expect(p.integration_identifier).toMatch(/^pdfquick-forms-pack-small-business-[a-z]{8}$/);
  });

  it("Managed Payments can be switched off", async () => {
    const h = deps({ STRIPE_MANAGED_PAYMENTS: "false" });
    await buy(h);
    expect(h.stripe.created[0]).not.toHaveProperty("managed_payments");
  });

  it("ignores client-supplied prices and rejects unknown or inactive products", async () => {
    const h = deps();
    await route(post("/api/checkout", { productId: PACK, amount: 1, price: 1 }), h.d);
    expect(h.stripe.created[0]!.line_items![0]!.price_data!.unit_amount).toBe(499);
    expect((await route(post("/api/checkout", { productId: "nope" }), h.d)).status).toBe(404);
    __setCatalog(original.map((p) => ({ ...p, active: false })));
    expect((await route(post("/api/checkout", { productId: PACK }), h.d)).status).toBe(404);
  });

  it("blocks cross-site requests, non-JSON bodies and disabled payments", async () => {
    const h = deps();
    expect((await route(post("/api/checkout", { productId: PACK }, { origin: "https://evil.example" }), h.d)).status).toBe(403);
    expect((await route(new Request(`${ORIGIN}/api/checkout`, { method: "POST", headers: { origin: ORIGIN }, body: "productId=x" }), h.d)).status).toBe(415);
    expect((await route(post("/api/checkout", { productId: PACK }), deps({ PAYMENTS_ENABLED: "false" }).d)).status).toBe(503);
  });

  it("rate limits per client", async () => {
    const h = deps();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await route(post("/api/checkout", { productId: PACK }), h.d)).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});

describe("POST /api/stripe-webhook", () => {
  it("rejects missing and forged signatures", async () => {
    const h = deps();
    const noSig = await route(new Request(`${ORIGIN}/api/stripe-webhook`, { method: "POST", body: "{}" }), h.d);
    expect(noSig.status).toBe(400);
    const ev = event("checkout.session.completed", session({ id: "cs_test_forgedforged", product: PACK, amount: 499, paid: true }));
    const { payload, header } = await h.stripe.signed(ev, "whsec_wrong_secret");
    const forged = await route(new Request(`${ORIGIN}/api/stripe-webhook`, { method: "POST", headers: { "stripe-signature": header }, body: payload }), h.d);
    expect(forged.status).toBe(400);
    // tampered body with a valid header for different content
    const ok = await h.stripe.signed(ev);
    const tampered = await route(new Request(`${ORIGIN}/api/stripe-webhook`, { method: "POST", headers: { "stripe-signature": ok.header }, body: ok.payload.replace("499", "1") }), h.d);
    expect(tampered.status).toBe(400);
    expect(count(h, "SELECT COUNT(*) AS n FROM purchases")).toBe(0);
  });

  it("fulfils a paid session exactly once, even when the event is delivered twice or re-sent with a new id", async () => {
    const h = deps();
    const { id } = await buy(h);
    const s = session({ id, product: PACK, amount: 499, paid: true });
    const ev = event("checkout.session.completed", s);
    expect((await webhook(h, ev)).status).toBe(200);
    const dup = await webhook(h, ev);
    expect(await dup.json()).toEqual({ received: true, duplicate: true });
    expect((await webhook(h, event("checkout.session.completed", s))).status).toBe(200); // same session, new event id
    expect(count(h, "SELECT COUNT(*) AS n FROM purchases")).toBe(1);
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(1);
    expect(count(h, "SELECT COUNT(*) AS n FROM payment_events")).toBe(2);
    const row = h.db.raw.prepare("SELECT status, email, amount FROM purchases").get();
    expect(row).toEqual({ status: "paid", email: "buyer@example.com", amount: 499 });
  });

  it("does not fulfil when the amount charged doesn't match the catalog", async () => {
    const h = deps();
    await webhook(h, event("checkout.session.completed", session({ id: "cs_test_tamperedprice1", product: PACK, amount: 1, paid: true }))); // subtotal $0.01
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(0);
    expect(count(h, "SELECT COUNT(*) AS n FROM audit_events WHERE kind = 'price_mismatch'")).toBe(1);
  });

  it("accepts Adaptive Pricing + tax: buyer pays in EUR with VAT, pre-tax source price matches", async () => {
    const h = deps();
    const s = {
      ...session({ id: "cs_test_eurowithvat001", product: PACK, amount: 568, paid: true, currency: "eur" }),
      amount_subtotal: 458, // €4.58 pre-tax
      amount_total: 545, // incl. 19% VAT
      currency_conversion: { amount_subtotal: 499, amount_total: 594, fx_rate: "0.918", source_currency: "usd" },
    };
    await webhook(h, event("checkout.session.completed", s));
    expect(h.db.raw.prepare("SELECT status, amount, currency FROM purchases").get()).toEqual({ status: "paid", amount: 545, currency: "eur" });
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(1);
  });

  it("accepts US sales tax on top of the catalog price", async () => {
    const h = deps();
    await webhook(h, event("checkout.session.completed", { ...session({ id: "cs_test_ussalestax0001", product: PACK, amount: 499, paid: true }), amount_total: 539 }));
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(1);
  });

  it("rejects a converted session whose source price was tampered with", async () => {
    const h = deps();
    const s = {
      ...session({ id: "cs_test_eurotampered01", product: PACK, amount: 100, paid: true, currency: "eur" }),
      currency_conversion: { amount_subtotal: 100, amount_total: 119, fx_rate: "0.9", source_currency: "usd" },
    };
    await webhook(h, event("checkout.session.completed", s));
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(0);
    expect(count(h, "SELECT COUNT(*) AS n FROM audit_events WHERE kind = 'price_mismatch'")).toBe(1);
  });

  it("ignores subscription-mode sessions", async () => {
    const h = deps();
    await webhook(h, event("checkout.session.completed", session({ id: "cs_test_subscription01", product: PACK, amount: 499, paid: true, mode: "subscription" })));
    expect(count(h, "SELECT COUNT(*) AS n FROM purchases")).toBe(0);
  });

  it("handles delayed payment methods: pending → succeeded, or pending → failed", async () => {
    const h = deps();
    const a = session({ id: "cs_test_asyncsuccess1", product: PACK, amount: 499, paid: false });
    await webhook(h, event("checkout.session.completed", a));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "pending" });
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(0);
    await webhook(h, event("checkout.session.async_payment_succeeded", { ...a, payment_status: "paid" }));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "paid" });
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(1);

    const b = session({ id: "cs_test_asyncfailure1", product: PACK, amount: 499, paid: false, pi: "pi_fail" });
    await webhook(h, event("checkout.session.completed", b));
    await webhook(h, event("checkout.session.async_payment_failed", b));
    expect(h.db.raw.prepare("SELECT status FROM purchases WHERE checkout_session_id = ?").get(b.id)).toEqual({ status: "failed" });
  });

  it("full refund revokes the license; partial refund is only audited", async () => {
    const h = deps();
    const { id } = await buy(h);
    await webhook(h, event("checkout.session.completed", session({ id, product: PACK, amount: 499, paid: true, pi: "pi_refund" })));
    const key = await licenseKeyFor(LICENSE_SECRET, await purchaseIdFor(id));
    expect((await route(get("/api/packs/small-business", { authorization: `Bearer ${key}` }), h.d)).status).toBe(200);

    await webhook(h, event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: "pi_refund", refunded: false, amount_refunded: 100 }));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "paid" });
    expect(count(h, "SELECT COUNT(*) AS n FROM audit_events WHERE kind = 'partial_refund'")).toBe(1);

    await webhook(h, event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: "pi_refund", refunded: true, amount_refunded: 499 }));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "refunded" });
    const denied = await route(get("/api/packs/small-business", { authorization: `Bearer ${key}` }), h.d);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: string }).error).toMatch(/refunded/);
    // a late duplicate "completed" event can't resurrect a refunded purchase
    await webhook(h, event("checkout.session.completed", session({ id, product: PACK, amount: 499, paid: true, pi: "pi_refund" })));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "refunded" });
  });

  it("disputes revoke access", async () => {
    const h = deps();
    await webhook(h, event("checkout.session.completed", session({ id: "cs_test_disputed0001", product: PACK, amount: 499, paid: true, pi: "pi_dispute" })));
    await webhook(h, event("charge.dispute.created", { id: "dp_1", object: "dispute", payment_intent: "pi_dispute" }));
    expect(h.db.raw.prepare("SELECT status FROM purchases").get()).toEqual({ status: "disputed" });
  });

  it("acknowledges unrelated events", async () => {
    const h = deps();
    const r = await webhook(h, event("customer.created", { id: "cus_1" }));
    expect(r.status).toBe(200);
    expect(count(h, "SELECT COUNT(*) AS n FROM payment_events")).toBe(1);
  });
});

describe("POST /api/purchase/claim", () => {
  it("returns the license after payment — even before the webhook arrives — and the same key every time", async () => {
    const h = deps();
    const { id, s } = await buy(h);
    // not paid yet
    let r = await route(post("/api/purchase/claim", { sessionId: id }), h.d);
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ status: "pending" });
    // customer pays; webhook not delivered yet
    h.stripe.sessions.set(id, { ...s, payment_status: "paid", status: "complete" });
    r = await route(post("/api/purchase/claim", { sessionId: id }), h.d);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { licenseKey: string; packId: string; receiptUrl: string };
    expect(body.licenseKey).toMatch(LICENSE_RE);
    expect(body.packId).toBe("small-business");
    expect(body.receiptUrl).toBe("https://pay.stripe.com/receipts/test");
    // webhook arrives later: still one purchase, same key
    await webhook(h, event("checkout.session.completed", { ...s, payment_status: "paid" }));
    const again = (await (await route(post("/api/purchase/claim", { sessionId: id }), h.d)).json()) as { licenseKey: string };
    expect(again.licenseKey).toBe(body.licenseKey);
    expect(count(h, "SELECT COUNT(*) AS n FROM licenses")).toBe(1);
  });

  it("validates the session id and rejects unknown sessions", async () => {
    const h = deps();
    expect((await route(post("/api/purchase/claim", { sessionId: "../../etc" }), h.d)).status).toBe(400);
    expect((await route(post("/api/purchase/claim", { sessionId: "cs_test_doesnotexist00" }), h.d)).status).toBe(404);
  });

  it("license keys are never stored, only their hash", async () => {
    const h = deps();
    const { id, s } = await buy(h);
    h.stripe.sessions.set(id, { ...s, payment_status: "paid" });
    const { licenseKey } = (await (await route(post("/api/purchase/claim", { sessionId: id }), h.d)).json()) as { licenseKey: string };
    const dump = JSON.stringify(h.db.raw.prepare("SELECT * FROM licenses").all()) + JSON.stringify(h.db.raw.prepare("SELECT * FROM audit_events").all());
    expect(dump).not.toContain(licenseKey);
  });
});

describe("GET /api/packs/:id", () => {
  async function licensed() {
    const h = deps();
    const { id, s } = await buy(h);
    h.stripe.sessions.set(id, { ...s, payment_status: "paid" });
    const { licenseKey } = (await (await route(post("/api/purchase/claim", { sessionId: id }), h.d)).json()) as { licenseKey: string };
    return { h, licenseKey };
  }

  it("delivers the pack's templates to a valid license and records the download", async () => {
    const { h, licenseKey } = await licensed();
    const r = await route(get("/api/packs/small-business", { authorization: `Bearer ${licenseKey.toLowerCase()}` }), h.d);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = (await r.json()) as { templates: { title: string; pages: unknown[]; elements: { type: string }[] }[] };
    expect(body.templates.map((t) => t.title)).toEqual(catalog()[0]!.includes);
    for (const t of body.templates) {
      expect(t.pages.length).toBeGreaterThan(0);
      expect(t.elements.filter((e) => e.type !== "paragraph" && e.type !== "heading" && e.type !== "line").length).toBeGreaterThan(5);
    }
    expect(count(h, "SELECT COUNT(*) AS n FROM premium_downloads")).toBe(1);
  });

  it("refuses missing, malformed, unknown and wrong-pack keys", async () => {
    const { h, licenseKey } = await licensed();
    expect((await route(get("/api/packs/small-business"), h.d)).status).toBe(401);
    expect((await route(get("/api/packs/small-business", { authorization: "Bearer hello" }), h.d)).status).toBe(401);
    expect((await route(get("/api/packs/small-business", { authorization: "Bearer PQF-00000-00000-00000-00000" }), h.d)).status).toBe(401);
    expect((await route(get("/api/packs/other-pack", { authorization: `Bearer ${licenseKey}` }), h.d)).status).toBe(403);
  });

  it("GET /api/license describes the license", async () => {
    const { h, licenseKey } = await licensed();
    const body = await (await route(get("/api/license", { authorization: `Bearer ${licenseKey}` }), h.d)).json();
    expect(body).toMatchObject({ productId: PACK, packId: "small-business", credits: 0 });
  });
});

describe("credits", () => {
  const CREDITS = { id: "credits-10", kind: "credits" as const, name: "10 credits", description: "", amount: 300, currency: "usd", active: true, credits: 10 };

  async function withCredits() {
    __setCatalog([...original, CREDITS]);
    const h = deps();
    const { id, s } = await buy(h, "credits-10");
    const ev = event("checkout.session.completed", { ...s, payment_status: "paid" });
    await webhook(h, ev);
    await webhook(h, event("checkout.session.completed", { ...s, payment_status: "paid" })); // retry must not double-grant
    const lic = `lic_${(await purchaseIdFor(id)).slice(4)}`;
    return { h, lic, pi: (s.payment_intent as { id: string }).id };
  }

  it("grants credits once per purchase", async () => {
    const { h, lic } = await withCredits();
    expect(await balance(h.db, lic)).toBe(10);
  });

  it("consumes atomically, is idempotent, refuses overdraft, and restores on failure", async () => {
    const { h, lic } = await withCredits();
    const now = new Date();
    expect(await consumeCredits(h.db, lic, 3, "job-1", "ocr", now)).toEqual({ ok: true, balance: 7, replay: false });
    expect(await consumeCredits(h.db, lic, 3, "job-1", "ocr", now)).toEqual({ ok: true, balance: 7, replay: true });
    expect(await consumeCredits(h.db, lic, 8, "job-2", "ocr", now)).toEqual({ ok: false, reason: "insufficient", balance: 7 });
    expect(await restoreCredits(h.db, lic, "job-1", now)).toBe(10);
    expect(await restoreCredits(h.db, lic, "job-1", now)).toBe(10); // idempotent
    // many concurrent spends of 1 can never exceed the balance
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => consumeCredits(h.db, lic, 1, `c-${i}`, "x", now)));
    expect(results.filter((r) => r.ok).length).toBe(10);
    expect(await balance(h.db, lic)).toBe(0);
  });

  it("refund revokes remaining credits", async () => {
    const { h, lic, pi } = await withCredits();
    await consumeCredits(h.db, lic, 4, "job", "x", new Date());
    await webhook(h, event("charge.refunded", { id: "ch_9", object: "charge", payment_intent: pi, refunded: true }));
    expect(await balance(h.db, lic)).toBe(0);
  });
});

describe("POST /api/purchase/restore", () => {
  it("is disabled without an email provider", async () => {
    const r = await route(post("/api/purchase/restore", { email: "a@b.co" }), deps().d);
    expect(r.status).toBe(501);
  });

  it("emails keys for paid purchases and answers identically for unknown addresses", async () => {
    const h = deps({ RESEND_API_KEY: "re_test", EMAIL_FROM: "PDFQuick Forms <keys@example.test>" });
    const { id, s } = await buy(h);
    h.stripe.sessions.set(id, { ...s, payment_status: "paid" });
    const { licenseKey } = (await (await route(post("/api/purchase/claim", { sessionId: id }), h.d)).json()) as { licenseKey: string };

    const known = await route(post("/api/purchase/restore", { email: "BUYER@example.com " }), h.d);
    const unknown = await route(post("/api/purchase/restore", { email: "nobody@example.com" }), h.d);
    expect(known.status).toBe(202);
    expect(await unknown.json()).toEqual(await known.json());
    expect(h.sent).toHaveLength(1);
    expect(JSON.stringify(h.sent[0]!.body)).toContain(licenseKey);
    expect((h.sent[0]!.body as { to: string[] }).to).toEqual(["buyer@example.com"]);
  });

  it("rate limits recovery per email address", async () => {
    const h = deps({ RESEND_API_KEY: "re_test", EMAIL_FROM: "x@example.test" });
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await route(post("/api/purchase/restore", { email: "a@example.com" }, { "cf-connecting-ip": `198.51.100.${i}` }), h.d)).status);
    expect(s).toEqual([202, 202, 202, 429]);
  });
});

describe("routing", () => {
  it("404s unknown API routes and rejects wrong methods", async () => {
    const h = deps();
    expect((await route(get("/api/nope"), h.d)).status).toBe(404);
    expect((await route(get("/api/checkout"), h.d)).status).toBe(405);
  });
});
