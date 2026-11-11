import type { MeleeStroke, SpellTrace, SpellBurst } from './effects.js'
import { project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

const burstColours: Record<SpellBurst['kind'], string> = {
  cold: '#a5e7ff', fire: '#ff9a47', electric: '#c0d9ff', poison: '#9de85e', acid: '#d1f46c',
  air: '#d8edf0', earth: '#d7b68b', drain: '#c178dd', holy: '#ffe6a0', magic: '#d1acff',
  heal: '#7ff0bd', buff: '#f6d998', debuff: '#cda1ec', teleport: '#b8a3ff',
}

/** Cell-local bursts surround upright actors, so contact spells remain readable
 * without inventing a missile. Geometry is depth sorted with walls and sprites. */
export function drawSpellBurst(ctx: Context2d, p: Projection, burst: SpellBurst, now: number) {
  const age = (now - burst.born) / burst.duration
  if (age < 0 || age >= 1) return
  const q = project(p, burst.x, burst.y + 0.22), s = p.scale, kind = burst.kind
  const fade = (1 - age) ** 1.2, expand = 1 - (1 - age) ** 3
  const seed = burst.x * 2.31 + burst.y * 1.73
  ctx.save(); ctx.translate(q.x, q.y - s * 0.42)
  ctx.strokeStyle = ctx.fillStyle = burstColours[kind]
  ctx.lineWidth = Math.max(1, s * 0.025); ctx.lineCap = 'round'
  // A compact pulse at the feet connects the upright burst to its world cell.
  ctx.globalAlpha = fade * 0.55
  ctx.beginPath(); ctx.ellipse(0, s * 0.36, s * (0.14 + expand * 0.27), s * Math.sin(p.tilt) * 0.13, 0, 0, Math.PI * 2); ctx.stroke()
  if (kind === 'air' || kind === 'teleport' || kind === 'buff' || kind === 'debuff') {
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = fade * 0.8
      const y = s * (0.28 - i * 0.27 - age * 0.12), r = s * (0.19 + expand * 0.17)
      ctx.beginPath(); ctx.ellipse(0, y, r, s * 0.09, -0.2, age * 5 + i * 1.8, age * 5 + i * 1.8 + Math.PI * 1.4); ctx.stroke()
    }
  }
  if (kind === 'drain') {
    for (let i = 0; i < 4; i++) {
      const a = seed + i * Math.PI / 2 + age * 2.5, r = s * (0.42 - expand * 0.3)
      ctx.globalAlpha = fade * 0.85; ctx.beginPath()
      ctx.moveTo(Math.cos(a - 0.5) * (r + s * 0.08), Math.sin(a - 0.5) * (r + s * 0.08))
      ctx.quadraticCurveTo(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.7) * r * 0.4, Math.sin(a + 0.7) * r * 0.4)
      ctx.stroke()
    }
  }
  for (let i = 0; i < 8; i++) {
    const angle = seed + i * Math.PI / 4
    const radius = s * (0.12 + expand * 0.29)
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * 0.85 - age * s * 0.12
    const size = s * (0.065 - age * 0.025)
    ctx.globalAlpha = fade * (0.65 + (i % 3) * 0.12)
    ctx.beginPath()
    if (kind === 'cold') {
      // Six-point ice crystals radiate out of the contact point.
      for (let j = 0; j < 3; j++) {
        const a = j * Math.PI / 3
        ctx.moveTo(x - Math.cos(a) * size, y - Math.sin(a) * size)
        ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size)
      }
    } else if (kind === 'electric') {
      ctx.moveTo(x * 0.3, y * 0.3); ctx.lineTo(x * 0.65 - size, y * 0.55)
      ctx.lineTo(x * 0.5 + size, y * 0.65); ctx.lineTo(x, y)
    } else if (kind === 'heal' || kind === 'holy') {
      ctx.moveTo(x - size, y); ctx.lineTo(x + size, y)
      ctx.moveTo(x, y - size); ctx.lineTo(x, y + size)
    } else if (kind === 'fire') {
      ctx.moveTo(x - size * 0.6, y + size); ctx.quadraticCurveTo(x + size, y, x, y - size * (2 + age))
      ctx.quadraticCurveTo(x - size, y, x - size * 0.6, y + size); ctx.fill()
    } else if (kind === 'earth') {
      ctx.fillRect(x, y + age * age * s * 0.25, size, size * 0.65)
    } else if (kind === 'poison' || kind === 'acid') {
      ctx.arc(x, y, size * (0.5 + age), 0, Math.PI * 2)
    } else {
      ctx.moveTo(x - size * 0.6, y); ctx.lineTo(x, y - size); ctx.lineTo(x + size * 0.6, y); ctx.lineTo(x, y + size); ctx.closePath()
    }
    ctx.stroke()
  }
  ctx.restore()
}

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
  const [r, g, b] = trace.appearance?.colour ?? trace.source.colour
  const kind = trace.appearance?.kind
  const physical = kind === 'sand' || kind === 'stone' || kind === 'metal'
  const air = kind === 'air'
  const fire = kind === 'fire' || trace.source.pulse === 'fire', electric = kind === 'electric' || trace.source.pulse === 'electric'
  const cold = kind === 'cold' || !kind && !electric && b > r * 1.25 && g > r
  const fade = (1 - age) ** 1.5
  // A small arrival puff/spark burst is driven by the observed overlay ending,
  // including misses and resisted hits. It makes no claim about damage.
  const impact = (now - trace.born) / (physical ? 0.4 : 0.32)
  if (impact >= 0 && impact < 1) {
    ctx.save(); ctx.fillStyle = `rgb(${r},${g},${b})`
    for (let i = 0; i < (physical ? 7 : 4); i++) {
      const angle = seed + i * 2.4, radius = s * (0.045 + impact * 0.26)
      const size = Math.max(0.9, s / (physical ? 28 : 55)) * (1 - impact * 0.35)
      ctx.globalAlpha = (1 - impact) * (physical ? 0.8 : 0.45)
      ctx.fillRect(q.x + Math.cos(angle) * radius, q.y + Math.sin(angle) * radius * Math.sin(p.tilt) - Math.sin(impact * Math.PI) * s * 0.18, size, size)
    }
    ctx.restore()
  }
  ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, Math.sin(p.tilt))
  ctx.globalAlpha = fade * (physical ? 0.38 : 0.22)
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.fillStyle = fire ? '#653523' : `rgb(${r},${g},${b})`
  ctx.lineWidth = Math.max(0.7, s / 65)
  for (let i = 0; i < 3; i++) {
    const x = Math.sin(seed + i * 4.1) * s * 0.21, y = Math.cos(seed + i * 3.7) * s * 0.19
    ctx.beginPath()
    if (physical) {
      const size = s * (kind === 'sand' ? 0.025 : 0.04)
      ctx.fillRect(x, y, Math.max(0.8, size), Math.max(0.7, size * 0.6))
    } else if (electric) {
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
  for (let i = 0; i < (physical ? 5 : 3); i++) {
    const life = (age * 1.4 + i / 3) % 1
    ctx.globalAlpha = Math.sin(life * Math.PI) * fade * (physical ? 0.45 : 0.38)
    const size = Math.max(0.7, s / 70)
    const drift = physical || air ? life * s * 0.16 : 0
    ctx.fillRect(q.x + Math.sin(seed + i * 3.4 + life) * s * 0.22 + drift, q.y - life * s * (physical ? 0.15 : 0.33), size, size)
  }
  ctx.restore()
}
