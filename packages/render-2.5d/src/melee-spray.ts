import { cellKey, impactStrength, lightReaches, type DeathKind, type Scene } from '@orbrun/scene'
import { debrisPalettes, debrisRandom, type DeathParticle } from './death.js'
import type { SpellBurst } from './effects.js'

export interface MeleeSpray {
  kind: DeathKind
  height: number
  direction: { x: number; y: number }
  seed: number
  /** The spray leaves the body at contact, then moves independently of it. */
  origin?: { x: number; y: number }
}

/** A few material fragments, using death art at a much smaller scale. */
export function sampleMeleeSpray(scene: Scene, burst: SpellBurst, now: number, position = { x: burst.x, y: burst.y }): DeathParticle[] {
  const spray = burst.spray, t = now - burst.born
  if (!spray || t < 0 || t >= burst.duration) return []
  const origin = spray.origin ??= { ...position }
  const random = debrisRandom(spray.seed), strength = impactStrength(burst.intensity)
  const count = Math.round((5 + random() * 5) * (0.7 + strength * 0.5))
  const energy = 0.7 + random() * 0.65, spread = 0.5 + random() * 0.9
  const heading = Math.atan2(spray.direction.y, spray.direction.x) + (random() - 0.5) * 0.3
  const z0 = spray.height * (0.35 + random() * 0.25), scatter = 0.015 + random() * 0.035
  const airy = spray.kind === 'spirit' || spray.kind === 'fire'
  const liquid = ['flesh', 'insect', 'slime', 'water'].includes(spray.kind)
  const particles: DeathParticle[] = []
  for (let i = 0; i < count; i++) {
    const a = heading + (random() - 0.5) * spread
    const speed = (0.65 + random() * 0.85) * energy * (0.7 + strength * 0.4)
    const lift = 0.15 + random() * 0.5, size = (0.014 + random() * 0.018) * Math.sqrt(spray.height)
    const lateral = (random() - 0.5) * scatter, vertical = (random() - 0.5) * scatter
    const spin = (random() - 0.5) * 10, lifetime = burst.duration * (0.75 + random() * 0.25)
    const elapsed = Math.floor(t * 60) / 60, drift = (1 - Math.exp(-elapsed * 2.7)) / 2.7
    const x = origin.x + Math.round((spray.direction.x * 0.07 + lateral + Math.cos(a) * speed * drift) * 64) / 64
    const y = origin.y + Math.round((spray.direction.y * 0.07 + vertical + Math.sin(a) * speed * drift) * 64) / 64
    const z = airy ? z0 + elapsed * 0.2 : z0 + lift * elapsed - 5 * elapsed * elapsed
    const ground = z <= 0.018 && liquid
    const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
    if (!cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, origin, cell)) continue
    const alpha = Math.max(0, Math.min(1, (lifetime - t) / 0.16))
    if (!alpha) continue
    particles.push({ x, y, z: Math.max(0.012, Math.round(z * 64) / 64), size: size * (ground ? 1.7 : 1),
      angle: Math.round((a + spin * elapsed) / (Math.PI / 2)) * Math.PI / 2,
      stretch: ground ? 1.3 : spray.kind === 'plant' ? 1.4 : 1, alpha, minPixels: 4,
      colour: debrisPalettes[spray.kind][i % 3],
      sprite: ground ? 'splat' : airy ? 'wisp' : liquid ? 'drop' : spray.kind === 'bone' || spray.kind === 'ice' ? 'shard' : 'chip', ground })
  }
  return particles
}
