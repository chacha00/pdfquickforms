import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Menu, ShieldCheck, X } from "lucide-react";
import { Logo } from "./Logo";
import { ConsentBanner } from "../advertising/ConsentBanner";

const NAV = [
  { to: "/make-pdf-fillable", label: "Make PDF Fillable" },
  { to: "/create-fillable-pdf", label: "Create a Form" },
  { to: "/fill-pdf-online", label: "Fill a PDF" },
  { to: "/free-pdf-templates", label: "Templates" },
  { to: "/guides", label: "Guides" },
];

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="rounded-lg" aria-label="PDFQuick Forms home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "text-primary" : "text-muted-strong hover:text-ink"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-surface px-4 pb-4 lg:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="block rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-slate-50">
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted-strong">Make Any PDF Fillable. Free. Fast. Easy.</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-strong">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> Your PDFs are processed in your browser and never uploaded.
            </p>
          </div>
          <FooterCol
            title="Tools"
            links={[
              ["/make-pdf-fillable", "Make a PDF fillable"],
              ["/create-fillable-pdf", "Create a fillable PDF"],
              ["/fill-pdf-online", "Fill a PDF online"],
              ["/add-text-fields-to-pdf", "Add text fields"],
              ["/add-checkboxes-to-pdf", "Add checkboxes"],
              ["/add-signature-to-pdf", "Add a signature area"],
              ["/pdf-form-builder", "PDF form builder"],
              ["/free-pdf-templates", "Free templates"],
              ["/premium", "Premium template packs"],
            ]}
          />
          <FooterCol
            title="About"
            links={[
              ["/guides", "Guides"],
              ["/privacy", "Privacy policy"],
              ["/cookies", "Cookie policy"],
              ["/advertising", "Advertising disclosure"],
              ["/terms", "Terms of use"],
              ["/contact", "Contact"],
              ["/status", "Feature status"],
            ]}
          />
        </div>
        <div className="border-t border-line py-4 text-center text-xs text-muted-strong">© {new Date().getFullYear()} PDFQuick Forms · Free, no subscriptions</div>
      </footer>
      <ConsentBanner />
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-muted-strong hover:text-primary">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
