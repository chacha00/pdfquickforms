/**
 * Client side of one-time purchases. The server is the source of truth: the
 * browser only remembers license keys (localStorage) so the buyer doesn't have
 * to paste them again. Nothing here decides prices or entitlements.
 */
import catalogData from "../content/catalog.json";
import type { El, PageModel } from "./forms/model";

export interface PublicProduct {
  id: string;
  kind: "template_pack" | "credits";
  name: string;
  description: string;
  amount: number;
  currency: string;
  packId?: string;
  includes?: string[];
}

export const CATALOG = (catalogData.products as (PublicProduct & { active: boolean })[]).filter((p) => p.active);

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export interface StoredLicense {
  key: string;
  productId: string;
  productName: string;
  packId: string | null;
  addedAt: number;
}

const KEY = "pdfquick-forms:licenses";

export function storedLicenses(): StoredLicense[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function rememberLicense(l: StoredLicense) {
  try {
    const all = storedLicenses().filter((x) => x.key !== l.key);
    localStorage.setItem(KEY, JSON.stringify([l, ...all]));
  } catch {
    /* storage blocked — the key is still shown on screen */
  }
}

export function forgetLicense(key: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(storedLicenses().filter((x) => x.key !== key)));
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new ApiError(res.status, "Purchases aren't available on this site yet.", "no_api");
  const body = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok && res.status !== 202) throw new ApiError(res.status, body.error ?? "Something went wrong.", body.code);
  return { status: res.status, body };
}

export async function paymentsStatus(): Promise<boolean> {
  try {
    return (await api<{ paymentsEnabled: boolean }>("/api/products")).body.paymentsEnabled;
  } catch {
    return false;
  }
}

export async function startCheckout(productId: string): Promise<string> {
  const { body } = await api<{ url: string }>("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
  return body.url;
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "paid"; licenseKey: string; productId: string; productName: string; packId: string | null; receiptUrl: string | null };

export async function claim(sessionId: string): Promise<ClaimResult> {
  return (await api<ClaimResult>("/api/purchase/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) })).body;
}

export async function describeLicense(key: string) {
  return (await api<{ productId: string; productName: string; packId: string | null; credits: number; receiptUrl: string | null }>("/api/license", { headers: { authorization: `Bearer ${key}` } })).body;
}

export interface PackTemplate {
  id: string;
  title: string;
  description: string;
  pages: PageModel[];
  elements: El[];
}

export async function downloadPack(packId: string, key: string) {
  return (await api<{ packId: string; name: string; templates: PackTemplate[] }>(`/api/packs/${encodeURIComponent(packId)}`, { headers: { authorization: `Bearer ${key}` } })).body;
}

export async function restoreByEmail(email: string) {
  return (await api<{ message: string }>("/api/purchase/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })).body;
}
