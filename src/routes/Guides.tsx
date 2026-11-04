import { Link } from "react-router";
import { Seo } from "../components/layout/Seo";
import { AdSlot } from "../components/advertising/AdSlot";
import { GUIDES, LANDINGS, pageMeta, type Guide } from "../content/site";

export function GuidesIndex() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Seo {...pageMeta("/guides")} path="/guides" />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">PDF form guides</h1>
      <ul className="mt-8 space-y-4">
        {GUIDES.map((g) => (
          <li key={g.slug} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Link to={`/guides/${g.slug}`} className="text-lg font-semibold text-primary hover:underline">
              {g.title}
            </Link>
            <p className="mt-1 text-sm text-muted-strong">{g.description}</p>
          </li>
        ))}
      </ul>
      <AdSlot placement="guides-index" />
    </div>
  );
}

export function GuideArticle({ guide }: { guide: Guide }) {
  return (
    <article className="prose-tool mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Seo title={`${guide.title} | PDFQuick Forms`} description={guide.description} path={`/guides/${guide.slug}`} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-strong">
        <Link to="/guides" className="hover:text-primary">Guides</Link> <span aria-hidden>›</span> <span aria-current="page">{guide.title}</span>
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{guide.title}</h1>
      <p className="mt-3 text-lg">{guide.description}</p>
      {guide.body.map((b, i) => (
        <section key={b.h}>
          <h2>{b.h}</h2>
          <p>{b.p}</p>
          {i === 1 && <AdSlot placement="guide-article" />}
        </section>
      ))}
      <div className="mt-10 rounded-2xl border border-line bg-primary-soft p-5">
        <p className="font-semibold text-ink">Try it now — free, no account</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANDINGS.slice(0, 3).map((l) => (
            <Link key={l.path} to={l.path} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">
              {l.h1}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
