import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AD_CLIENT, AD_SLOTS, getConsent, loadAdScript, onConsent, type AdPlacement, type Consent } from "./ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A clearly labeled ad container for an allowed placement.
 * - Not configured + development: a labeled placeholder (no network requests).
 * - Not configured + production: renders nothing.
 * - Configured: renders only after consent; never simulates impressions.
 */
export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const [consent, setC] = useState<Consent>(() => getConsent());
  const ins = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const slot = AD_SLOTS[placement];

  useEffect(() => onConsent(setC), []);

  useEffect(() => {
    if (!AD_CLIENT || !slot || consent !== "granted" || pushed.current) return;
    loadAdScript()
      .then(() => {
        if (!ins.current || pushed.current) return;
        pushed.current = true;
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      })
      .catch(() => {
        /* blocked by an ad blocker or network: show nothing */
      });
  }, [consent, slot]);

  if (!AD_CLIENT || !slot) {
    // Placeholders: development, or test builds with VITE_AD_PLACEHOLDERS=1. Never in a normal production build.
    if (!import.meta.env.DEV && import.meta.env.VITE_AD_PLACEHOLDERS !== "1") return null;
    return (
      <aside aria-label="Advertisement placeholder" data-testid="ad-placeholder" data-placement={placement} className={`my-8 ${className}`}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-strong">Advertisement</p>
        <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-muted-strong">
          Ad placeholder ({placement}) — ads are not configured in this build
        </div>
      </aside>
    );
  }
  if (consent !== "granted") return null;

  return (
    <aside aria-label="Advertisement" data-testid="ad-slot" data-placement={placement} className={`my-8 ${className}`}>
      <p className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-strong">
        <span>Advertisement</span>
        <Link to="/advertising" className="normal-case tracking-normal underline">
          About ads
        </Link>
      </p>
      <ins
        ref={ins}
        className="adsbygoogle block min-h-[100px]"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
