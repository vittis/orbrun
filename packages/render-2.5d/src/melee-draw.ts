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

export interface MeleeAppearance { weight?: number; trail?: number }

/** Upright stamps deliberately never track a changing tangent. The old rotating
 * heads read like tumbling weapons; these read as a few hand-drawn smear frames. */
function stamp(ctx: Context2d, points: Point[], colours: readonly string[], alpha: number) {
  polygon(ctx, points.map(p => ({ x: p.x + 1 / 32, y: p.y + 1 / 32 })), colours[0], alpha)
  polygon(ctx, points, colours[2], alpha)
  const centre = points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }), { x: 0, y: 0 })
  polygon(ctx, points.map(p => ({ x: centre.x + (p.x - centre.x) * 0.55, y: centre.y + (p.y - centre.y) * 0.55 - 1 / 32 })), colours[3], alpha)
}

/** Travel uses the projected cells; silhouettes stay upright on the tile grid.
 * Each family has its own silhouette, trail envelope and recovery. */
export function drawMelee(ctx: Context2d, p: Projection, stroke: MeleeStroke, now: number, appearance: MeleeAppearance = {}) {
  const age = (now - stroke.born) / stroke.duration
  if (age <= 0 || age >= 1 || p.scale <= 0) return
  const from = project(p, stroke.from.x, stroke.from.y + 0.3)
  const to = project(p, stroke.to.x, stroke.to.y + 0.3)
  const dx = (to.x - from.x) / p.scale, dy = (to.y - from.y) / p.scale, reach = Math.hypot(dx, dy)
  if (reach < 0.01) return
  const style = stroke.style, strength = impactStrength(stroke.intensity)
  const weight = Number.isFinite(appearance.weight) ? Math.max(0.6, Math.min(1.5, appearance.weight!)) : 1
  const trail = Number.isFinite(appearance.trail) ? Math.max(0.4, Math.min(1.4, appearance.trail!)) : 1
  const contact = meleeTiming(style).contact / stroke.duration
  const windup = style === 'stab' ? 0.24 : style === 'cleave' || style === 'crush' ? 0.22 : 0.16
  const recovery = clamp((age - contact) / (1 - contact))
  const advance = clamp((age - windup) / (contact - windup)) ** (style === 'lash' ? 3 : 2)
  const launch = style === 'crush' ? 0.55 : 0
  // Arrest the strike after contact. Stabs withdraw along the same line;
  // sweeping weapons have a short follow-through, never an orbit.
  const retract = style === 'stab' || style === 'thrust' || style === 'unarmed'
  const progress = age < contact ? launch + (1 - launch) * advance
    : retract ? 1 - smooth(recovery) * 0.42 : 1 + (1 - launch) * 0.14 * (1 - Math.exp(-12 * recovery))
  const fade = smooth(advance / 0.12) * (1 - smooth(recovery / (style === 'stab' ? 0.5 : 0.8))) * (stroke.hit ? 1 : 0.48)
  const colours = palettes[stroke.tone ?? 'physical']
  const { path } = meleePath(style, stroke.variant, dx, dy, stroke.hit)
  const size = weight * (0.8 + strength * 0.3)
  const tail = { slash: 0.58, cleave: 0.32, reap: 0.72, staff: 0.35, lash: 0.85, crush: 0.22, thrust: 0.68, stab: 0.25, unarmed: 0.16 }[style]
    * trail * (1 - smooth(recovery / 0.8))
  const tip = path(progress)
  // Fixed attack-axis basis, not a rotating frame sampled from the curve.
  const ux = dx / reach, uy = dy / reach
  const at = (along: number, across: number): Point => ({ x: tip.x + ux * along - uy * across, y: tip.y + uy * along + ux * across })
  const upright = (x: number, y: number): Point => ({ x: tip.x + x * size, y: tip.y + y * size })
  const strokeRibbon = (width: number, alpha = 1, curve = path) => ribbon(ctx, curve, Math.max(launch, progress - tail), progress, width * size, colours, fade * alpha)

  ctx.save()
  ctx.translate(Math.round(from.x), Math.round(from.y - p.scale * 0.42))
  ctx.scale(p.scale / 32, p.scale / 32)
  if (age < windup) {
    // Heavy blows show a held anticipation chip, not a spinning glint.
    if (style === 'crush' || style === 'cleave' || style === 'reap') {
      const q = path(style === 'crush' ? launch * smooth(age / windup) : 0.35)
      const w = 0.055 * size * Math.sin(age / windup * Math.PI)
      polygon(ctx, [{ x: q.x - w, y: q.y - w }, { x: q.x + w, y: q.y - w }, { x: q.x + w, y: q.y + w }, { x: q.x - w, y: q.y + w }], colours[2], 0.6)
    }
  } else if (style === 'slash' || style === 'reap') {
    // Sword: one clean crescent. Polearm: a wider hooked outer cutting edge.
    strokeRibbon(style === 'reap' ? 0.15 : 0.11)
    if (style === 'reap') {
      const inset = (t: number) => { const q = path(t); return { x: q.x * 0.82, y: q.y * 0.82 } }
      strokeRibbon(0.025, 0.45, inset)
    }
  } else if (style === 'cleave') {
    strokeRibbon(0.19, 0.7)
    const hand = dx < 0 ? -1 : 1
    stamp(ctx, [upright(-0.23 * hand, -0.3), upright(0.08 * hand, -0.21), upright(0.16 * hand, -0.05),
      upright(0.07 * hand, 0.015), upright(-0.11 * hand, -0.02)], colours, fade)
  } else if (style === 'crush') {
    // A broad, square hammer smear drops vertically, with two broken speed marks.
    strokeRibbon(0.065, 0.35)
    stamp(ctx, [upright(-0.13, -0.22), upright(0.1, -0.22), upright(0.15, -0.15),
      upright(0.15, 0.01), upright(-0.12, 0.01), upright(-0.16, -0.07)], colours, fade)
    for (const x of [-0.2, 0.2]) polygon(ctx, [upright(x, -0.42), upright(x + 0.025, -0.42), upright(x + 0.025, -0.25), upright(x, -0.2)], colours[1], fade * 0.65)
  } else if (style === 'thrust' || style === 'stab') {
    // Spear: long central shaft and leaf tip. Knife: a short triangular jab.
    strokeRibbon(style === 'thrust' ? 0.028 : 0.045, 0.75)
    const length = style === 'thrust' ? 0.3 : 0.16, w = (style === 'thrust' ? 0.065 : 0.085) * size
    stamp(ctx, [at(0.025, -0.025), at(0.025, 0.025), at(-length * size, w), at(-length * size * 0.72, 0), at(-length * size, -w)], colours, fade)
  } else if (style === 'staff') {
    // A straight baton crosses the target; two separated wood-coloured smears
    // carry the sweep without making the staff look like a sword crescent.
    const wood = stroke.tone && stroke.tone !== 'physical' ? colours : ['#302b2c', '#79634b', '#b6a079', '#e7d4a2']
    ribbon(ctx, path, Math.max(0, progress - tail), Math.max(0, progress - 0.08), 0.035 * size, wood, fade * 0.5)
    stamp(ctx, [at(-0.07 * size, -0.24 * size), at(0.015, -0.24 * size), at(0.015, 0.24 * size), at(-0.07 * size, 0.24 * size)], wood, fade)
  } else if (style === 'lash') {
    // A flexible, segmented lash uncoils into a fine tip. Its wave collapses
    // at contact so it always touches the same authoritative target.
    const lash = (t: number) => {
      const q = path(t), wave = Math.sin(t * Math.PI * 3) * Math.sin(Math.PI * clamp(t)) * (1 - advance) * 0.16
      return { x: q.x - uy * wave, y: q.y + ux * wave }
    }
    for (let i = 0; i < 7; i++) {
      const end = progress - tail * i / 7, start = Math.max(0, end - tail * 0.12)
      ribbon(ctx, lash, start, end, (0.025 + i * 0.004) * size, colours, fade * (1 - i * 0.07))
    }
    stamp(ctx, [at(0.015, 0), at(-0.11 * size, 0.035 * size), at(-0.075 * size, -0.035 * size)], colours, fade)
  } else {
    // Knuckles: compact, upright stepped block, a short jab and no long blade.
    strokeRibbon(0.035, 0.3)
    stamp(ctx, [upright(-0.11, -0.09), upright(0.04, -0.09), upright(0.08, -0.04),
      upright(0.08, 0.06), upright(-0.07, 0.06), upright(-0.12, 0.01)], colours, fade)
  }
  ctx.restore()
}
