import { useEffect } from "react";
import { SITE } from "../../content/site";

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Keeps <title>, description and canonical in sync during client-side
 * navigation. The initial HTML for each route is prerendered at build time
 * (scripts/prerender.mjs) so crawlers see the same values without JS.
 */
export function Seo({ title, description, path }: { title: string; description: string; path: string; h1?: string }) {
  useEffect(() => {
    document.title = title;
    const url = `${SITE.origin}${path}`;
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
  }, [title, description, path]);
  return null;
}
