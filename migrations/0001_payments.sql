-- PDFQuick Forms — one-time purchases (no subscriptions, no recurring billing).
-- Cloudflare D1 (SQLite). Idempotency comes from UNIQUE constraints, and every
-- fulfillment runs in a single D1 batch (one transaction).

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('template_pack', 'credits')),
  name        TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),   -- minor units (cents)
  currency    TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id                   TEXT PRIMARY KEY,               -- deterministic from the Checkout Session ID
  checkout_session_id  TEXT NOT NULL UNIQUE,
  payment_intent_id    TEXT,
  product_id           TEXT NOT NULL REFERENCES products(id),
  amount               INTEGER NOT NULL,
  currency             TEXT NOT NULL,
  email                TEXT,                           -- from Stripe, for purchase recovery only
  status               TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'disputed')),
  created_at           TEXT NOT NULL,
  paid_at              TEXT,
  refunded_at          TEXT,
  receipt_url          TEXT
);
CREATE INDEX IF NOT EXISTS purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS purchases_pi ON purchases(payment_intent_id);

-- One license per purchase. The key itself is never stored: key = HMAC(LICENSE_SECRET, purchase_id);
-- we store SHA-256(key) for lookup.
CREATE TABLE IF NOT EXISTS licenses (
  id          TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  key_hash    TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);

-- Every Stripe webhook event we have processed (unique event id = duplicate protection + audit).
CREATE TABLE IF NOT EXISTS payment_events (
  stripe_event_id TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  object_id       TEXT,
  received_at     TEXT NOT NULL
);

-- Credits are an append-only ledger; the balance is the sum. A unique idempotency key
-- prevents double grants (webhook retries) and double spends (client retries).
CREATE TABLE IF NOT EXISTS credit_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id       TEXT NOT NULL REFERENCES licenses(id),
  amount           INTEGER NOT NULL,                  -- +grant, -consume
  kind             TEXT NOT NULL CHECK (kind IN ('grant', 'consume', 'restore', 'revoke')),
  reason           TEXT,
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_tx_license ON credit_transactions(license_id);

CREATE VIEW IF NOT EXISTS credit_balances AS
  SELECT license_id, COALESCE(SUM(amount), 0) AS balance FROM credit_transactions GROUP BY license_id;

CREATE TABLE IF NOT EXISTS premium_downloads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id  TEXT NOT NULL REFERENCES licenses(id),
  pack_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Reserved for future cloud jobs (OCR, batch). Unused today.
CREATE TABLE IF NOT EXISTS processing_jobs (
  id          TEXT PRIMARY KEY,
  license_id  TEXT REFERENCES licenses(id),
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  subject     TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
