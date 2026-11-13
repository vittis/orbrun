import type { SpellTrace, SpellBurst } from './effects.js'
import { groundDepth, project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'
import { impactStrength } from '@orbrun/scene'
import type { ImpactArt } from './impact-draw.js'
import type { ImpactKind } from './impact-art.js'
import { deflectionPose } from './deflection-pose.js'
/** Shaded tile-scale contact art, shared by missiles and direct spell effects. */
export function drawSpellBurst(ctx: Context2d, p: Projection, burst: SpellBurst, now: number, art: ImpactArt, dpr: number, position = burst) {
  const age = (now - burst.born) / burst.duration
  if (age < 0 || age >= 1) return
  const q = project(p, position.x, position.y + (burst.actorId ? 0.3 : 0.22))
  if (burst.outcome) {
    const pose = deflectionPose(age, burst.popupSlot)
    // Hold the readable pixel silhouette while the popup itself tweens/fades.
    art.draw(ctx, burst.outcome, Math.min(age, 0.4), Math.floor(burst.born * 1000), 0.25,
      q.x + p.scale * pose.x, q.y - p.scale * ((burst.actorHeight ?? 1) + pose.lift),
      p.scale * pose.scale, dpr, pose.squash, false, undefined, pose.opacity)
    return
  }
  const kind = burst.material === 'sand' && burst.kind === 'earth' ? 'sand' : burst.kind
  const strength = burst.intensity ? impactStrength(burst.intensity) : 0.6
  art.draw(ctx, kind, age, burst.x * 11 + burst.y * 23 + Math.floor(burst.born * 1000), strength,
    q.x, q.y - p.scale * (burst.actorId ? 0.5 : 0.4), p.scale * (0.85 + strength * 0.25), dpr, 1, false)
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
