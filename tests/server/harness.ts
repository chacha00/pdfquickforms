import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import Stripe from "stripe";
import type { D1Like, D1Stmt, Deps, Env, StripeLike } from "../../server/types";

/** D1-compatible adapter over node:sqlite, running the real migration. batch() is one transaction. */
export function memoryD1(): D1Like & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(new URL("../../migrations/0001_payments.sql", import.meta.url), "utf8"));
  const stmt = (sql: string, params: unknown[] = []): D1Stmt & { exec: () => { changes: number; rows: unknown[] } } => {
    const s = {
      bind: (...v: unknown[]) => stmt(sql, v),
      exec: () => {
        const p = db.prepare(sql);
        const vals = params.map((x) => (x === undefined ? null : x)) as never[];
        if (/\breturning\b/i.test(sql) || /^\s*select/i.test(sql)) return { changes: 0, rows: p.all(...vals) };
        const r = p.run(...vals);
        return { changes: Number(r.changes), rows: [] };
      },
      first: async <T>() => (s.exec().rows[0] as T) ?? null,
      all: async <T>() => ({ results: s.exec().rows as T[] }),
      run: async () => ({ meta: { changes: s.exec().changes } }),
    };
    return s;
  };
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => (s as ReturnType<typeof stmt>).exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

export const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";
export const LICENSE_SECRET = "test-license-secret-0123456789abcdef0123456789";
export const ORIGIN = "https://forms.example.test";

/** Fake Stripe API (create/retrieve) + REAL webhook signature verification from the SDK. */
export function fakeStripe() {
  const real = new Stripe("sk_test_unused");
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const created: Stripe.Checkout.SessionCreateParams[] = [];
  let n = 0;
  const api: StripeLike = {
    checkout: {
      sessions: {
        create: async (params) => {
          created.push(params);
          const id = `cs_test_${String(++n).padStart(12, "a")}`;
          sessions.set(id, session({ id, product: params.metadata!.product_id!, amount: params.line_items![0]!.price_data!.unit_amount!, paid: false }));
          return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
        },
        retrieve: async (id) => {
          const s = sessions.get(id);
          if (!s) throw new Error("No such checkout session");
          return s;
        },
      },
    },
    webhooks: { constructEventAsync: (p, h, s) => real.webhooks.constructEventAsync(p, h, s) },
  };
  return {
    api,
    created,
    sessions,
    async signed(event: object, secret = WEBHOOK_SECRET) {
      const payload = JSON.stringify(event);
      return { payload, header: await real.webhooks.generateTestHeaderStringAsync({ payload, secret }) };
    },
  };
}

export function session(o: { id: string; product: string; amount: number; paid: boolean; currency?: string; email?: string; pi?: string; mode?: string }): Stripe.Checkout.Session {
  return {
    id: o.id,
    object: "checkout.session",
    mode: (o.mode ?? "payment") as "payment",
    amount_subtotal: o.amount,
    amount_total: o.amount,
    currency_conversion: null,
    currency: o.currency ?? "usd",
    payment_status: o.paid ? "paid" : "unpaid",
    status: o.paid ? "complete" : "open",
    metadata: { product_id: o.product },
    customer_details: { email: o.email ?? "Buyer@Example.com" } as Stripe.Checkout.Session.CustomerDetails,
    payment_intent: {
      id: o.pi ?? `pi_${o.id.slice(8)}`,
      latest_charge: { id: "ch_1", receipt_url: "https://pay.stripe.com/receipts/test" },
    } as unknown as Stripe.PaymentIntent,
  } as Stripe.Checkout.Session;
}

let evt = 0;
export function event(type: string, object: unknown, id = `evt_${++evt}_${Date.now()}`) {
  return { id, object: "event", type, api_version: "2026-10-28.endive", created: 1, livemode: false, data: { object }, pending_webhooks: 1, request: null };
}

export function deps(over: Partial<Env> = {}, stripe = fakeStripe()) {
  const db = memoryD1();
  const sent: { url: string; body: unknown }[] = [];
  const d: Deps = {
    env: {
      DB: db,
      STRIPE_SECRET_KEY: "rk_test_x",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      LICENSE_SECRET,
      PAYMENTS_ENABLED: "true",
      PUBLIC_ORIGIN: ORIGIN,
      ...over,
    },
    db,
    stripe: stripe.api,
    now: () => new Date("2026-11-04T12:00:00Z"),
    fetch: (async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  };
  return { d, db, stripe, sent };
}

export const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "203.0.113.9", ...headers }, body: JSON.stringify(body) });
export const get = (path: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}${path}`, { headers: { "cf-connecting-ip": "203.0.113.9", ...headers } });
