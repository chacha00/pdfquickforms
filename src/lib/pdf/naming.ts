/** Output file naming. Keeps names safe for every OS and predictable for users. */

export function baseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
  // Strip path separators, control characters and characters Windows forbids.
  const cleaned = withoutExt
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || "document").slice(0, 120);
}

export function outputName(source: string, suffix: string, ext = "pdf"): string {
  return `${baseName(source)}-${suffix}.${ext}`;
}

/** "report.pdf", range [2,3,4] -> "report-pages-3-5.pdf" */
export function rangeOutputName(source: string, pages: number[], ext = "pdf"): string {
  if (pages.length === 0) return outputName(source, "empty", ext);
  const first = pages[0]! + 1;
  const last = pages[pages.length - 1]! + 1;
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1]! + 1);
  if (pages.length === 1) return outputName(source, `page-${first}`, ext);
  if (contiguous) return outputName(source, `pages-${first}-${last}`, ext);
  return outputName(source, `pages-${first}-to-${last}-selected`, ext);
}

/** Ensure names inside a ZIP are unique: a.pdf, a (2).pdf, ... */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${count + 1})${n.slice(dot)}` : `${n} (${count + 1})`;
  });
}
