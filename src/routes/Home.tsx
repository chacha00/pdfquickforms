import { Link } from "react-router";
import { ArrowRight, Ban, CheckSquare, EyeOff, FileCheck2, Layers, Smartphone } from "lucide-react";
import { Seo } from "../components/layout/Seo";
import { AdSlot } from "../components/advertising/AdSlot";
import { StartPanel } from "../features/start/StartPanel";
import { GUIDES, HOME_FAQ, LANDINGS, pageMeta } from "../content/site";
import { Faqs } from "./Landing";

export function Home() {
  return (
    <>
      <Seo {...pageMeta("/")} path="/" />
      <section className="border-b border-line bg-gradient-to-b from-white to-bg">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-success-ink">
              Make Any PDF Fillable. Free. Fast. Easy.
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Create Fillable PDF Forms Online — Free</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-strong">
              Upload an existing PDF or create a new form from scratch. Add interactive fields, customize your document, and download a professional fillable PDF. No account required.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/make-pdf-fillable" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-white shadow-sm hover:bg-primary-hover">
                Make a PDF Fillable <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/create-fillable-pdf" className="inline-flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 font-semibold text-ink hover:bg-slate-50">
                Create a New Form
              </Link>
            </div>
          </div>
          <div className="mx-auto mt-10 max-w-5xl">
            <StartPanel />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AdSlot placement="home-below-hero" />
      </div>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6" aria-labelledby="why">
        <h2 id="why" className="text-center text-2xl font-bold text-ink sm:text-3xl">
          A genuinely free PDF form maker
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: FileCheck2, t: "Real fillable fields", d: "Downloads contain genuine PDF form fields — text, checkboxes, radio buttons, dropdowns, list boxes, dates and signature fields — checked before you get them." },
            { icon: EyeOff, t: "Private by design", d: "Your PDF is opened and saved in your browser. It's never uploaded to us." },
            { icon: Ban, t: "No subscription, no watermark", d: "Every core feature is free. No account, no trial, no paywall on your download." },
            { icon: Layers, t: "Keeps your original", d: "Text, images, fonts and existing form fields in your PDF are preserved, never silently flattened." },
            { icon: CheckSquare, t: "Auto-detect fields", d: "Get suggestions for blank lines, checkbox symbols and labels — then review them. Free." },
            { icon: Smartphone, t: "Works everywhere", d: "Desktop, tablet and phone, with keyboard and screen-reader friendly controls." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-semibold text-ink">{t}</h3>
              <p className="mt-1 text-sm text-muted-strong">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface" aria-labelledby="tools">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="tools" className="text-2xl font-bold text-ink">
            What do you want to do?
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LANDINGS.map((l) => (
              <li key={l.path}>
                <Link to={l.path} className="block h-full rounded-2xl border border-line p-5 transition hover:border-primary/40 hover:shadow-lift">
                  <span className="font-semibold text-ink">{l.h1}</span>
                  <span className="mt-1 block text-sm text-muted-strong">{l.description.split(". ")[0]}.</span>
                </Link>
              </li>
            ))}
            <li>
              <Link to="/free-pdf-templates" className="block h-full rounded-2xl border border-line p-5 transition hover:border-primary/40 hover:shadow-lift">
                <span className="font-semibold text-ink">Free form templates</span>
                <span className="mt-1 block text-sm text-muted-strong">Intake forms, applications, checklists and more — ready to customize.</span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AdSlot placement="home-between-sections" />
      </div>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold text-ink">
          Questions
        </h2>
        <Faqs faq={HOME_FAQ} />
        <h2 className="mt-12 text-xl font-bold text-ink">Guides</h2>
        <ul className="mt-3 space-y-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link to={`/guides/${g.slug}`} className="font-medium text-primary hover:underline">
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
