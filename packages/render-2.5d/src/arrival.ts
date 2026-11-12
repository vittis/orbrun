import { type Scene } from '@orbrun/scene'
import { groundDepth, type Projection } from './projection.js'
import { type Context2d } from './tiles.js'

const DURATION = 0.32
const SHADE = 0.14
interface Position { x: number; y: number; level?: string; onLevel: boolean }
interface Sweep { dx: number; dy: number; start: number }

/** A light veil clears from the origin side toward the destination side.
 * The destination is visible immediately; this never delays game state or input. */
export class DungeonArrival {
  private previous: Position | null = null
  private sweep: Sweep | null = null

  observe(scene: Scene, now: number, animate: boolean) {
    const old = this.previous
    this.previous = { x: scene.player.x, y: scene.player.y, level: scene.levelKey, onLevel: scene.playerOnLevel }
    if (!animate || !old || !old.onLevel || !scene.playerOnLevel || old.level !== scene.levelKey) {
      this.finish()
      return
    }
    const dx = scene.player.x - old.x, dy = scene.player.y - old.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) this.sweep = { dx, dy, start: now }
    // An ordinary step interrupts the cue; stationary updates leave its clock alone.
    else if (dx || dy) this.finish()
  }

  draw(ctx: Context2d, p: Projection, now: number): boolean {
    if (!this.sweep) return false
    const t = Math.max(0, (now - this.sweep.start) / DURATION)
    if (t >= 1 - 1e-9) { this.finish(); return false }
    const dx = this.sweep.dx, dy = this.sweep.dy * groundDepth(p.tilt)
    const length = Math.hypot(dx, dy), x = dx / length, y = dy / length
    // Project all four corners onto the travel axis, including diagonal arrivals.
    const span = Math.abs(x) * p.width + Math.abs(y) * p.height
    const feather = span * 0.55
    const from = -span / 2 - feather * 0.4 + (span + feather * 0.4) * t
    const cx = p.width / 2, cy = p.height / 2
    const veil = ctx.createLinearGradient(cx + x * from, cy + y * from,
      cx + x * (from + feather), cy + y * (from + feather))
    for (const stop of [0, 0.25, 0.5, 0.75, 1]) {
      veil.addColorStop(stop, `rgba(0,0,0,${SHADE * stop * stop * (3 - 2 * stop)})`)
    }
    ctx.save()
    ctx.fillStyle = veil
    ctx.fillRect(0, 0, p.width, p.height)
    ctx.restore()
    return true
  }

  finish() { this.sweep = null }
  clear() { this.finish(); this.previous = null }
}
