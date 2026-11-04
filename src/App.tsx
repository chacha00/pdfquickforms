import { Suspense, lazy, useState } from "react";
import { Link, Route, Routes } from "react-router";
import { Loader2 } from "lucide-react";
import { Layout } from "./components/layout/Layout";
import { Seo } from "./components/layout/Seo";
import { Home } from "./routes/Home";
import { Landing } from "./routes/Landing";
import { Templates } from "./routes/Templates";
import { GuideArticle, GuidesIndex } from "./routes/Guides";
import { Advertising, ContactPage, Cookies, Privacy, Terms } from "./routes/Legal";
import { Status } from "./routes/Status";
import { Premium, PurchaseSuccess, Purchases } from "./routes/Premium";
import { GUIDES, LANDINGS } from "./content/site";
import { StartPanel } from "./features/start/StartPanel";
import { takeEditorStart } from "./features/start/session";

// The editor and filler (and the PDF engines they use) load only when opened.
const Editor = lazy(() => import("./features/editor/Editor").then((m) => ({ default: m.Editor })));
const FillTool = lazy(() => import("./features/fill/FillTool").then((m) => ({ default: m.FillTool })));

const Loading = () => (
  <p className="flex h-screen items-center justify-center gap-2 text-muted-strong" role="status">
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…
  </p>
);

function EditorRoute() {
  const [start] = useState(() => takeEditorStart());
  if (!start) {
    // Opened directly (e.g. after a reload): files only live in memory, so ask again.
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Seo title="Form editor | PDFQuick Forms" description="Edit your fillable PDF form." path="/editor" />
        <h1 className="mb-2 text-2xl font-bold text-ink">Open a form</h1>
        <p className="mb-6 text-muted-strong">Your documents are kept only in this tab, so after a reload please open your PDF again — or continue a saved form.</p>
        <StartPanel />
      </div>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <Seo title="Form editor | PDFQuick Forms" description="Edit your fillable PDF form." path="/editor" />
      <Editor startWith={start} />
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="editor" element={<EditorRoute />} />
      <Route
        path="fill"
        element={
          <Suspense fallback={<Loading />}>
            <Seo title="Fill a PDF | PDFQuick Forms" description="Fill in a PDF form." path="/fill" />
            <FillTool />
          </Suspense>
        }
      />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        {LANDINGS.map((l) => (
          <Route key={l.path} path={l.path.slice(1)} element={<Landing page={l} />} />
        ))}
        <Route path="free-pdf-templates" element={<Templates />} />
        <Route path="guides" element={<GuidesIndex />} />
        {GUIDES.map((g) => (
          <Route key={g.slug} path={`guides/${g.slug}`} element={<GuideArticle guide={g} />} />
        ))}
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="cookies" element={<Cookies />} />
        <Route path="advertising" element={<Advertising />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="status" element={<Status />} />
        <Route path="premium" element={<Premium />} />
        <Route path="purchase/success" element={<PurchaseSuccess />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <Seo title="Page not found | PDFQuick Forms" description="This page doesn't exist." path="/404" />
      <h1 className="text-3xl font-extrabold text-ink">Page not found</h1>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-white hover:bg-primary-hover">
        Go to PDFQuick Forms
      </Link>
    </div>
  );
}
