import { cellKey, type CellKey, type Scene, type SceneCell } from '@orbrun/scene'

/** Neutral memory shading, independent of game visibility and interaction. */
export const MEMORY_DARKNESS = 0.56
/** Row-major samples at the surrounding nine confirmed cell centres. */
export type VisibilityShade = number | readonly number[]
/** Settled caps and their face edges have a small, discrete set of shades. */
export const settledVisibility = (shade: VisibilityShade) => typeof shade === 'number'
  ? shade === 0 || shade === MEMORY_DARKNESS
  : shade.every(value => value === 0 || value === MEMORY_DARKNESS / 2 || value === MEMORY_DARKNESS)
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Cell-local coordinates, with neighbouring centres one unit apart. */
export function sampleVisibility(shade: VisibilityShade, x: number, y: number) {
  if (typeof shade === 'number') return shade
  const ix = x < 0.5 ? 0 : 1, iy = y < 0.5 ? 0 : 1
  const tx = smooth(x + 0.5 - ix), ty = smooth(y + 0.5 - iy)
  const top = shade[iy * 3 + ix] * (1 - tx) + shade[iy * 3 + ix + 1] * tx
  const bottom = shade[(iy + 1) * 3 + ix] * (1 - tx) + shade[(iy + 1) * 3 + ix + 1] * tx
  return top * (1 - ty) + bottom * ty
}
const DURATION = 0.22
interface Fade { from: number; to: number; start: number; occluder: boolean }
interface Surface { at: number; until: number; plane: VisibilityShade; face?: VisibilityShade }
const target = (cell: SceneCell) => cell.visibility === 'visible' ? 0 : MEMORY_DARKNESS
const sample = (fade: Fade, now: number) => {
  const t = Math.max(0, Math.min(1, (now - fade.start) / DURATION))
  if (t >= 1 - 1e-9) return fade.to
  return fade.from + (fade.to - fade.from) * t * t * (3 - 2 * t)
}

/** Snapshot scalar values: producers may mutate Scene cells before observation. */
export class DungeonVisibility {
  private cells = new Map<CellKey, Fade>()
  private surfaces = new Map<CellKey, Surface>()
  private initialized = false
  private level: string | undefined
  private onLevel = false
  private player = { x: 0, y: 0 }

  observe(scene: Scene, now: number, animate: boolean) {
    // Fast explore/travel can deliver only the destination. Settle the whole
    // view on these arrivals instead of fading the new surroundings from black.
    const jumped = Math.max(Math.abs(scene.player.x - this.player.x), Math.abs(scene.player.y - this.player.y)) > 1
    const snap = !this.initialized || !animate || jumped || !scene.playerOnLevel || scene.levelKey !== this.level || scene.playerOnLevel !== this.onLevel
    const next = new Map<CellKey, Fade>()
    for (const [key, cell] of scene.cells) {
      if (cell.visibility === 'unseen' || cell.kind === 'unknown') continue
      const to = target(cell), old = this.cells.get(key)
      if (snap) next.set(key, { from: to, to, start: now - DURATION, occluder: cell.occluder })
      else if (old?.to === to) next.set(key, old.occluder === cell.occluder ? old : { ...old, occluder: cell.occluder })
      else next.set(key, { from: old ? sample(old, now) : 1, to, start: now, occluder: cell.occluder })
    }
    this.cells = next
    this.surfaces.clear()
    this.initialized = true; this.level = scene.levelKey; this.onLevel = scene.playerOnLevel
    this.player = { x: scene.player.x, y: scene.player.y }
  }

  darkness(cell: SceneCell, now: number) {
    const fade = this.cells.get(cellKey(cell.x, cell.y))
    return fade ? sample(fade, now) : target(cell)
  }

  surface(cell: SceneCell, now: number, face = false): VisibilityShade {
    const key = cellKey(cell.x, cell.y)
    let surface = this.surfaces.get(key)
    if (!surface || surface.at !== now && surface.at < surface.until) {
      surface = this.sampleSurface(cell, now)
      this.surfaces.set(key, surface)
    }
    if (!face || typeof surface.plane === 'number') return surface.plane
    if (!surface.face) {
      // Continue the cap's south edge vertically down the wall face.
      const values = surface.plane
      const edge = values.slice(3, 6).map((value, i) => (value + values[6 + i]) / 2)
      surface.face = [...edge, ...edge, ...edge]
    }
    return surface.face
  }

  private sampleSurface(cell: SceneCell, now: number): Surface {
    const center = this.darkness(cell, now), values: number[] = []
    let until = -Infinity
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const neighbour = this.cells.get(cellKey(cell.x + dx, cell.y + dy))
      // Blend connected surfaces, keeping ground behind a wall from changing
      // its cap. Unknown terrain contributes no information to the field.
      if (neighbour && neighbour.occluder === cell.occluder) {
        values.push(sample(neighbour, now))
        if (neighbour.from !== neighbour.to) until = Math.max(until, neighbour.start + DURATION)
      } else values.push(center)
    }
    return { at: now, until, plane: values.every(value => value === center) ? center : values }
  }

  moving(cell: SceneCell, now: number) {
    const fade = this.cells.get(cellKey(cell.x, cell.y))
    return !!fade && fade.from !== fade.to && now < fade.start + DURATION - 1e-9
  }

  finish() { for (const fade of this.cells.values()) fade.from = fade.to; this.surfaces.clear() }
  clear() { this.cells.clear(); this.surfaces.clear(); this.initialized = false }
}
