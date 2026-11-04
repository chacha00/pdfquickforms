import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AD_CLIENT, getConsent, onConsent, setConsent, type Consent } from "./ads";
import { Button } from "../ui/primitives";

/** Shown only when ads are configured and the visitor hasn't chosen yet. Equal-weight choices. */
export function ConsentBanner() {
  const [consent, setC] = useState<Consent>(() => getConsent());
  useEffect(() => onConsent(setC), []);
  if (!AD_CLIENT || consent !== null) return null;
  return (
    <div role="region" aria-label="Advertising consent" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface p-4 shadow-lift">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink">
          PDFQuick Forms is free because of ads on our informational pages (never in the editor). May we show ads from Google, which uses cookies to serve and measure them?{" "}
          <Link to="/cookies" className="font-semibold underline">
            Cookie policy
          </Link>
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConsent("denied")}>
            No ads cookies
          </Button>
          <Button variant="secondary" onClick={() => setConsent("granted")}>
            Allow ads
          </Button>
        </div>
      </div>
    </div>
  );
}
