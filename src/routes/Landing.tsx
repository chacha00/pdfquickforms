import { Link } from "react-router";
import { ShieldCheck } from "lucide-react";
import { Seo } from "../components/layout/Seo";
import { AdSlot } from "../components/advertising/AdSlot";
import { StartPanel } from "../features/start/StartPanel";
import { GUIDES, LANDINGS, type Faq, type Landing as LandingT } from "../content/site";

export function Faqs({ faq }: { faq: Faq[] }) {
  return (
    <dl className="mt-4 space-y-4">
      {faq.map((f) => (
        <div key={f.q} className="rounded-xl border border-line bg-surface p-4">
          <dt className="font-semibold text-ink">{f.q}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-muted-strong">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Landing({ page }: { page: LandingT }) {
  const others = LANDINGS.filter((l) => l.path !== page.path);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Seo title={page.title} description={page.description} path={page.path} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-strong">
        <Link to="/" className="hover:text-primary">Home</Link> <span aria-hidden>›</span> <span aria-current="page" className="font-medium text-ink">{page.h1}</span>
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{page.h1}</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-strong">{page.intro}</p>

      <div className="mt-8">
        <StartPanel variant={page.start} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-success-ink">
        <ShieldCheck className="h-4 w-4" aria-hidden /> Free · No account · No watermark · Your file stays on your device
      </p>

      <div className="mt-14 grid gap-10 md:grid-cols-[2fr_1fr]">
        <article className="prose-tool">
          {page.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p && <p>{s.p}</p>}
              {s.steps && (
                <ol className="list-decimal space-y-1 pl-5">
                  {s.steps.map((x) => <li key={x}>{x}</li>)}
                </ol>
              )}
              {s.list && (
                <ul className="list-disc space-y-1 pl-5">
                  {s.list.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
            </section>
          ))}
          <AdSlot placement="landing-content" />
          <h2>Frequently asked questions</h2>
          <Faqs faq={page.faq} />
        </article>
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-bold text-ink">More tools</h2>
            <ul className="mt-2 space-y-1.5">
              {others.map((l) => (
                <li key={l.path}>
                  <Link to={l.path} className="font-medium text-primary hover:underline">{l.h1}</Link>
                </li>
              ))}
              <li>
                <Link to="/free-pdf-templates" className="font-medium text-primary hover:underline">Free form templates</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-bold text-ink">Guides</h2>
            <ul className="mt-2 space-y-1.5">
              {GUIDES.slice(0, 4).map((g) => (
                <li key={g.slug}>
                  <Link to={`/guides/${g.slug}`} className="font-medium text-primary hover:underline">{g.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
