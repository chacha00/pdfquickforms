/**
 * Snapping for the editor: to a grid, to the page edges/centre, and to the
 * edges and centres of other elements. Returns the guide lines to draw.
 * Units are display-space points.
 */
import type { DisplayBox } from "../coordinates/geometry";

export interface SnapOptions {
  grid: number | null;
  /** Snap distance in points (scale-independent: callers pass e.g. 6 / zoom). */
  threshold: number;
}

export interface Guides {
  x: number[];
  y: number[];
}

function candidates(boxes: DisplayBox[], page: { width: number; height: number }, axis: "x" | "y"): number[] {
  const out = axis === "x" ? [0, page.width / 2, page.width] : [0, page.height / 2, page.height];
  for (const b of boxes) {
    if (axis === "x") out.push(b.left, b.left + b.width / 2, b.left + b.width);
    else out.push(b.top, b.top + b.height / 2, b.top + b.height);
  }
  return out;
}

function best(edges: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let found: { delta: number; at: number } | null = null;
  for (const e of edges) {
    for (const t of targets) {
      const d = t - e;
      if (Math.abs(d) <= threshold && (!found || Math.abs(d) < Math.abs(found.delta))) found = { delta: d, at: t };
    }
  }
  return found;
}

/** Snap a moving box. Alignment to other elements/page wins over the grid. */
export function snapMove(
  box: DisplayBox,
  others: DisplayBox[],
  page: { width: number; height: number },
  opts: SnapOptions,
): { box: DisplayBox; guides: Guides } {
  const guides: Guides = { x: [], y: [] };
  let { left, top } = box;

  const bx = best([left, left + box.width / 2, left + box.width], candidates(others, page, "x"), opts.threshold);
  if (bx) {
    left += bx.delta;
    guides.x.push(bx.at);
  } else if (opts.grid) left = Math.round(left / opts.grid) * opts.grid;

  const by = best([top, top + box.height / 2, top + box.height], candidates(others, page, "y"), opts.threshold);
  if (by) {
    top += by.delta;
    guides.y.push(by.at);
  } else if (opts.grid) top = Math.round(top / opts.grid) * opts.grid;

  left = Math.max(0, Math.min(left, page.width - box.width));
  top = Math.max(0, Math.min(top, page.height - box.height));
  return { box: { ...box, left, top }, guides };
}

/** Snap the bottom-right corner while resizing. */
export function snapResize(
  box: DisplayBox,
  others: DisplayBox[],
  page: { width: number; height: number },
  opts: SnapOptions,
  min: { width: number; height: number },
): { box: DisplayBox; guides: Guides } {
  const guides: Guides = { x: [], y: [] };
  let right = box.left + box.width;
  let bottom = box.top + box.height;
  const bx = best([right], candidates(others, page, "x"), opts.threshold);
  if (bx) {
    right += bx.delta;
    guides.x.push(bx.at);
  } else if (opts.grid) right = Math.round(right / opts.grid) * opts.grid;
  const by = best([bottom], candidates(others, page, "y"), opts.threshold);
  if (by) {
    bottom += by.delta;
    guides.y.push(by.at);
  } else if (opts.grid) bottom = Math.round(bottom / opts.grid) * opts.grid;
  right = Math.min(right, page.width);
  bottom = Math.min(bottom, page.height);
  return {
    box: { ...box, width: Math.max(min.width, right - box.left), height: Math.max(min.height, bottom - box.top) },
    guides,
  };
}
