/** WebCrypto helpers — identical in Cloudflare Workers and Node ≥ 20. */
const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I, L, O, U)

function base32(bytes: Uint8Array, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** Deterministic purchase id from the Checkout Session id (so retried fulfillment maps to the same row). */
export async function purchaseIdFor(sessionId: string): Promise<string> {
  return `pur_${(await sha256Hex(`purchase:${sessionId}`)).slice(0, 24)}`;
}

/** License key = HMAC(secret, purchaseId), 100 bits, formatted PQF-XXXXX-XXXXX-XXXXX-XXXXX. Never stored. */
export async function licenseKeyFor(secret: string, purchaseId: string): Promise<string> {
  const raw = base32(await hmac(secret, `license:${purchaseId}`), 20);
  return `PQF-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

export const LICENSE_RE = /^PQF-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/;

export function normalizeLicenseKey(input: string): string | null {
  const k = input.trim().toUpperCase().replace(/\s+/g, "");
  return LICENSE_RE.test(k) ? k : null;
}

export async function licenseHash(key: string): Promise<string> {
  return sha256Hex(`license-key:${key}`);
}

export function randomLetters(n: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => a[b % 26]).join("");
}
