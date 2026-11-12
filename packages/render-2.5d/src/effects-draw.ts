import type { SpellTrace, SpellBurst, ProjectileTrail } from './effects.js'
import { groundDepth, project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'
import { impactStrength } from '@orbrun/scene'
import type { ImpactArt } from './impact-draw.js'
import type { ImpactKind } from './impact-art.js'

/** Small shaded pixels at missile height; material controls shape and drift. */
export function drawProjectileTrail(ctx: Context2d, p: Projection, trail: ProjectileTrail, dpr: number) {
  const { kind, age, seed, colour } = trail
  const q = project(p, trail.x, trail.y, 0.28)
  const pixel = Math.max(1 / dpr, Math.round(p.scale / 32 * dpr) / dpr)
  const side = ((seed % 5) - 2) * pixel
  const dust = kind === 'sand' || kind === 'stone'
  const liquid = kind === 'poison' || kind === 'acid'
  const drift = kind === 'fire' ? -age * p.scale * 0.14
    : dust || liquid ? age * p.scale * 0.1 : 0
  const x = Math.round((q.x + side * age) * dpr) / dpr
  const y = Math.round((q.y + drift) * dpr) / dpr
  const width = kind === 'air' ? 3 : kind === 'electric' ? 2 : dust ? 2 : 1
  ctx.save()
  ctx.globalAlpha = (1 - age) ** 2 * (kind === 'metal' ? 0.28 : dust ? 0.42 : 0.68)
  ctx.fillStyle = `rgb(${colour.map(c => Math.round(c * 0.55)).join(',')})`
  ctx.fillRect(x - pixel, y, pixel * (width + 1), pixel * 2)
  ctx.fillStyle = `rgb(${colour.join(',')})`
  ctx.fillRect(x, y - pixel, pixel * width, pixel)
  if (kind === 'cold' || kind === 'magic') ctx.fillRect(x, y - pixel * 2, pixel, pixel * 3)
  if (kind === 'electric') ctx.fillRect(x + pixel, y - (seed % 2 ? 2 : -1) * pixel, pixel, pixel)
  if (liquid) ctx.fillRect(x, y + pixel, pixel, pixel * 2)
  ctx.restore()
}

/** Shaded tile-scale contact art, shared by missiles and direct spell effects. */
export function drawSpellBurst(ctx: Context2d, p: Projection, burst: SpellBurst, now: number, art: ImpactArt, dpr: number) {
  const age = (now - burst.born) / burst.duration
  const q = project(p, burst.x, burst.y + 0.22)
  const kind = burst.material === 'sand' ? 'sand' : burst.kind
  const strength = burst.intensity ? impactStrength(burst.intensity) : 0.6
  const direction = burst.direction === undefined ? undefined : Math.atan2(Math.sin(burst.direction) * groundDepth(p.tilt), Math.cos(burst.direction))
  art.draw(ctx, kind, age, burst.x * 11 + burst.y * 23 + Math.floor(burst.born * 1000), strength,
    q.x, q.y - p.scale * 0.4, p.scale * (0.85 + strength * 0.25), dpr, 1, false, direction)
}

/** Dithered floor remnants replace the old vector arcs and tiny square motes. */
export function drawSpellTrace(ctx: Context2d, p: Projection, trace: SpellTrace, now: number, art: ImpactArt, dpr: number) {
  const age = (now - trace.born) / trace.duration
  const q = project(p, trace.source.x, trace.source.y)
  const appearance = trace.appearance?.kind
  const kind: ImpactKind = appearance === 'stone' ? 'earth' : appearance === 'metal' ? 'physical'
    : appearance ?? (trace.source.pulse === 'fire' ? 'fire' : trace.source.pulse === 'electric' ? 'electric' : 'magic')
  art.draw(ctx, kind, age, trace.source.x * 11 + trace.source.y * 23, 0.5, q.x, q.y, p.scale, dpr, groundDepth(p.tilt), true)
}
