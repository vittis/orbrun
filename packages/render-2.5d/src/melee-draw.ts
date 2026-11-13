import { impactStrength, meleeTiming } from '@orbrun/scene'
import type { MeleeStroke } from './effects.js'
import { groundDepth, project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'
import { meleeFrame, meleePath } from './melee-path.js'
import { meleeArt } from './melee-art.js'

interface Point { x: number; y: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
const palettes = {
  physical: ['#303039', '#8b9294', '#d2d3bd', '#fff1ce'],
  fire: ['#492b32', '#b35132', '#f2a649', '#ffe7ac'],
  cold: ['#293849', '#527e9b', '#a4d7df', '#e3fcf3'],
  electric: ['#363049', '#7975ae', '#bbc2ed', '#f5f1ff'],
  poison: ['#30392e', '#64874c', '#afd16b', '#ecf3b8'],
  acid: ['#3c3d29', '#969844', '#d1da73', '#faf0b5'],
  magic: ['#382d49', '#86649e', '#c5a4d6', '#f5deef'],
} as const

/** Scan-convert on the same 32-texel grid as the tile art. Axis-aligned runs
 * retain stepped silhouettes at any attack angle without blur or new assets. */
function polygon(ctx: Context2d, points: Point[], colour: string, alpha: number) {
  if (alpha <= 0 || points.length < 3) return
  const pixels = points.map(p => ({ x: p.x * 32, y: p.y * 32 }))
  const top = Math.floor(Math.min(...pixels.map(p => p.y))), bottom = Math.ceil(Math.max(...pixels.map(p => p.y)))
  ctx.fillStyle = colour; ctx.globalAlpha = alpha
  for (let y = top; y < bottom; y++) {
    const crossings: number[] = []
    for (let i = 0; i < pixels.length; i++) {
      const a = pixels[i], b = pixels[(i + 1) % pixels.length], row = y + 0.5
      if ((a.y <= row && b.y > row) || (b.y <= row && a.y > row)) crossings.push(a.x + (row - a.y) * (b.x - a.x) / (b.y - a.y))
    }
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const x = Math.round(crossings[i]), width = Math.round(crossings[i + 1]) - x
      if (width > 0) ctx.fillRect(x, y, width, 1)
    }
  }
}

/** A tapered ribbon follows the weapon's recent path, rather than drawing a
 * line between cells. Its lit edge and dark underside read like DCSS steel. */
function ribbon(ctx: Context2d, path: (t: number) => Point, start: number, end: number, width: number, colours: readonly string[], alpha: number) {
  if (alpha <= 0 || end - start < 0.001) return
  const outer: Point[] = [], inner: Point[] = [], rim: Point[] = [], edge: Point[] = []
  for (let i = 0; i <= 18; i++) {
    const t = i / 18, u = start + (end - start) * t, p = path(u)
    const a = path(u - 0.005), b = path(u + 0.005), length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length
    const w = width * Math.sin(Math.PI * t) ** 0.7
    outer.push({ x: p.x + nx * w, y: p.y + ny * w })
    inner.push({ x: p.x - nx * w * 0.35, y: p.y - ny * w * 0.35 })
    rim.push({ x: p.x + nx * w * 0.75, y: p.y + ny * w * 0.75 })
    edge.push({ x: p.x + nx * w * 0.38, y: p.y + ny * w * 0.38 })
  }
  const silhouette = [...outer, ...inner.reverse()]
  for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    polygon(ctx, silhouette.map(p => ({ x: p.x + x / 32, y: p.y + y / 32 })), colours[0], alpha)
  }
  polygon(ctx, silhouette, colours[1], alpha)
  polygon(ctx, [...outer, ...edge.reverse()], colours[2], alpha)
  polygon(ctx, [...outer, ...rim.reverse()], colours[3], alpha)
}

export interface MeleeAppearance { weight?: number; trail?: number }

/** Draw authored texels in the SAME frame as the path. The orientation is fixed
 * for the whole swing; only the anchor moves. Scan conversion keeps diagonal
 * pixels sharp without continuously rotating or filtering a Canvas sprite. */
