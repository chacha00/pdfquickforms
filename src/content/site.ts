import data from "./site.json";

export interface Faq {
  q: string;
  a: string;
}
export interface PageMeta {
  title: string;
  description: string;
  h1: string;
}
export interface LandingSection {
  h: string;
  p?: string;
  steps?: string[];
  list?: string[];
}
export interface Landing extends PageMeta {
  path: string;
  start: "fillable" | "create" | "fill";
  tool?: string;
  intro: string;
  sections: LandingSection[];
  faq: Faq[];
}
export interface Guide {
  slug: string;
  title: string;
  description: string;
  body: { h: string; p: string }[];
}

export const SITE = data.site;
export const PAGES = data.pages as Record<string, PageMeta>;
export const LANDINGS = data.landings as Landing[];
export const GUIDES = data.guides as Guide[];
export const HOME_FAQ = data.homeFaq as Faq[];

export function pageMeta(path: string): PageMeta {
  const m = PAGES[path];
  if (!m) throw new Error(`No page metadata for ${path}`);
  return m;
}
