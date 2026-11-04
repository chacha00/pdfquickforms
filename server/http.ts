import type { Deps, Env } from "./types";
import { sha256Hex } from "./crypto";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
  }
}

const SECURITY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  console.error("[api] unexpected error", e instanceof Error ? e.message : e);
  return json({ error: "Something went wrong. Please try again.", code: "internal" }, 500);
}

export function paymentsEnabled(env: Env): boolean {
  return env.PAYMENTS_ENABLED === "true" && !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET && (env.LICENSE_SECRET?.length ?? 0) >= 32;
}

export function requirePayments(env: Env) {
  if (!paymentsEnabled(env)) throw new HttpError(503, "Purchases aren't available on this site yet.", "payments_disabled");
}

/** CSRF defence for browser-called POST endpoints: same-origin requests only. */
export function checkOrigin(req: Request, env: Env) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).origin, env.PUBLIC_ORIGIN].filter(Boolean) as string[]);
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
}

export async function readJson<T>(req: Request, maxBytes = 4096): Promise<T> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new HttpError(415, "Expected JSON.", "bad_content_type");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.", "too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON.", "bad_json");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Fixed-window rate limit backed by D1. Identifiers are hashed (no raw IPs/emails stored). */
export async function rateLimit(deps: Deps, bucket: string, limit: number, windowSec: number) {
  const now = Math.floor(deps.now().getTime() / 1000);
  const window = now - (now % windowSec);
  const key = await sha256Hex(`rl:${bucket}`);
  const row = await deps.db
    .prepare(
      "INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count",
    )
    .bind(key, window)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, "Too many requests. Please wait a moment and try again.", "rate_limited");
}
