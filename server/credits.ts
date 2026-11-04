/**
 * Credit ledger. Server-side only; the client never states a balance.
 * Consumption is a single conditional INSERT, so it is atomic: two
 * concurrent requests can't both spend the last credit. An idempotency key
 * makes client retries safe, and `restoreCredits` gives credits back when a
 * paid processing job fails.
 */
import type { D1Like } from "./types";

export async function balance(db: D1Like, licenseId: string): Promise<number> {
  const r = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS b FROM credit_transactions WHERE license_id = ?").bind(licenseId).first<{ b: number }>();
  return r?.b ?? 0;
}

export type ConsumeResult = { ok: true; balance: number; replay: boolean } | { ok: false; reason: "insufficient"; balance: number };

export async function consumeCredits(db: D1Like, licenseId: string, amount: number, idempotencyKey: string, reason: string, now: Date): Promise<ConsumeResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");
  const key = `consume:${licenseId}:${idempotencyKey}`;
  const res = await db
    .prepare(
      `INSERT INTO credit_transactions (license_id, amount, kind, reason, idempotency_key, created_at)
       SELECT ?, ?, 'consume', ?, ?, ?
       WHERE (SELECT COALESCE(SUM(amount), 0) FROM credit_transactions WHERE license_id = ?) >= ?
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(licenseId, -amount, reason, key, now.toISOString(), licenseId, amount)
    .run();
  if (res.meta.changes === 1) return { ok: true, balance: await balance(db, licenseId), replay: false };
  const existing = await db.prepare("SELECT 1 AS x FROM credit_transactions WHERE idempotency_key = ?").bind(key).first();
  if (existing) return { ok: true, balance: await balance(db, licenseId), replay: true };
  return { ok: false, reason: "insufficient", balance: await balance(db, licenseId) };
}

/** Return credits for a job that failed after they were consumed. Idempotent per job. */
export async function restoreCredits(db: D1Like, licenseId: string, idempotencyKey: string, now: Date): Promise<number> {
  const consumeKey = `consume:${licenseId}:${idempotencyKey}`;
  await db
    .prepare(
      `INSERT INTO credit_transactions (license_id, amount, kind, reason, idempotency_key, created_at)
       SELECT license_id, -amount, 'restore', 'failed job', ?, ? FROM credit_transactions WHERE idempotency_key = ?
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(`restore:${licenseId}:${idempotencyKey}`, now.toISOString(), consumeKey)
    .run();
  return balance(db, licenseId);
}
