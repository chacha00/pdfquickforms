/**
 * Maps between "display space" (what the user sees: top-left origin, y down,
 * page already turned by its /Rotate, units = PDF points) and PDF "user
 * space" (bottom-left origin, y up, unrotated). Pure — unit tested.
 */
import type { Rotation } from "../pdf/rotation";

/** Page box in user space: [x0, y0, x1, y1] (the crop box). */
export type PageBox = [number, number, number, number];

export interface DisplayBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function displaySize(box: PageBox, rotation: Rotation): { width: number; height: number } {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  return rotation === 90 || rotation === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** Convert one display-space point to user space. */
export function displayToUser(dx: number, dy: number, box: PageBox, rotation: Rotation): [number, number] {
  const [x0, y0, x1, y1] = box;
  switch (rotation) {
    case 0:
      return [x0 + dx, y1 - dy];
    case 90:
      return [x0 + dy, y0 + dx];
    case 180:
      return [x1 - dx, y0 + dy];
    case 270:
      return [x1 - dy, y1 - dx];
  }
}

/** Convert a display-space rectangle to the user-space rectangle that covers it. */
export function displayBoxToUserRect(b: DisplayBox, box: PageBox, rotation: Rotation): UserRect {
  const [ax, ay] = displayToUser(b.left, b.top, box, rotation);
  const [bx, by] = displayToUser(b.left + b.width, b.top + b.height, box, rotation);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Keep a box inside the page (display space). */
export function clampBox(b: DisplayBox, page: { width: number; height: number }): DisplayBox {
  const width = Math.min(b.width, page.width);
  const height = Math.min(b.height, page.height);
  return {
    width,
    height,
    left: Math.max(0, Math.min(b.left, page.width - width)),
    top: Math.max(0, Math.min(b.top, page.height - height)),
  };
}

/**
 * Helvetica metrics (AFM: ascender 718, descender -207 per 1000 em).
 * Labels are drawn in a box of height = 1.2 × font size with the glyphs
 * vertically centred, matching the editor's line-height: 1.2.
 */
export const LABEL_LINE_HEIGHT = 1.2;
export function labelBaselineOffset(fontSize: number): number {
  const asc = 0.718;
  const desc = 0.207;
  return ((LABEL_LINE_HEIGHT - (asc + desc)) / 2 + asc) * fontSize;
}

/**
 * pdf-lib's `addToPage({ x, y, width, height, rotate, borderWidth })` treats
 * width/height as the widget's *visual* size, rotates the rectangle about
 * (x, y), and grows it by borderWidth/2 on every side. This returns the options
 * that make the final widget rectangle exactly equal `target` (user space).
 */
export function widgetPlacement(target: UserRect, rotation: Rotation, borderWidth: number): UserRect {
  const b = borderWidth / 2;
  const X = target.x + b;
  const Y = target.y + b;
  const W = Math.max(0.5, target.width - borderWidth);
  const H = Math.max(0.5, target.height - borderWidth);
  switch (rotation) {
    case 0:
      return { x: X, y: Y, width: W, height: H };
    case 90:
      return { x: X + W, y: Y, width: H, height: W };
    case 180:
      return { x: X + W, y: Y + H, width: W, height: H };
    case 270:
      return { x: X, y: Y + H, width: H, height: W };
  }
}

/** Inverse of displayToUser: user-space point -> display-space point. */
export function userToDisplay(ux: number, uy: number, box: PageBox, rotation: Rotation): [number, number] {
  const [x0, y0, x1, y1] = box;
  switch (rotation) {
    case 0:
      return [ux - x0, y1 - uy];
    case 90:
      return [uy - y0, ux - x0];
    case 180:
      return [x1 - ux, uy - y0];
    case 270:
      return [y1 - uy, x1 - ux];
  }
}

/** Convert a user-space rectangle (e.g. an existing widget /Rect) to display space. */
export function userRectToDisplayBox(r: UserRect, box: PageBox, rotation: Rotation): DisplayBox {
  const [ax, ay] = userToDisplay(r.x, r.y, box, rotation);
  const [bx, by] = userToDisplay(r.x + r.width, r.y + r.height, box, rotation);
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}
