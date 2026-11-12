import { cellKey, lightReaches, type DeathEffect, type DeathKind, type Scene } from '@orbrun/scene'
import type { DeathSprite } from './death-art.js'

export interface DeathParticle {
  x: number; y: number; z: number
  size: number; angle: number; stretch: number; alpha: number
  colour: readonly [number, number, number]
  sprite: DeathSprite
  /** Floor stains are drawn underneath creatures and raised terrain. */
  ground: boolean
  /** Preserve enough stamp texels for sparse hit debris to remain legible. */
  minPixels?: number
}

export const debrisPalettes: Record<DeathKind, readonly (readonly [number, number, number])[]> = {
  flesh: [[159, 25, 39], [198, 51, 57], [114, 18, 32]],
  bone: [[231, 220, 177], [168, 157, 125], [255, 244, 211]],
  slime: [[132, 206, 55], [190, 236, 86], [61, 133, 49]],
  stone: [[152, 143, 128], [205, 193, 163], [94, 97, 106]],
  spirit: [[133, 239, 232], [182, 166, 255], [222, 255, 246]],
  fire: [[255, 103, 36], [255, 205, 88], [151, 69, 48]],
  ice: [[139, 213, 246], [221, 251, 255], [77, 143, 197]],
  plant: [[112, 151, 55], [172, 192, 78], [107, 75, 41]],
  insect: [[115, 121, 47], [159, 142, 57], [80, 85, 32]],
  water: [[89, 164, 227], [175, 233, 255], [66, 119, 171]],
}
const durations: Record<DeathKind, number> = { flesh: 1.25, bone: 1.1, slime: 1.3, stone: 1.1, spirit: 0.65, fire: 0.65, ice: 0.9, plant: 1.1, insect: 1.2, water: 0.85 }
interface Burst extends DeathEffect { born: number; seed: number }

