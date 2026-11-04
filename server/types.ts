import type Stripe from "stripe";

/** The subset of Cloudflare D1 we use (matches D1Database / D1PreparedStatement). */
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  /** Executes all statements in one transaction (all succeed or all roll back). */
  batch(statements: D1Stmt[]): Promise<unknown[]>;
}

/** The subset of the Stripe SDK we call — the real SDK in production, a fake in tests. */
export interface StripeLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
      retrieve(id: string, params?: Stripe.Checkout.SessionRetrieveParams): Promise<Stripe.Checkout.Session>;
    };
  };
  webhooks: {
    constructEventAsync(payload: string, header: string, secret: string): Promise<Stripe.Event>;
  };
}

export interface Env {
  DB: D1Like;
  /** Prefer a restricted key (rk_…) with: Checkout Sessions write, Charges/PaymentIntents read. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** ≥32 random bytes; derives license keys. Rotating it invalidates existing keys. */
  LICENSE_SECRET?: string;
  /** Must be "true" to take payments. Lets you deploy the code before going live. */
  PAYMENTS_ENABLED?: string;
  /** "false" to create sessions without Managed Payments (Stripe as merchant of record). Default on. */
  STRIPE_MANAGED_PAYMENTS?: string;
  /** e.g. https://pdfquickforms.com — used for redirect URLs and the Origin check. */
  PUBLIC_ORIGIN?: string;
  /** Optional purchase-recovery email via Resend. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface Deps {
  env: Env;
  db: D1Like;
  stripe: StripeLike | null;
  now: () => Date;
  fetch: typeof fetch;
}
