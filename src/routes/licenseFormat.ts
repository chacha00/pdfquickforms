/** Client-side license key format check (the server is authoritative). */
const RE = /^PQF-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/;

export function normalizeLicense(input: string): string | null {
  const k = input.trim().toUpperCase().replace(/\s+/g, "");
  return RE.test(k) ? k : null;
}
