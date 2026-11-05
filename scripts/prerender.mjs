// Post-build SEO prerender for PDFQuick Forms.
// Writes dist/<route>.html for every indexable route with its own title,
// description, canonical, Open Graph, JSON-LD and crawlable content; plus
// sitemap.xml, a noindex 404.html and noindex editor/fill shells. React replaces
// the static content on load. If VITE_ADSENSE_CLIENT is set, the CSP in
// dist/_headers is extended with Google's ad domains.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const data = JSON.parse(readFileSync(join(root, "src", "content", "site.json"), "utf8"));
// The Google AdSense loader sits in index.html's <head>, so every generated page carries it.
// Test builds set STRIP_AD_LOADER=1 so no real ad network is contacted during e2e runs.
const AD_LOADER = /[ \t]*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"\s+crossorigin="anonymous"><\/script>\n?/;
let template = readFileSync(join(dist, "index.html"), "utf8");
if (process.env.STRIP_AD_LOADER === "1") {
  template = template.replace(AD_LOADER, "");
  writeFileSync(join(dist, "index.html"), template);
}
const hasAdLoader = AD_LOADER.test(template);
const origin = data.site.origin;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

function head({ title, description, path, jsonLd = [], noindex = false }) {
  const url = `${origin}${path}`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    noindex ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:site_name" content="PDFQuick Forms" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...jsonLd.map(ld),
  ].join("\n    ");
}

const nav = `<nav aria-label="Main"><a href="/">PDFQuick Forms</a> · ${data.landings
  .slice(0, 3)
  .map((l) => `<a href="${l.path}">${esc(l.h1)}</a>`)
  .join(" · ")} · <a href="/free-pdf-templates">Templates</a> · <a href="/guides">Guides</a></nav>`;
const links = [...data.landings.map((l) => [l.path, l.h1]), ["/free-pdf-templates", "Free form templates"], ...data.guides.map((g) => [`/guides/${g.slug}`, g.title])];
const linkList = `<ul>${links.map(([h, t]) => `<li><a href="${h}">${esc(t)}</a></li>`).join("")}</ul>`;
const faqHtml = (faq) => faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
const faqLd = (faq) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
const crumbs = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + path })),
});
const app = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PDFQuick Forms",
  url: origin + "/",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web browser)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const routes = [];