function weapon(ctx: Context2d, style: MeleeStroke['style'], tip: Point, frame: ReturnType<typeof meleeFrame>, size: number,
  colours: readonly string[], alpha: number) {
  const inks: Record<string, string> = { o: colours[0], d: colours[1], m: colours[2], h: colours[3], g: '#c6a46b', w: '#805c42' }
  const texel = size / 32
  for (const pixel of meleeArt[style]) {
    const points = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => {
      const q = frame((pixel.x + x - 0.5) * texel, (pixel.y + y - 0.5) * texel)
      return { x: tip.x + q.x, y: tip.y + q.y }
    })
    polygon(ctx, points, inks[pixel.ink], alpha)
  }
}

/** Common chest-height origin, fixed attack frame, continuous guard-to-contact
 * motion. Opacity is held through the strike and only fades during recovery. */
export function drawMelee(ctx: Context2d, p: Projection, stroke: MeleeStroke, now: number, appearance: MeleeAppearance = {}) {
  const age = (now - stroke.born) / stroke.duration
  if (age <= 0 || age >= 1 || p.scale <= 0) return
  const from = project(p, stroke.from.x, stroke.from.y + 0.3)
  const to = project(p, stroke.to.x, stroke.to.y + 0.3)
  const dx = (to.x - from.x) / p.scale, dy = (to.y - from.y) / p.scale
  if (Math.hypot(dx, dy) < 0.01) return
  const style = stroke.style, strength = impactStrength(stroke.intensity)
  const weight = Number.isFinite(appearance.weight) ? Math.max(0.6, Math.min(1.5, appearance.weight!)) : 1
  const trail = Number.isFinite(appearance.trail) ? Math.max(0.4, Math.min(1.4, appearance.trail!)) : 1
  const contact = meleeTiming(style).contact / stroke.duration
  const recovery = clamp((age - contact) / (1 - contact))
  const windup = 0.16
  const advance = clamp((age - windup) / (contact - windup)) ** 1.5
  const retract = style === 'stab' || style === 'thrust' || style === 'unarmed'
  const progress = age < windup ? 0.12 * smooth(age / windup)
    : age < contact ? 0.12 + 0.88 * advance
    : retract ? 1 - smooth(recovery) * 0.65 : 1 + 0.12 * smooth(recovery / 0.55)
  const opacity = smooth(age / 0.035) * (1 - smooth((recovery - 0.35) / 0.5))
  if (opacity <= 0) return
  const colours = palettes[stroke.tone ?? 'physical']
  const heading = stroke.heading
  const frame = heading ? meleeFrame(heading.x, heading.y * groundDepth(p.tilt)) : meleeFrame(dx, dy)
  const { path } = meleePath(style, dx, dy, stroke.hit, frame)
  const size = weight * (1 + strength * 0.2)
  const tail = { slash: 0.65, cleave: 0.48, reap: 0.75, staff: 0.48, lash: 0.9, crush: 0.18, thrust: 0.65, stab: 0.3, unarmed: 0.25 }[style]
    * trail * (1 - smooth((recovery - 0.2) / 0.65))
  const tip = path(progress), start = Math.max(0, progress - tail)
  const width = { slash: 0.18, cleave: 0.25, reap: 0.23, staff: 0.14, lash: 0.16, crush: 0.16, thrust: 0.075, stab: 0.1, unarmed: 0.1 }[style] * size
  const material = stroke.tone && stroke.tone !== 'physical' ? colours
    : style === 'lash' ? ['#29212b', '#78513f', '#cfab73', '#fff1ce']
    : style === 'staff' ? ['#29212b', '#785a42', '#c8a77a', '#fff1ce'] : colours

  ctx.save()
  ctx.translate(Math.round(from.x), Math.round(from.y - p.scale * 0.42))
  ctx.scale(p.scale / 32, p.scale / 32)
  ribbon(ctx, path, start, progress, width, material, opacity)
  if (style === 'lash') {
    // A solid braided body, with diagonal brass stitches instead of faint,
    // disconnected dots. Keep the backing ribbon continuous underneath.
    for (let i = 1; i < 9; i++) {
      const q = path(start + (progress - start) * i / 9)
      const stitch = [[-0.025, -0.045], [0.02, -0.045], [0.06, 0.045], [0.015, 0.045]].map(([x, y]) => {
        const r = frame(x * size, y * size)
        return { x: q.x + r.x, y: q.y + r.y }
      })
      polygon(ctx, stitch, i % 2 ? material[3] : material[1], opacity)
    }
  }
  weapon(ctx, style, tip, frame, size, material, opacity)
  ctx.restore()
}
