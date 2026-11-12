import { cellKey, impactStrength, lightReaches, type DeathKind, type Scene } from '@orbrun/scene'
import { debrisPalettes, debrisRandom, type DeathParticle } from './death.js'
import type { SpellBurst } from './effects.js'

export const HIT_SPRAY_DURATION = 0.65

export interface HitSpray {
  source: 'melee' | 'ranged'
  kind: DeathKind
  height: number
  direction: { x: number; y: number }
  seed: number
  /** The spray leaves the body at contact, then moves independently of it. */
  origin?: { x: number; y: number }
}

/** Readable directional splatters using the same material art as deaths. */
export function sampleHitSpray(scene: Scene, burst: SpellBurst, now: number, position = { x: burst.x, y: burst.y }): DeathParticle[] {
  const spray = burst.spray, t = now - burst.born
  if (!spray || t < 0 || t >= burst.duration) return []
  const origin = spray.origin ??= { ...position }
  const random = debrisRandom(spray.seed), strength = impactStrength(burst.intensity)
  const count = Math.round((9 + random() * 7) * (0.7 + strength * 0.5))
  const energy = 0.95 + random() * 0.65, spread = 0.55 + random() * 0.85
  const heading = Math.atan2(spray.direction.y, spray.direction.x) + (random() - 0.5) * 0.2
  const z0 = spray.height * (0.35 + random() * 0.25), scatter = 0.015 + random() * 0.035
  const airy = spray.kind === 'spirit' || spray.kind === 'fire'
  const liquid = ['flesh', 'insect', 'slime', 'water'].includes(spray.kind)
  const particles: DeathParticle[] = []
  for (let i = 0; i < count; i++) {
    const a = heading + (random() - 0.5) * spread
    const speed = (1.5 + random() * 1.3) * energy * (0.7 + strength * 0.4)
    const lift = 0.15 + random() * 0.5, size = (0.032 + random() * 0.03) * Math.sqrt(spray.height)
    const lateral = (random() - 0.5) * scatter, vertical = (random() - 0.5) * scatter
    const spin = (random() - 0.5) * 10, lifetime = burst.duration * (0.75 + random() * 0.25)
    const elapsed = Math.floor(t * 60) / 60, drift = (1 - Math.exp(-elapsed * 2.2)) / 2.2
    const vx = Math.cos(a) * speed, vy = Math.sin(a) * speed
    const x = origin.x + Math.round((spray.direction.x * 0.14 + lateral + vx * drift) * 64) / 64
    const y = origin.y + Math.round((spray.direction.y * 0.14 + vertical + vy * drift) * 64) / 64
    const z = airy ? z0 + elapsed * 0.2 : z0 + lift * elapsed - 5 * elapsed * elapsed
    const ground = z <= 0.018 && liquid
    const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
    if (!cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, origin, cell)) continue
    const alpha = Math.max(0, Math.min(1, (lifetime - t) / 0.16))
    if (!alpha) continue
    const particle: DeathParticle = { x, y, z: Math.max(0.012, Math.round(z * 64) / 64), size: size * (ground ? 1.7 : 1),
      angle: Math.round((a + spin * elapsed) / (Math.PI / 2)) * Math.PI / 2,
      stretch: ground ? 1.3 : spray.kind === 'plant' ? 1.4 : 1, alpha, minPixels: 8,
      colour: debrisPalettes[spray.kind][i % 3],
      sprite: ground ? 'splat' : airy ? 'wisp' : liquid ? 'drop' : spray.kind === 'bone' || spray.kind === 'ice' ? 'shard' : 'chip', ground }
    particles.push(particle)
    // Stepped trailing stamps make the outward direction readable while the
    // spray is still overlapping the body, for bloodless materials as well.
    if (!ground && i % 3 === 0 && t > 0.025 && t < 0.22) particles.push({ ...particle,
      x: x - Math.round(vx * 0.04 * Math.exp(-elapsed * 2.2) * 64) / 64,
      y: y - Math.round(vy * 0.04 * Math.exp(-elapsed * 2.2) * 64) / 64,
      size: size * 0.65, minPixels: 5, alpha: alpha * 0.65 })
  }
  return particles
}
