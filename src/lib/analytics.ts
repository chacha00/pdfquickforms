/**
 * Privacy-conscious analytics.
 *
 * - Disabled unless VITE_ANALYTICS_ENDPOINT is set at build time.
 * - Sends only an event name, tool id and small numeric/enum properties.
 * - Never sends file names, file contents, extracted text, or passwords —
 *   the type below makes that hard to do by accident.
 * - No cookies, no identifiers.
 */
export type AnalyticsEvent =
  | "tool_view"
  | "files_added"
  | "process_start"
  | "process_success"
  | "process_error"
  | "process_cancel"
  | "download";

type SafeProps = {
  tool?: string;
  count?: number;
  pages?: number;
  errorCode?: string;
  format?: "pdf" | "zip" | "jpg" | "png" | "txt";
};

const endpoint: string | undefined = import.meta.env.VITE_ANALYTICS_ENDPOINT;

export function track(event: AnalyticsEvent, props: SafeProps = {}): void {
  if (!endpoint || typeof navigator === "undefined") return;
  const body = JSON.stringify({ event, ...props, path: location.pathname });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    else void fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    /* analytics must never break the app */
  }
}
