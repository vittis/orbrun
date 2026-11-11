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

/** Fit the full 17-cell LOS diameter, with headroom for upright sprites. */
export function fittedScale(width: number, height: number, tilt: number, zoom = 1) {
  return Math.max(1, Math.min(width / 18, height / (18 * Math.sin(tilt) + 2), 64) * zoom)
}
