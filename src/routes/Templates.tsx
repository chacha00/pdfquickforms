import { Fragment } from "react";
import { useNavigate } from "react-router";
import { FileText } from "lucide-react";
import { Seo } from "../components/layout/Seo";
import { AdSlot } from "../components/advertising/AdSlot";
import { pageMeta } from "../content/site";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "../lib/forms/templates";
import { setEditorStart } from "../features/start/session";
import { CATALOG, formatPrice } from "../lib/purchases";
import { Link } from "react-router";

export function Templates() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Seo {...pageMeta("/free-pdf-templates")} path="/free-pdf-templates" />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Free fillable PDF form templates</h1>
      <p className="mt-3 max-w-3xl text-muted-strong">
        Start from a ready-made layout, change anything you like in the editor, and download a fillable PDF. These are general-purpose templates — they are not official,
        legal, medical or government forms, and you should check they meet your own requirements.
      </p>
      {TEMPLATE_CATEGORIES.map((cat, ci) => (
        <Fragment key={cat.id}>
          <section aria-labelledby={`tc-${cat.id}`} className="mt-10">
            <h2 id={`tc-${cat.id}`} className="text-xl font-bold text-ink">
              {cat.name}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.filter((t) => t.category === cat.id).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorStart({ kind: "template", id: t.id });
                      navigate("/editor");
                    }}
                    className="flex h-full w-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:border-primary/40 hover:shadow-lift"
                  >
                    <FileText className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block font-semibold text-ink">{t.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-strong">{t.description}</span>
                      <span className="mt-2 block text-sm font-semibold text-primary">Use this template →</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {ci === 1 && <AdSlot placement="templates-gallery" />}
        </Fragment>
      ))}
      {CATALOG.length > 0 && (
        <section aria-labelledby="premium-teaser" className="mt-12 rounded-2xl border border-line bg-primary-soft p-6">
          <h2 id="premium-teaser" className="text-lg font-bold text-ink">Want more? Premium packs</h2>
          <p className="mt-1 text-sm text-muted-strong">
            {CATALOG.map((p) => `${p.name} (${formatPrice(p.amount, p.currency)}, one-time)`).join(" · ")} — optional; everything above stays free.
          </p>
          <Link to="/premium" className="mt-3 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">See premium packs</Link>
        </section>
      )}
    </div>
  );
}
