import type { SceneCell } from '@orbrun/scene'
import { groundDepth, planeRect, project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

/** Drawn before terrain, so known floors, walls and actors occlude the mist.
 * Uses only known footprints, never hidden terrain, bounds or actor positions.
 * Analytic world-anchored motion needs no particle simulation or spawn queue. */
export function drawUnexploredAtmosphere(ctx: Context2d, p: Projection, known: readonly SceneCell[], time: number, dpr: number): boolean {
  if (!known.length) return false
  let covered = 0
  for (const cell of known) {
    const r = planeRect(p, cell.x, cell.y, 0, dpr)
    covered += Math.max(0, Math.min(p.width, r.x + r.width) - Math.max(0, r.x))
      * Math.max(0, Math.min(p.height, r.y + r.height) - Math.max(0, r.y))
  }
  // Fully explored viewports should sleep, including zoomed-in rooms.
  if (covered >= p.width * p.height - 1 / (dpr * dpr)) return false

  const sy = groundDepth(p.tilt)
  // Bound fill work even at minimum zoom and on very wide displays.
  const step = Math.max(4, Math.ceil(Math.max(p.width, p.height / sy) / (p.scale * 12)))
  const left = Math.floor((p.x - p.width / p.scale / 2) / step) * step - step
  const right = p.x + p.width / p.scale / 2 + step
  const top = Math.floor((p.y - p.height / (p.scale * sy) / 2) / step) * step - step
  const bottom = p.y + p.height / (p.scale * sy) / 2 + step
  ctx.save()
  ctx.imageSmoothingEnabled = true
  for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) {
    const phase = x * 1.31 + y * 2.17
    const q = project(p, x + Math.sin(phase + time * 0.055) * 1.1, y + Math.cos(phase + time * 0.043) * 0.75)
    const radius = p.scale * step * (0.8 + Math.sin(phase * 1.7) * 0.12)
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, sy * 0.72)
    const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    mist.addColorStop(0, 'rgba(77,93,111,0.14)')
    mist.addColorStop(0.45, 'rgba(67,68,94,0.065)')
    mist.addColorStop(1, 'rgba(45,57,74,0)')
    ctx.fillStyle = mist
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
    ctx.restore()

    // A few soft dust points, with slow continuous drift and gentle breathing.
    // They stay dimmer than gameplay markers and never flash or streak.
    const mote = project(p, x + Math.sin(phase * 7.3 + time * 0.037) * step * 0.7,
      y + Math.cos(phase * 3.1 + time * 0.029) * step * 0.65)
    const alpha = 0.08 + 0.2 * Math.pow(0.5 + 0.5 * Math.sin(phase + time * 0.19), 2)
    const size = Math.max(0.65, Math.min(1.2, p.scale * 0.022))
    const halo = ctx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, size * 3)
    halo.addColorStop(0, `rgba(141,168,186,${alpha})`)
    halo.addColorStop(0.25, `rgba(115,145,166,${alpha * 0.45})`)
    halo.addColorStop(1, 'rgba(99,126,151,0)')
    ctx.fillStyle = halo
    ctx.fillRect(mote.x - size * 3, mote.y - size * 3, size * 6, size * 6)
  }
  ctx.restore()
  return true
}
