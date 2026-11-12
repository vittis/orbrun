import type { Scene } from './index.js'
import { cellKey } from './coordinates.js'
import { lightReaches } from './living.js'

export type DeathKind = 'flesh' | 'bone' | 'slime' | 'stone' | 'spirit' | 'fire' | 'ice' | 'plant' | 'insect' | 'water'
export interface DeathEffect {
  actorId: string
  x: number
  y: number
  height: number
  kind: DeathKind
  direction: { x: number; y: number }
}
export interface DeathParticle {
  x: number; y: number; z: number
  size: number; angle: number; stretch: number; alpha: number
  colour: readonly [number, number, number]
  shape: 'chip' | 'mote' | 'ring'
}

const palettes: Record<DeathKind, readonly (readonly [number, number, number])[]> = {
  flesh: [[175, 32, 46], [244, 92, 86], [112, 25, 40]],
  bone: [[231, 220, 177], [168, 157, 125], [255, 244, 211]],
  slime: [[132, 206, 55], [190, 236, 86], [61, 133, 49]],
  stone: [[152, 143, 128], [205, 193, 163], [94, 97, 106]],
  spirit: [[133, 239, 232], [182, 166, 255], [222, 255, 246]],
  fire: [[255, 103, 36], [255, 205, 88], [151, 69, 48]],
  ice: [[139, 213, 246], [221, 251, 255], [77, 143, 197]],
  plant: [[112, 151, 55], [172, 192, 78], [107, 75, 41]],
  insect: [[133, 116, 53], [207, 171, 76], [75, 65, 44]],
  water: [[89, 164, 227], [175, 233, 255], [66, 119, 171]],
}
const durations: Record<DeathKind, number> = { flesh: 2.1, bone: 2.6, slime: 2.8, stone: 2.4, spirit: 1.5, fire: 1.6, ice: 1.9, plant: 2.3, insect: 2.2, water: 1.6 }
interface Burst extends DeathEffect { born: number; seed: number }

/** Bounded, deterministic presentation history shared by both dungeon views. */
export class DeathEffects {
  private bursts: Burst[] = []
  private level: string | undefined
  private onLevel = false
  get active() { return this.bursts.length > 0 }

  observe(scene: Scene, animate: boolean) {
    if (!animate || !scene.playerOnLevel || !this.onLevel || scene.levelKey !== this.level) this.clear()
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
  }

  spawn(scene: Scene, effect: DeathEffect, now: number) {
    const cell = scene.cells.get(cellKey(effect.x, effect.y))
    if (!scene.playerOnLevel || cell?.visibility !== 'visible' || cell.occluder || this.bursts.some(b => b.actorId === effect.actorId)) return false
    let seed = 0
    for (const c of effect.actorId) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0
    this.bursts.push({ ...effect, direction: { ...effect.direction }, born: now, seed })
    this.bursts = this.bursts.slice(-24)
    return true
  }

  sample(scene: Scene, now: number): DeathParticle[] {
    this.bursts = this.bursts.filter(b => now - b.born < durations[b.kind] && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible')
    const particles: DeathParticle[] = []
    for (const b of this.bursts) {
      const t = now - b.born, duration = durations[b.kind]
      if (t < 0) continue
      const palette = palettes[b.kind], airy = b.kind === 'spirit' || b.kind === 'fire'
      if (t < 0.28) particles.push({ x: b.x, y: b.y, z: 0.025, size: 0.08 + 0.56 * (1 - (1 - t / 0.28) ** 3), angle: 0, stretch: 1, alpha: (1 - t / 0.28) * 0.55, colour: palette[1], shape: 'ring' })
      if (t < 0.11) particles.push({ x: b.x, y: b.y, z: b.height * 0.35, size: 0.12 + t * 1.7, angle: 0, stretch: 0.8, alpha: (1 - t / 0.11) * 0.9, colour: palette[1], shape: 'mote' })
      let seed = b.seed
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
      const count = Math.round(18 + b.height * 8)
      for (let i = 0; i < count; i++) {
        const leafy = b.kind === 'plant', liquid = b.kind === 'slime' || b.kind === 'water'
        const weight = b.kind === 'stone' ? 1.35 : leafy ? 0.55 : 1
        const angle = random() * Math.PI * 2, speed = (0.4 + random() * 1.5) * (leafy ? 0.75 : liquid ? 1.12 : 1)
        const lift = (0.5 + random() * 1.3) / weight, z0 = b.height * (0.2 + random() * 0.35)
        const size = (0.018 + random() * 0.037) * Math.sqrt(b.height) * (liquid ? 1.3 : 1)
        const spin = (random() - 0.5) * 13, fade = 0.65 + random() * 0.35
        const drift = (1 - Math.exp(-t * 3.8)) / 3.8
        const swirl = airy ? t * 1.8 : 0
        const x = b.x + (Math.cos(angle + swirl) * speed + b.direction.x * 0.65) * drift
        const y = b.y + (Math.sin(angle + swirl) * speed + b.direction.y * 0.65) * drift
        const gravity = 3 * weight
        const hit = (lift + Math.sqrt(lift * lift + 4 * gravity * z0)) / (2 * gravity)
        const grounded = t >= hit
        const z = airy ? z0 + t * (b.kind === 'spirit' ? 0.38 : 0.23) + Math.sin(angle + t * 4) * 0.04
          : grounded ? 0.018 + (liquid ? 0 : Math.max(0, Math.sin((t - hit) * 15)) * 0.06 * Math.exp(-(t - hit) * 8))
          : z0 + lift * t - gravity * t * t
        const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
        if (!cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, b, cell)) continue
        const alpha = Math.max(0, Math.min(1, (duration * fade - t) / 0.65))
        if (!alpha) continue
        particles.push({ x, y, z, size: size * (airy ? Math.max(0.2, 1 - t / duration) : 1), angle: angle + spin * Math.min(t, hit),
          stretch: b.kind === 'bone' ? 2.8 : b.kind === 'ice' ? 2 : b.kind === 'slime' && grounded ? 2.2 : leafy ? 1.8 : b.kind === 'insect' ? 1.5 : airy ? 1.6 : 1,
          alpha: alpha * (airy ? 0.8 : 1), colour: palette[i % palette.length], shape: airy || b.kind === 'slime' || b.kind === 'water' ? 'mote' : 'chip' })
      }
    }
    return particles
  }

  clear() { this.bursts = []; this.level = undefined; this.onLevel = false }
}
