import { impactStrength, meleeTiming } from '@orbrun/scene'
import type { MeleeStroke } from './effects.js'
import { project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'
import { meleePath } from './melee-path.js'

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
  polygon(ctx, silhouette.map(p => ({ x: p.x + 1 / 32, y: p.y + 1 / 32 })), colours[0], alpha * 0.8)
  polygon(ctx, silhouette, colours[1], alpha * 0.65)
  polygon(ctx, [...outer, ...edge.reverse()], colours[2], alpha)
  polygon(ctx, [...outer, ...rim.reverse()], colours[3], alpha)
}

/** All geometry is in screen-facing cell units; only the travel axis is
 * projected. Vertical attacks still show a broad swing instead of flattening. */
export function drawMelee(ctx: Context2d, p: Projection, stroke: MeleeStroke, now: number) {
  const age = (now - stroke.born) / stroke.duration
  if (age <= 0 || age >= 1 || p.scale <= 0) return
  const from = project(p, stroke.from.x, stroke.from.y + 0.3)
  const to = project(p, stroke.to.x, stroke.to.y + 0.3)
  const dx = (to.x - from.x) / p.scale, dy = (to.y - from.y) / p.scale, reach = Math.hypot(dx, dy)
  if (reach < 0.01) return
  const strength = impactStrength(stroke.intensity)
  const contact = meleeTiming(stroke.style).contact / stroke.duration
  const windup = 0.16, recovery = clamp((age - contact) / (1 - contact))
  const advance = clamp((age - windup) / (contact - windup)) ** 2
  // Match speed through contact, then brake and dissolve before the next blow.
  const brake = 2 * (1 - contact) / ((contact - windup) * 0.24)
  const launch = stroke.style === 'crush' ? 0.55 : 0
  const progress = age < contact ? launch + (1 - launch) * advance : 1 + (1 - launch) * 0.24 * (1 - Math.exp(-brake * recovery))
  const fade = smooth(advance / 0.12) * (1 - smooth(recovery / 0.78)) * (stroke.hit ? 1 : 0.55)
  const colours = palettes[stroke.tone ?? 'physical']
  const style = stroke.style
  const { path } = meleePath(style, stroke.variant, dx, dy, stroke.hit)

  ctx.save()
  ctx.translate(Math.round(from.x), Math.round(from.y - p.scale * 0.42))
  ctx.scale(p.scale / 32, p.scale / 32)
  if (age < windup) {
    // A small cocked glint makes heavy weapons visibly anticipate the stroke.
    const tip = path(launch * smooth(age / windup)), w = (style === 'cleave' || style === 'crush' ? 0.075 : 0.04) * Math.sin(age / windup * Math.PI)
    polygon(ctx, [{ x: tip.x - w, y: tip.y }, { x: tip.x, y: tip.y - w }, { x: tip.x + w, y: tip.y }, { x: tip.x, y: tip.y + w }], colours[2], 0.65)
  } else {
    const width = (style === 'cleave' ? 0.2 : style === 'crush' ? 0.13 : style === 'slash' ? 0.105 : style === 'unarmed' ? 0.065 : 0.035) * (0.8 + strength * 0.35)
    const tail = (style === 'thrust' ? 0.7 : style === 'unarmed' ? 0.3 : style === 'crush' ? 0.32 : 0.62) * (1 - smooth(recovery / 0.78))
    ribbon(ctx, path, Math.max(launch, progress - tail), progress, width, colours, fade)
    if (style === 'cleave' || style === 'slash') {
      const echo = (t: number) => { const q = path(t); return { x: q.x * 0.85, y: q.y * 0.85 } }
      ribbon(ctx, echo, Math.max(0, progress - tail), Math.max(0, progress - 0.1), width * 0.22, colours, fade * (style === 'cleave' ? 0.45 : 0.25))
    }
    if (style === 'unarmed' || style === 'crush' || style === 'thrust') {
      const tip = path(progress), before = path(progress - 0.01)
      const length = Math.hypot(tip.x - before.x, tip.y - before.y) || 1
      const ux = (tip.x - before.x) / length, uy = (tip.y - before.y) / length
      const head = (along: number, across: number): Point => ({ x: tip.x + ux * along - uy * across, y: tip.y + uy * along + ux * across })
      const r = (style === 'crush' ? 0.115 : style === 'unarmed' ? 0.075 : 0.06) * (0.8 + strength * 0.3)
      const shape = style === 'thrust' ? [head(0.045, 0), head(-0.22, r), head(-0.16, 0), head(-0.22, -r)]
        : [head(0.025, -r * 0.65), head(0.025, r * 0.65), head(-r, r), head(-r * 1.6, r * 0.6), head(-r * 1.6, -r * 0.6), head(-r, -r)]
      polygon(ctx, shape.map(q => ({ x: q.x + 1 / 32, y: q.y + 1 / 32 })), colours[0], fade * 0.8)
      polygon(ctx, shape, colours[2], fade)
      polygon(ctx, [head(0, -r * 0.6), head(0, r * 0.6), head(-r * 0.45, r * 0.5), head(-r * 0.45, -r * 0.5)], colours[3], fade)
    }
  }

  ctx.restore()
}
