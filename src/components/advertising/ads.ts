/**
 * Advertising configuration and consent.
 *
 * Ads are OFF unless VITE_ADSENSE_CLIENT is set at build time. Even then, the
 * ad script is loaded only after the visitor accepts in the consent banner.
 * Declining means no ad script is loaded at all.
 *
 * For visitors in the EEA, UK and Switzerland, Google requires a Google-
 * certified CMP. Configure Google's "Privacy & messaging" CMP in AdSense
 * (see docs/ADVERTISING.md); this banner is the basic gate for other regions
 * and a fallback, not a substitute for a certified CMP where one is required.
 */

/** Where ads may appear. The editor, filler and any processing UI are deliberately absent. */
export type AdPlacement = "home-below-hero" | "home-between-sections" | "templates-gallery" | "guide-article" | "guides-index" | "landing-content";

export const AD_CLIENT: string | undefined = import.meta.env.VITE_ADSENSE_CLIENT || undefined;

/** Map placements to ad unit slot IDs, e.g. VITE_ADSENSE_SLOTS="home-below-hero:1234567890,guide-article:2345678901" */
export const AD_SLOTS: Partial<Record<AdPlacement, string>> = Object.fromEntries(
  (import.meta.env.VITE_ADSENSE_SLOTS ?? "")
    .split(",")
    .map((p: string) => p.split(":").map((s: string) => s.trim()))
    .filter((p: string[]) => p.length === 2 && p[0] && p[1]),
);

export type Consent = "granted" | "denied" | null;
const KEY = "pdfquick-forms:ad-consent";

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

const listeners = new Set<(c: Consent) => void>();
export function setConsent(c: Exclude<Consent, null>) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked: choice applies to this page view only */
  }
  listeners.forEach((l) => l(c));
}
export function onConsent(fn: (c: Consent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let scriptPromise: Promise<void> | null = null;
/** Load the AdSense script once, only after consent. */
export function loadAdScript(): Promise<void> {
  if (!AD_CLIENT) return Promise.reject(new Error("Ads not configured"));
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(AD_CLIENT!)}`;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Ad script failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}
