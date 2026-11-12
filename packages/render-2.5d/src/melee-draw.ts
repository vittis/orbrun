import { impactStrength, meleeTiming } from '@orbrun/scene'
import type { MeleeStroke } from './effects.js'
import { project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

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
  const ux = dx / reach, uy = dy / reach, strength = impactStrength(stroke.intensity)
  const contact = meleeTiming(stroke.style).contact / stroke.duration
  const windup = 0.16, recovery = clamp((age - contact) / (1 - contact))
  const advance = clamp((age - windup) / (contact - windup)) ** 2
  const progress = age < contact ? advance : 1 + 0.38 * smooth(recovery / 0.6)
  const fade = (1 - smooth(recovery)) * (stroke.hit ? 1 : 0.55)
  const colours = palettes[stroke.tone ?? 'physical']
  const local = (x: number, y: number): Point => ({ x: ux * x - uy * y, y: uy * x + ux * y })
  const style = stroke.style
  const path = (t: number): Point => {
    let q: Point
    if (style === 'slash' || style === 'cleave') {
      const angle = (t - 1) * (style === 'cleave' ? 1.8 : 1.3)
      const radius = reach * 0.86
      q = local(reach - radius + Math.cos(angle) * radius, Math.sin(angle) * radius * 0.8)
    } else if (style === 'crush') {
      // Lift above the defender even when facing north, so the blow always
      // descends into contact rather than folding back over its own trail.
      const lift = 0.65 + Math.max(0, -dy) * 0.75
      q = { x: dx * (0.25 + t * 0.75) - uy * Math.sin(t * Math.PI) * 0.12, y: dy * (0.25 + t * 0.75) - (1 - t) * lift }
    } else {
      q = local(reach * (0.12 + t * 0.88), 0)
    }
    // A miss passes beside the defender and has no contact flash or debris.
    const miss = stroke.hit ? 0 : smooth(t) * 0.23
    return { x: q.x - uy * miss, y: q.y + ux * miss }
  }

  ctx.save()
  ctx.translate(Math.round(from.x), Math.round(from.y - p.scale * 0.42))
  ctx.scale(p.scale / 32, p.scale / 32)
  if (age < windup) {
    // A small cocked glint makes heavy weapons visibly anticipate the stroke.
    const tip = path(0), w = (style === 'cleave' || style === 'crush' ? 0.075 : 0.04) * Math.sin(age / windup * Math.PI)
    polygon(ctx, [{ x: tip.x - w, y: tip.y }, { x: tip.x, y: tip.y - w }, { x: tip.x + w, y: tip.y }, { x: tip.x, y: tip.y + w }], colours[2], 0.65)
  } else {
    const width = (style === 'cleave' ? 0.19 : style === 'crush' ? 0.15 : style === 'slash' ? 0.12 : style === 'unarmed' ? 0.09 : 0.055) * (0.8 + strength * 0.35)
    const tail = style === 'thrust' ? 0.7 : style === 'unarmed' ? 0.32 : 0.65
    ribbon(ctx, path, Math.max(0, progress - tail), progress, width, colours, fade)
    if (style === 'cleave' || style === 'slash') {
      const echo = (t: number) => { const q = path(t); return { x: q.x * 0.83, y: q.y * 0.83 } }
      ribbon(ctx, echo, Math.max(0, progress - 0.7), Math.max(0, progress - 0.12), width * 0.26, colours, fade * 0.4)
    }
    if (style === 'unarmed') {
      const tip = path(progress), r = 0.065 * (1 - recovery * 0.6)
      polygon(ctx, [{ x: tip.x - r, y: tip.y - r }, { x: tip.x + r, y: tip.y - r }, { x: tip.x + r, y: tip.y + r }, { x: tip.x - r, y: tip.y + r }], colours[2], fade)
    }
  }

  if (stroke.hit && age >= contact) {
    const flash = clamp(1 - recovery / 0.35), radius = (style === 'crush' || style === 'cleave' ? 0.22 : 0.14) * (0.75 + strength * 0.5)
    const points: Point[] = []
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, r = (i % 2 ? 0.28 : i % 4 ? 0.65 : 1) * radius * (1 + recovery)
      points.push({ x: dx + Math.cos(angle) * r, y: dy + Math.sin(angle) * r })
    }
    polygon(ctx, points, colours[2], flash)
    polygon(ctx, points.map(q => ({ x: dx + (q.x - dx) * 0.5, y: dy + (q.y - dy) * 0.5 })), colours[3], flash)
    const count = 3 + Math.round(strength * 5)
    for (let i = 0; i < count; i++) {
      const angle = i * 2.4 + stroke.from.x * 0.7 + stroke.to.y * 1.3
      const travel = Math.sqrt(recovery) * (0.18 + strength * 0.24)
      const x = dx + Math.cos(angle) * travel, y = dy + Math.sin(angle) * travel - Math.sin(recovery * Math.PI) * 0.08
      const outward = style === 'crush' || style === 'cleave' ? 0.07 : 0.045
      polygon(ctx, [{ x, y }, { x: x + Math.cos(angle) * outward, y: y + Math.sin(angle) * outward }, { x: x - Math.sin(angle) / 32, y: y + Math.cos(angle) / 32 }], colours[i % 2 ? 2 : 3], (1 - recovery) ** 2)
    }
  }
  ctx.restore()
}
