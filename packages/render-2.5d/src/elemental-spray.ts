import { cellKey, impactStrength, lightReaches, type DamageType, type HitIntensity, type Scene, type SpellEffect } from '@orbrun/scene'
import type { DeathParticle } from './death.js'
import type { DeathSprite } from './death-art.js'

export const elementalPalettes: Record<Exclude<DamageType, 'physical'>, readonly (readonly [number, number, number])[]> = {
  fire: [[255, 103, 36], [255, 205, 88], [255, 150, 48]],
  cold: [[139, 213, 246], [221, 251, 255], [77, 143, 197]],
  poison: [[132, 206, 55], [190, 236, 86], [61, 133, 49]],
  acid: [[206, 235, 61], [243, 255, 142], [130, 179, 36]],
  electric: [[95, 180, 255], [190, 230, 255], [142, 166, 255]],
  magic: [[186, 123, 255], [236, 202, 255], [125, 110, 239]],
}

/** Only damage colours; utility/status cues must never shed elemental debris. */
export function sprayElement(kind: SpellEffect['kind']): Exclude<DamageType, 'physical'> | undefined {
  if (kind === 'drain' || kind === 'holy') return 'magic'
  if (kind in elementalPalettes) return kind as Exclude<DamageType, 'physical'>
}

/** Mix sequential spawn IDs; render cadence never participates in randomness. */
export function debrisRandom(seed: number) {
  seed = Math.imul(seed ^ seed >>> 16, 0x21f0aaad)
  seed = Math.imul(seed ^ seed >>> 15, 0x735a2d97)
  seed = (seed ^ seed >>> 15) >>> 0
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

/** Whole-burst variation around the authored profile; particle texture stays random. */
export function profileRandom(random: () => number, variation: number) {
  const amount = Number.isFinite(variation) ? Math.max(0, Math.min(1, variation)) : 0.25
  return () => Math.max(0, Math.min(1, 0.5 + (random() - 0.5) * amount * 2))
}

/** Distinct elemental silhouettes mixed with body debris, under the same bounds. */
export function sampleElementalSpray(scene: Scene, origin: { x: number; y: number }, direction: { x: number; y: number },
  height: number, kind: SpellEffect['kind'], intensity: HitIntensity | undefined, seed: number,
  age: number, death: boolean, gore: number, outward: number, variation: number): DeathParticle[] {
  const element = sprayElement(kind), duration = death ? element === 'electric' ? 0.55 : 0.8 : 0.3
  if (!element || gore <= 0 || age < 0 || age >= duration) return []
  const random = debrisRandom(seed ^ 0x7f4a7c15), profile = profileRandom(random, variation)
  const strength = 0.8 + impactStrength(intensity) * 0.4
  const count = Math.min(death ? 40 : 28, Math.round((death ? 24 : 13) * gore * strength * (0.8 + profile() * 0.4)))
  const energy = (0.8 + profile() * 0.4) * strength, size = 0.8 + profile() * 0.4
  const heading = Math.atan2(direction.y, direction.x), radial = Math.round(count * outward), phase = random() * Math.PI * 2
  const electric = element === 'electric', fire = element === 'fire', cold = element === 'cold', magic = element === 'magic'
  const particles: DeathParticle[] = []
  for (let i = 0; i < count; i++) {
    const major = i % 4 === 0, vapour = element === 'poison' && i % 3 === 0
    const liquid = element === 'acid' || element === 'poison' && !vapour
    const angle = heading + (i < radial ? phase + (i + random() * 0.4) * Math.PI * 2 / radial : (random() - 0.5) * 1.4)
    const speed = (1.2 + random() * 2) * energy * (element === 'acid' ? 1.35 : electric ? 1.7 : 1)
    const drag = electric ? 8 : 3, drift = (1 - Math.exp(-age * drag)) / drag
    const curl = magic ? Math.sin(age * 9 + i) * 0.22 : 0
    const x = origin.x + Math.round(Math.cos(angle + curl) * speed * drift * 64) / 64
    const y = origin.y + Math.round(Math.sin(angle + curl) * speed * drift * 64) / 64
    const z0 = height * (0.3 + random() * 0.3), lift = 0.3 + random() * 0.6
    const z = liquid || cold ? z0 + age * lift - age * age * 4
      : z0 + age * (electric ? 0.15 : fire || vapour ? lift + 0.3 : lift)
    const ground = liquid && z <= 0.018
    const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
    const lifetime = duration * (0.75 + random() * 0.25)
    const fade = Math.max(0, Math.min(1, (lifetime - age) / (death ? 0.22 : 0.07)))
    // Small, local discharges reroute on an age clock, never on render cadence.
    const discharge = Math.floor(age * 18 + i * 0.7)
    const alpha = fade * (electric && discharge % 3 === 0 ? 0.65 : 1)
    const particleSize = (0.04 + random() * 0.025) * size * Math.sqrt(height) * (major ? 1.4 : 1) * (ground ? 1.8 : 1)
    const sprite: DeathSprite = ground ? 'splat' : electric ? discharge % 2 ? 'lightning' : 'lightningFork'
      : fire ? 'cinder' : cold ? major ? 'frost' : 'shard'
      : magic ? major || i % 2 ? 'glint' : 'wisp' : vapour ? 'wisp' : element === 'poison' ? 'bubble' : 'spit'
    const minPixels = electric ? major ? 14 : 10 : major ? 11 : 8
    if (!alpha || !cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, origin, cell)) continue
    particles.push({ x, y, z: Math.max(0.012, Math.round(z * 64) / 64), size: particleSize,
      angle: Math.round((angle + (electric ? discharge % 2 * Math.PI / 2 : 0)) / (Math.PI / 2)) * Math.PI / 2,
      stretch: element === 'acid' ? ground ? 1.6 : 1.9 : cold ? 1.5 : fire ? 0.85 : 1,
      alpha, colour: elementalPalettes[element][i % 3], sprite, ground, minPixels })
  }
  return particles
}
