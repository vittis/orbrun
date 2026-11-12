import { cellKey, type CellKey, type Scene, type SceneCell } from '@orbrun/scene'

/** Neutral memory shading, independent of game visibility and interaction. */
export const MEMORY_DARKNESS = 0.56
const DURATION = 0.22
interface Fade { from: number; to: number; start: number }
const target = (cell: SceneCell) => cell.visibility === 'visible' ? 0 : MEMORY_DARKNESS
const sample = (fade: Fade, now: number) => {
  const t = Math.max(0, Math.min(1, (now - fade.start) / DURATION))
  if (t >= 1 - 1e-9) return fade.to
  return fade.from + (fade.to - fade.from) * t * t * (3 - 2 * t)
}

/** Snapshot scalar values: producers may mutate Scene cells before observation. */
export class DungeonVisibility {
  private cells = new Map<CellKey, Fade>()
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
      if (snap) next.set(key, { from: to, to, start: now - DURATION })
      else if (old?.to === to) next.set(key, old)
      else next.set(key, { from: old ? sample(old, now) : 1, to, start: now })
    }
    this.cells = next
    this.initialized = true; this.level = scene.levelKey; this.onLevel = scene.playerOnLevel
    this.player = { x: scene.player.x, y: scene.player.y }
  }

  darkness(cell: SceneCell, now: number) {
    const fade = this.cells.get(cellKey(cell.x, cell.y))
    return fade ? sample(fade, now) : target(cell)
  }

  moving(cell: SceneCell, now: number) {
    const fade = this.cells.get(cellKey(cell.x, cell.y))
    return !!fade && fade.from !== fade.to && now < fade.start + DURATION - 1e-9
  }

  finish() { for (const fade of this.cells.values()) fade.from = fade.to }
  clear() { this.cells.clear(); this.initialized = false }
}
