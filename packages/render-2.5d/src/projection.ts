/** Orthographic, north-up projection. World coordinates name cell centres. */
export interface Projection {
  x: number
  y: number
  width: number
  height: number
  scale: number
  tilt: number
}

export function project(p: Projection, x: number, y: number, z = 0) {
  return {
    x: p.width / 2 + (x - p.x) * p.scale,
    y: p.height / 2 + ((y - p.y) * Math.sin(p.tilt) - z * Math.cos(p.tilt)) * p.scale,
  }
}

export function unproject(p: Projection, x: number, y: number) {
  return {
    x: p.x + (x - p.width / 2) / p.scale,
    y: p.y + (y - p.height / 2) / (p.scale * Math.sin(p.tilt)),
  }
}

export interface SurfaceRect { x: number; y: number; width: number; height: number }

/** Shared world edges must land on the same device pixel, even at fractional zoom/DPR. */
export function planeRect(p: Projection, x: number, y: number, z: number, dpr: number): SurfaceRect {
  const a = project(p, x - 0.5, y - 0.5, z)
  const b = project(p, x + 0.5, y + 0.5, z)
  const left = Math.round(a.x * dpr) / dpr, top = Math.round(a.y * dpr) / dpr
  return { x: left, y: top, width: Math.round(b.x * dpr) / dpr - left, height: Math.round(b.y * dpr) / dpr - top }
}

/** Fit the full 17-cell LOS diameter, with headroom for upright sprites. */
export function fittedScale(width: number, height: number, tilt: number, zoom = 1) {
  return Math.max(1, Math.min(width / 18, height / (18 * Math.sin(tilt) + 2), 64) * zoom)
}
