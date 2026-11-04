import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Check, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Seo } from "../components/layout/Seo";
import { Alert, Badge, Button } from "../components/ui/primitives";
import { pageMeta } from "../content/site";
import {
  ApiError,
  CATALOG,
  claim,
  describeLicense,
  downloadPack,
  forgetLicense,
  formatPrice,
  paymentsStatus,
  rememberLicense,
  restoreByEmail,
  startCheckout,
  storedLicenses,
  type PackTemplate,
  type StoredLicense,
} from "../lib/purchases";
import { normalizeLicense } from "./licenseFormat";
import { setEditorStart } from "../features/start/session";
import { inputClass } from "../components/ui/primitives";

// ------------------------------------------------------------ /premium
export function Premium() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canceled = new URLSearchParams(useLocation().search).has("canceled");

  useEffect(() => {
    void paymentsStatus().then(setEnabled);
  }, []);

  async function buy(id: string) {
    setBusy(id);
    setError(null);
    try {
      window.location.assign(await startCheckout(id));
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Seo {...pageMeta("/premium")} path="/premium" />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Premium template packs</h1>
      <p className="mt-3 max-w-3xl text-muted-strong">
        Everything in PDFQuick Forms is free. If you'd like a head start, premium packs add ready-made, fully editable forms. Each pack is a{" "}
        <strong>one-time purchase</strong> — no subscription, no account, no recurring charge.
      </p>
      {canceled && (
        <div className="mt-6">
          <Alert tone="info">Checkout was canceled. You weren't charged.</Alert>
        </div>
      )}
      {error && (
        <div className="mt-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {CATALOG.filter((p) => p.kind === "template_pack").map((p) => (
          <section key={p.id} aria-labelledby={`p-${p.id}`} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <h2 id={`p-${p.id}`} className="text-xl font-bold text-ink">
                {p.name}
              </h2>
              <Badge tone="blue">One-time</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-strong">{p.description}</p>
            <p className="mt-4 text-3xl font-extrabold text-ink" data-testid="price">
              {formatPrice(p.amount, p.currency)}
            </p>
            <p className="text-xs text-muted-strong">Paid once. Any sales tax or VAT is added at checkout; you may pay in your local currency.</p>
            <ul className="mt-5 space-y-1.5 text-sm text-ink" aria-label="Included templates">
              {p.includes?.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <Button size="lg" className="w-full" disabled={!enabled || busy !== null} onClick={() => void buy(p.id)} data-testid={`buy-${p.id}`}>
                {busy === p.id ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
                {enabled === false ? "Purchases aren't available yet" : `Buy for ${formatPrice(p.amount, p.currency)}`}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-strong">Secure checkout by Stripe. We never see your card details.</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-10 grid gap-4 text-sm text-muted-strong md:grid-cols-3">
        <p className="flex gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden /> Your PDFs stay on your device. Buying a pack doesn't change that.
        </p>
        <p className="flex gap-2">
          <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden /> After paying you get a license key. Keep it — it's how you get your templates again on another device.
        </p>
        <p>
          Already bought? <Link to="/purchases" className="font-semibold text-primary underline">Open your purchases</Link>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ /purchase/success
export function PurchaseSuccess() {
  const sessionId = new URLSearchParams(useLocation().search).get("session_id") ?? "";
  const [state, setState] = useState<{ kind: "loading" } | { kind: "pending" } | { kind: "done"; lic: StoredLicense; receiptUrl: string | null } | { kind: "error"; message: string }>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        try {
          const r = await claim(sessionId);
          if (r.status === "paid") {
            const lic = { key: r.licenseKey, productId: r.productId, productName: r.productName, packId: r.packId, addedAt: Date.now() };
            rememberLicense(lic);
            if (!cancelled) setState({ kind: "done", lic, receiptUrl: r.receiptUrl });
            return;
          }
          if (!cancelled) setState({ kind: "pending" });
        } catch (e) {
          if (!cancelled) setState({ kind: "error", message: (e as Error).message });
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Seo title="Purchase complete | PDFQuick Forms" description="Your purchase." path="/purchase/success" />
      {state.kind === "loading" && (
        <p className="flex items-center gap-2 text-muted-strong" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Confirming your payment…
        </p>
      )}
      {state.kind === "pending" && (
        <Alert tone="info" title="Your payment is still processing">
          Some payment methods take a little while to confirm. Keep this page open, or come back to this link later — your license appears here as soon as the payment clears.
        </Alert>
      )}
      {state.kind === "error" && <Alert tone="error" title="We couldn't confirm this purchase">{state.message}</Alert>}
      {state.kind === "done" && (
        <div className="space-y-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Thank you!</h1>
          <p className="text-muted-strong">Your {state.lic.productName} is ready.</p>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <p className="text-sm font-semibold text-ink">Your license key</p>
            <p className="mt-2 break-all rounded-lg bg-slate-50 p-3 font-mono text-lg font-bold tracking-wider text-ink" data-testid="license-key">
              {state.lic.key}
            </p>
            <p className="mt-2 text-xs text-muted-strong">Saved in this browser. Copy it somewhere safe to use your templates on another device.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.lic.key);
                  setCopied(true);
                } catch {
                  /* clipboard blocked: key is visible to copy manually */
                }
              }}
            >
              {copied ? "Copied!" : "Copy key"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/purchases" className="inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-white hover:bg-primary-hover">
              Open my templates
            </Link>
            {state.receiptUrl && (
              <a href={state.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl border border-line px-5 font-semibold text-ink hover:bg-slate-50">
                View receipt
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ /purchases
export function Purchases() {
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState<StoredLicense[]>(() => storedLicenses());
  const [keyInput, setKeyInput] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [packs, setPacks] = useState<Record<string, PackTemplate[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function addKey() {
    const key = normalizeLicense(keyInput);
    if (!key) return setMsg({ tone: "error", text: "That doesn't look like a license key (PQF-XXXXX-XXXXX-XXXXX-XXXXX)." });
    setBusy("add");
    try {
      const d = await describeLicense(key);
      rememberLicense({ key, productId: d.productId, productName: d.productName, packId: d.packId, addedAt: Date.now() });
      setLicenses(storedLicenses());
      setKeyInput("");
      setMsg({ tone: "success", text: `Added ${d.productName}.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function open(l: StoredLicense) {
    if (!l.packId) return;
    setBusy(l.key);
    setMsg(null);
    try {
      const p = await downloadPack(l.packId, l.key);
      setPacks((x) => ({ ...x, [l.key]: p.templates }));
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError && e.status === 403 ? e.message : (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Seo title="Your purchases | PDFQuick Forms" description="Your premium template packs." path="/purchases" />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your purchases</h1>
      <p className="mt-2 text-muted-strong">Premium packs you've bought, saved in this browser. No account needed.</p>
      {msg && (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {licenses.length === 0 && <li className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted-strong">No purchases in this browser yet.</li>}
        {licenses.map((l) => (
          <li key={l.key} className="rounded-2xl border border-line bg-surface p-5 shadow-card" data-testid="license-row">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{l.productName}</p>
                <p className="font-mono text-xs text-muted-strong">{l.key}</p>
              </div>
              <div className="flex gap-2">
                {l.packId && (
                  <Button size="sm" onClick={() => void open(l)} disabled={busy !== null}>
                    {busy === l.key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Show templates
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!window.confirm("Remove this license from this browser? Keep a copy of the key if you want to use it again.")) return;
                    forgetLicense(l.key);
                    setLicenses(storedLicenses());
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
            {packs[l.key] && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={`${l.productName} templates`}>
                {packs[l.key]!.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="h-full w-full rounded-xl border border-line p-3 text-left hover:border-primary/40 hover:bg-primary-soft"
                      onClick={() => {
                        setEditorStart({ kind: "templateData", title: t.title, pages: t.pages, elements: t.elements });
                        navigate("/editor");
                      }}
                    >
                      <span className="block text-sm font-semibold text-ink">{t.title}</span>
                      <span className="block text-xs text-muted-strong">{t.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-5" aria-labelledby="add-key">
        <h2 id="add-key" className="font-bold text-ink">Add a license key</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="lic" className="sr-only">License key</label>
          <input id="lic" className={`${inputClass} font-mono`} placeholder="PQF-XXXXX-XXXXX-XXXXX-XXXXX" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          <Button onClick={() => void addKey()} disabled={busy !== null}>Add</Button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5" aria-labelledby="restore">
        <h2 id="restore" className="font-bold text-ink">Lost your key?</h2>
        <p className="mt-1 text-sm text-muted-strong">Enter the email you used at checkout and we'll send your license keys.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="restore-email" className="sr-only">Email</label>
          <input id="restore-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button
            variant="secondary"
            disabled={busy !== null || !email}
            onClick={async () => {
              setBusy("restore");
              try {
                setMsg({ tone: "success", text: (await restoreByEmail(email)).message });
              } catch (e) {
                setMsg({ tone: "error", text: (e as Error).message });
              } finally {
                setBusy(null);
              }
            }}
          >
            Email my keys
          </Button>
        </div>
      </section>
    </div>
  );
}