function page(path, h, body, { index = true } = {}) {
  const html = template.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, h).replace("<!--prerender-->", `${nav}<main>${body}</main>`);
  if (html === template) throw new Error("Template markers missing in dist/index.html");
  const file = path === "/" ? join(dist, "index.html") : join(dist, `${path.slice(1)}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  if (index) routes.push(path);
}

// Home
{
  const m = data.pages["/"];
  page("/", head({ ...m, path: "/", jsonLd: [app, faqLd(data.homeFaq)] }), `<h1>${esc(m.h1)}</h1><p>${esc(m.description)}</p>${linkList}<h2>Questions</h2>${faqHtml(data.homeFaq)}`);
}
// Landing pages
for (const l of data.landings) {
  const sections = l.sections
    .map(
      (s) =>
        `<h2>${esc(s.h)}</h2>${s.p ? `<p>${esc(s.p)}</p>` : ""}${s.steps ? `<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}${
          s.list ? `<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""
        }`,
    )
    .join("");
  page(
    l.path,
    head({
      title: l.title,
      description: l.description,
      path: l.path,
      jsonLd: [{ ...app, url: origin + l.path, name: `PDFQuick Forms — ${l.h1}` }, faqLd(l.faq), crumbs([["Home", "/"], [l.h1, l.path]])],
    }),
    `<h1>${esc(l.h1)}</h1><p>${esc(l.intro)}</p><noscript><p>This tool runs in your browser and needs JavaScript.</p></noscript>${sections}<h2>Frequently asked questions</h2>${faqHtml(l.faq)}<h2>More</h2>${linkList}`,
  );
}
// Template gallery (titles + descriptions read from the template source)
{
  const m = data.pages["/free-pdf-templates"];
  const src = readFileSync(join(root, "src", "lib", "forms", "templates.ts"), "utf8");
  const items = [...src.matchAll(/t\("([\w-]+)", "([^"]+)", "(\w+)", "([^"]+)"/g)].map((x) => [x[2], x[4]]);
  page("/free-pdf-templates", head({ ...m, path: "/free-pdf-templates" }), `<h1>${esc(m.h1)}</h1><p>${esc(m.description)}</p><ul>${items.map(([t, d]) => `<li><strong>${esc(t)}</strong> — ${esc(d)}</li>`).join("")}</ul>`);
}
// Guides
{
  const m = data.pages["/guides"];
  page("/guides", head({ ...m, path: "/guides" }), `<h1>${esc(m.h1)}</h1><ul>${data.guides.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}</a> — ${esc(g.description)}</li>`).join("")}</ul>`);
  for (const g of data.guides) {
    const path = `/guides/${g.slug}`;
    page(
      path,
      head({
        title: `${g.title} | PDFQuick Forms`,
        description: g.description,
        path,
        jsonLd: [{ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, url: origin + path }, crumbs([["Guides", "/guides"], [g.title, path]])],
      }),
      `<article><h1>${esc(g.title)}</h1><p>${esc(g.description)}</p>${g.body.map((b) => `<h2>${esc(b.h)}</h2><p>${esc(b.p)}</p>`).join("")}</article>`,
    );
  }
}
// Static pages
for (const path of ["/privacy", "/terms", "/cookies", "/advertising", "/contact", "/status"]) {
  const m = data.pages[path];
  page(path, head({ ...m, path }), `<h1>${esc(m.h1)}</h1><p>${esc(m.description)}</p>`);
}
// Premium packs (indexable; prices from the same catalog the server uses)
{
  const m = data.pages["/premium"];
  const cat = JSON.parse(readFileSync(join(root, "src", "content", "catalog.json"), "utf8")).products.filter((p) => p.active);
  const money = (p) => `${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
  page(
    "/premium",
    head({ ...m, path: "/premium", jsonLd: cat.map((p) => ({ "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description, offers: { "@type": "Offer", price: (p.amount / 100).toFixed(2), priceCurrency: p.currency.toUpperCase(), availability: "https://schema.org/InStock" } })) }),
    `<h1>${esc(m.h1)}</h1><p>${esc(m.description)}</p>${cat.map((p) => `<h2>${esc(p.name)} — ${money(p)}, one-time</h2><p>${esc(p.description)}</p><ul>${(p.includes ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}`,
  );
}
// App shells (not indexed)
page("/purchase/success", head({ title: "Purchase complete | PDFQuick Forms", description: "Your purchase.", path: "/purchase/success", noindex: true }), "<h1>Purchase</h1>", { index: false });
page("/purchases", head({ title: "Your purchases | PDFQuick Forms", description: "Your premium template packs.", path: "/purchases", noindex: true }), "<h1>Your purchases</h1>", { index: false });
page("/editor", head({ title: "Form editor | PDFQuick Forms", description: "Edit your fillable PDF form.", path: "/editor", noindex: true }), "<h1>Form editor</h1>", { index: false });
page("/fill", head({ title: "Fill a PDF | PDFQuick Forms", description: "Fill in a PDF form.", path: "/fill", noindex: true }), "<h1>Fill a PDF</h1>", { index: false });
writeFileSync(
  join(dist, "404.html"),
  template
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, head({ title: "Page not found | PDFQuick Forms", description: "This page doesn't exist.", path: "/404", noindex: true }))
    .replace("<!--prerender-->", `${nav}<main><h1>Page not found</h1></main>`),
);

// Sitemap
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
    .map((r) => `  <url><loc>${origin}${r}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);

// Extend CSP for AdSense when the loader is in the page head or a client ID is configured.
if (hasAdLoader || process.env.VITE_ADSENSE_CLIENT) {
  const p = join(dist, "_headers");
  const h = readFileSync(p, "utf8")
    .replace("script-src 'self'", "script-src 'self' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.gstatic.com https://*.doubleclick.net https://*.adtrafficquality.google")
    .replace("frame-src 'self'", "frame-src 'self' https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com")
    .replace("img-src 'self'", "img-src 'self' https:")
    .replace("; connect-src 'self'", "; connect-src 'self' https://*.google.com https://*.googlesyndication.com https://*.doubleclick.net https://*.adtrafficquality.google");
  writeFileSync(p, h);
  console.log("Ads enabled: extended CSP in dist/_headers");
}
console.log(`Prerendered ${routes.length} indexable routes + editor/fill shells + 404.html; sitemap.xml written.`);