/** Mix similar actor IDs thoroughly so consecutive kills get distinct sprays. */
export function debrisRandom(seed: number) {
  seed = Math.imul(seed ^ seed >>> 16, 0x21f0aaad)
  seed = Math.imul(seed ^ seed >>> 15, 0x735a2d97)
  seed = (seed ^ seed >>> 15) >>> 0
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

/** Bounded, deterministic gore history for the 2.5D dungeon view. */
export class DungeonDeaths {
  private bursts: Burst[] = []
  private level: string | undefined
  private onLevel = false
  get active() { return this.bursts.length > 0 }
  coversImpact(x: number, y: number, now: number) {
    return this.bursts.some(b => b.x === x && b.y === y && now >= b.born && now - b.born < 0.9)
  }

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
      const palette = debrisPalettes[b.kind], airy = b.kind === 'spirit' || b.kind === 'fire'
      const gory = b.kind === 'flesh' || b.kind === 'insect'
      const liquid = b.kind === 'slime' || b.kind === 'water'
      const leafy = b.kind === 'plant'
      // Sample the same profile every frame: variation belongs to the death,
      // not the render clock. Keep material-specific art and motion intact.
      const random = debrisRandom(b.seed)
      const density = (0.75 + random() * 0.55) * 0.55, energy = (0.75 + random() * 0.6) * 0.45
      const liftScale = (0.85 + random() * 0.25) * 0.8, sizeScale = (0.85 + random() * 0.3) * 0.82
      const distribution = Math.floor(random() * 3) // Radial, forward fan, or opposing fans.
      const heading = (b.direction.x || b.direction.y ? Math.atan2(b.direction.y, b.direction.x) : random() * Math.PI * 2)
        + (random() - 0.5) * 1.4
      const spread = 0.7 + random() * 1.8, width = 0.55 + random() * 0.6
      const push = (0.65 + random() * 0.7) * 0.45, originSpread = (0.03 + random() * 0.1) * 0.5
      const poolCount = 2 + Math.floor(random() * 3), poolScale = (0.8 + random() * 0.4) * 0.55
      // A ragged, coloured impact silhouette replaces the smooth shock ring.
      if (t < 0.1) particles.push({ x: b.x, y: b.y, z: b.height * 0.4, size: (0.23 + Math.floor(t * 40) * 0.04) * sizeScale,
        angle: Math.round(heading / (Math.PI / 2)) * Math.PI / 2, stretch: width,
        alpha: 1 - t / 0.1, colour: palette[1], sprite: 'burst', ground: false })
      const chunks = Math.round((gory ? 9 : b.kind === 'bone' ? 10 : 7) * density)
      const count = chunks + Math.round(((gory ? 38 : 24) + b.height * 8) * density)
      for (let i = 0; i < count; i++) {
        const large = i < chunks
        const angle = heading + (distribution === 0 ? random() * Math.PI * 2
          : (random() - 0.5) * spread + (distribution === 2 && i % 2 ? Math.PI : 0))
        const speed = (large ? 1.2 + random() * 1.6 : 1.6 + random() * 2.5) * energy * (leafy || airy ? 0.65 : 1)
        const weight = b.kind === 'stone' ? 1.35 : leafy ? 0.7 : 1
        const lift = (0.65 + random() * 1.65) * liftScale / weight, z0 = b.height * (0.18 + random() * 0.38)
        const size = (large ? 0.065 + random() * 0.048 : 0.018 + random() * 0.027) * Math.sqrt(b.height) * sizeScale
        const spin = (random() - 0.5) * 14, fade = 0.8 + random() * 0.2
        const originAngle = random() * Math.PI * 2, originRadius = Math.sqrt(random()) * originSpread
        // Quicker settling with strong drag: speed up the action without
        // throwing debris farther from the victim's cell.
        const elapsed = Math.floor(t * 1.35 * 60) / 60
        const drag = large ? 4.8 : 5.8, drift = (1 - Math.exp(-elapsed * drag)) / drag
        const swirl = airy ? elapsed * 1.6 : 0
        const along = Math.cos(angle + swirl - heading) * speed, across = Math.sin(angle + swirl - heading) * speed * width
        const vx = Math.cos(heading) * along - Math.sin(heading) * across + b.direction.x * (gory ? 1.3 : 0.8) * push
        const vy = Math.sin(heading) * along + Math.cos(heading) * across + b.direction.y * (gory ? 1.3 : 0.8) * push
        const x = b.x + Math.round((Math.cos(originAngle) * originRadius + vx * drift) * 64) / 64
        const y = b.y + Math.round((Math.sin(originAngle) * originRadius + vy * drift) * 64) / 64
        const gravity = 4 * weight
        const hit = (lift + Math.sqrt(lift * lift + 4 * gravity * z0)) / (2 * gravity)
        const grounded = !airy && elapsed >= hit
        const stain = grounded && (liquid || gory && !large)
        const z = airy ? z0 + elapsed * (b.kind === 'spirit' ? 0.42 : 0.3) + Math.sin(angle + elapsed * 4) * 0.04
          : grounded ? 0.018 + (stain ? 0 : Math.max(0, Math.sin((elapsed - hit) * 15)) * 0.07 * Math.exp(-(elapsed - hit) * 8))
          : z0 + lift * elapsed - gravity * elapsed * elapsed
        const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
        if (!cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, b, cell)) continue
        const lifetime = airy ? duration * fade : large || stain ? duration * fade : Math.min(duration * fade, 0.65)
        const alpha = Math.max(0, Math.min(1, (lifetime - t) / (airy ? 0.18 : 0.25)))
        if (!alpha) continue
        const colour = palette[i % palette.length]
        const sprite: DeathSprite = stain ? 'splat' : airy ? 'wisp' : gory && !large || liquid ? 'drop'
          : b.kind === 'bone' || b.kind === 'ice' ? 'shard' : b.kind === 'flesh' ? 'gib' : 'chip'
        const particle: DeathParticle = { x, y, z: Math.max(0.012, Math.round(z * 64) / 64),
          size: size * (stain ? 2.5 : airy ? Math.max(0.25, 1 - t / duration) : 1),
          angle: Math.round((angle + spin * Math.min(elapsed, hit)) / (Math.PI / 2)) * Math.PI / 2,
          stretch: stain ? 1.4 : b.kind === 'bone' && large ? 1.4 : leafy ? 1.5 : 1,
          alpha, colour, sprite, ground: stain }
        particles.push(particle)
        // Short, stepped blood trails make the initial spray read at tile scale.
        if (gory && !large && i % 7 === 0 && t > 0.035 && t < 0.18) particles.push({ ...particle,
          x: x - Math.round(vx * 0.045 * Math.exp(-elapsed * drag) * 64) / 64,
          y: y - Math.round(vy * 0.045 * Math.exp(-elapsed * drag) * 64) / 64,
          size: size * 0.75, alpha: alpha * 0.7 })
      }
      // Pools are irregular stamps, with separate flecks; no circular decals.
      if ((gory || liquid) && t > 0.04) for (let i = 0; i < poolCount; i++) {
        const a = random() * Math.PI * 2, reach = (i === 0 ? 0 : 0.15 + random() * 0.48) * poolScale
        const size = (i === 0 ? 0.3 + Math.min(3, Math.floor(t * 12)) * 0.035 : 0.09 + random() * 0.13) * poolScale
        const angle = Math.floor(random() * 4) * Math.PI / 2
        const x = b.x + Math.cos(a) * reach + b.direction.x * reach * 0.3
        const y = b.y + Math.sin(a) * reach + b.direction.y * reach * 0.3
        const cell = scene.cells.get(cellKey(Math.round(x), Math.round(y)))
        if (!cell || cell.visibility !== 'visible' || cell.occluder || !lightReaches(scene, b, cell)) continue
        const colour = palette[i % palette.length].map(c => Math.round(c * (liquid ? 0.75 : 0.62))) as [number, number, number]
        particles.push({ x, y, z: 0.012, size,
          angle, stretch: i === 0 ? 1.25 : 1,
          alpha: Math.max(0, Math.min(1, (duration - t) / 0.25)), colour, sprite: 'splat', ground: true })
      }
    }
    return particles
  }

  clear() { this.bursts = []; this.level = undefined; this.onLevel = false }
}
