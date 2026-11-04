/** Dependency-free so UI code can use it without pulling pdf-lib into the main bundle. */
export type Rotation = 0 | 90 | 180 | 270;

export function normalizeRotation(deg: number): Rotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}
