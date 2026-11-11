import type { MeleeStroke, SpellTrace } from './effects.js'
import { project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

/** Short weapon gestures sit below health bars and leave the tile silhouette clear. */
export function drawMelee(ctx: Context2d, p: Projection, stroke: MeleeStroke, now: number) {
  const age = (now - stroke.born) / stroke.duration
  if (age < 0 || age >= 1) return
  const from = project(p, stroke.from.x, stroke.from.y + 0.3)
  const to = project(p, stroke.to.x, stroke.to.y + 0.3)
  const s = p.scale, reach = Math.hypot(to.x - from.x, to.y - from.y)
  ctx.save()
  ctx.translate(from.x, from.y - s * 0.42)
  ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x))
  ctx.globalAlpha = Math.sin(Math.PI * age) * (stroke.hit ? 0.65 : 0.38)
  ctx.strokeStyle = '#eee1c4'
  ctx.lineWidth = Math.max(0.8, s * 0.028)
  ctx.lineCap = 'round'
  const advance = Math.min(1, age / 0.6)
  ctx.beginPath()
  if (stroke.style === 'thrust') {
    const tip = reach * (0.45 + advance * 0.43)
    ctx.moveTo(tip - s * 0.32, 0); ctx.lineTo(tip, 0)
    ctx.moveTo(tip - s * 0.09, -s * 0.055); ctx.lineTo(tip, 0); ctx.lineTo(tip - s * 0.09, s * 0.055)
  } else if (stroke.style === 'slash' || stroke.style === 'cleave') {
    const radius = s * (stroke.style === 'cleave' ? 0.38 : 0.27)
    ctx.arc(reach * 0.64, 0, radius, -1.15, -1.0 + advance * 2.2)
    ctx.stroke()
    ctx.globalAlpha *= 0.3
    ctx.beginPath(); ctx.arc(reach * 0.64, 0, radius * 0.78, -1.05, -1.0 + advance * 1.9)
  } else if (stroke.style === 'crush') {
    const kick = Math.sin(Math.PI * advance)
    ctx.moveTo(reach * 0.35, -s * 0.18 * (1 - advance)); ctx.lineTo(reach * 0.83, s * 0.04)
    for (let i = 0; i < 3; i++) {
      const angle = (i - 1) * 0.9
      ctx.moveTo(reach * 0.85 + Math.cos(angle) * s * 0.07, Math.sin(angle) * s * 0.07)
      ctx.lineTo(reach * 0.85 + Math.cos(angle) * s * (0.08 + kick * 0.13), Math.sin(angle) * s * (0.08 + kick * 0.13))
    }
  } else {
    ctx.ellipse(reach * (0.55 + advance * 0.25), 0, s * 0.08, s * 0.12, 0, -1.6, 1.6)
  }
  ctx.stroke()
  if (stroke.hit && age > 0.3) {
    ctx.fillStyle = '#dcc8a3'; ctx.globalAlpha *= (1 - age) * 0.7
    for (let i = 0; i < 3; i++) {
      const a = i * 2.4, r = s * (age - 0.2) * 0.28
      ctx.fillRect(reach * 0.9 + Math.cos(a) * r, Math.sin(a) * r, Math.max(0.7, s / 65), Math.max(0.7, s / 65))
    }
  }
  ctx.restore()
}

/** Faint floor traces are cosmetic and intentionally unlike solid spell/cloud tiles. */
export function drawSpellTrace(ctx: Context2d, p: Projection, trace: SpellTrace, now: number) {
  const age = (now - trace.born) / trace.duration
  if (age < 0 || age >= 1) return
  const q = project(p, trace.source.x, trace.source.y), s = p.scale
  const seed = trace.source.x * 2.31 + trace.source.y * 1.73
  const [r, g, b] = trace.source.colour
  const fire = trace.source.pulse === 'fire', electric = trace.source.pulse === 'electric'
  const cold = !electric && b > r * 1.25 && g > r
  const fade = (1 - age) ** 1.5
  ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, Math.sin(p.tilt))
  ctx.globalAlpha = fade * 0.22
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.fillStyle = fire ? '#653523' : `rgb(${r},${g},${b})`
  ctx.lineWidth = Math.max(0.7, s / 65)
  for (let i = 0; i < 3; i++) {
    const x = Math.sin(seed + i * 4.1) * s * 0.21, y = Math.cos(seed + i * 3.7) * s * 0.19
    ctx.beginPath()
    if (electric) {
      ctx.moveTo(x - s * 0.1, y); ctx.lineTo(x, y - s * 0.04); ctx.lineTo(x + s * 0.025, y + s * 0.04); ctx.lineTo(x + s * 0.1, y)
    } else if (cold) {
      ctx.moveTo(x - s * 0.055, y); ctx.lineTo(x + s * 0.055, y)
      ctx.moveTo(x, y - s * 0.055); ctx.lineTo(x, y + s * 0.055)
    } else if (fire) {
      ctx.ellipse(x, y, s * 0.1, s * 0.055, seed + i, 0, Math.PI * 2); ctx.fill()
    } else ctx.arc(x, y, s * (0.1 + i * 0.025), seed + i, seed + i + 1.6)
    ctx.stroke()
  }
  ctx.restore()
  // A handful of sharp motes rise from the trace; no blur or full-cell wash.
  ctx.save(); ctx.fillStyle = `rgb(${r},${g},${b})`
  for (let i = 0; i < 3; i++) {
    const life = (age * 1.4 + i / 3) % 1
    ctx.globalAlpha = Math.sin(life * Math.PI) * fade * 0.38
    const size = Math.max(0.7, s / 70)
    ctx.fillRect(q.x + Math.sin(seed + i * 3.4 + life) * s * 0.22, q.y - life * s * 0.33, size, size)
  }
  ctx.restore()
}
