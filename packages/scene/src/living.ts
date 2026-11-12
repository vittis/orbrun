import type { Billboard, CellKey, Scene, SceneCell } from './index.js'
import { cellKey } from './coordinates.js'

export type LifeMotion = 'breath' | 'plant' | 'undead' | 'float' | 'ooze' | 'swirl' | 'serpent' | 'skitter' | 'cloud' | 'flame' | 'water' | 'lava' | 'crystal' | 'portal' | 'altar' | 'fountain' | 'bog' | 'grass' | 'up' | 'down' | 'gold' | 'gem' | 'potion' | 'paper' | 'still'
export interface TileLight { colour: [number, number, number]; radius: number; power: number; pulse?: 'fire' | 'slow' | 'electric'; transient?: boolean }
export interface ProjectileAppearance {
  kind: 'sand' | 'stone' | 'metal' | 'air' | 'fire' | 'cold' | 'electric' | 'poison' | 'acid' | 'magic'
  colour: [number, number, number]
  /** Only continuous beam art may be alpha-thinned; compact missiles retain their texels. */
  beam: boolean
  /** Direction the artwork points on the ground plane (radians, east = 0). */
  angle?: number
  /** Stable tile family, excluding directional/animation variants. */
  family?: string
  /** Some spell variants encode (distance from source - 1) modulo this cycle. */
  distancePhase?: number
  distanceCycle?: number
}
export interface TileLife { motion?: LifeMotion; rate?: number; amplitude?: number; flying?: boolean; held?: boolean; weary?: boolean; fleeing?: boolean; wading?: boolean; lights?: TileLight[]; projectile?: ProjectileAppearance | false }
export interface LivingPose { x: number; y: number; sx: number; sy: number; angle: number; glow: number }

/** World-anchored, subpixel motion. Memory and immobilised creatures stay still.
 * Overhead views can strengthen motion and replace jitter with slower, fluid poses. */
export function livingPose(life: TileLife | undefined, x: number, y: number, time: number, moving = true, presentation: { strength?: number; smooth?: boolean } = {}): LivingPose {
  const p = { x: 0, y: 0, sx: 1, sy: 1, angle: 0, glow: 0 }
  if (!moving || !life || life.held || life.motion === 'still') return p
  const phase = x * 2.31 + y * 1.73, t = time * (life.rate ?? 1), a = life.amplitude ?? 1
  const wave = Math.sin(t * 2.2 + phase)
  switch (life.motion) {
    case 'breath': {
      const breath = Math.sin(t * (presentation.smooth ? 2.1 : 2.7) + phase)
      if (presentation.smooth) {
        // A readable rise keeps faces and equipment from visibly widening.
        p.sy += breath * 0.009 * a
      } else { p.sy += breath * 0.018 * a; p.sx += breath * 0.006 * a }
      break
    }
    case 'plant': case 'grass': p.angle = Math.sin(t * 0.9 + phase) * 0.018 * a; break
    case 'undead': p.x = Math.sin(t * 0.7 + phase) ** (presentation.smooth ? 3 : 15) * 0.009 * a; break
    case 'float': p.y = Math.sin(t * 1.3 + phase) * 0.023 * a; break
    case 'ooze': p.sy += wave * 0.025 * a; p.sx -= wave * 0.025 * a; break
    case 'swirl': case 'portal': p.angle = Math.sin(t + phase) * 0.025 * a; p.glow = 0.5 + wave * 0.5; break
    case 'serpent': p.x = wave * 0.012 * a; p.angle = Math.sin(t * 1.4 + phase) * 0.012 * a; break
    case 'skitter': p.x = presentation.smooth
      ? Math.sin(t * 3.2 + phase) * (0.65 + Math.sin(t * 0.7 + phase) * 0.35) * 0.009 * a
      : Math.sin(t * 19 + phase) * Math.max(0, Math.sin(t * 0.7 + phase) - 0.8) * 0.04 * a; break
    case 'cloud': p.x = Math.sin(t * 0.6 + phase) * 0.04; p.y = Math.cos(t * 0.45 + phase) * 0.018; p.sx += Math.sin(t * 0.7 + phase) * 0.035; p.sy += wave * 0.025; p.angle = Math.sin(t * 0.4 + phase) * 0.025; break
    case 'flame': p.sy += (wave + Math.sin(t * 7.1 + phase) * 0.4) * 0.023; p.x = Math.sin(t * 4 + phase) * 0.006; break
    case 'water': case 'fountain': p.glow = Math.sin(t * 1.5 + phase) * 0.5 + 0.5; break
    case 'lava': p.glow = Math.sin(t * 0.7 + phase) * 0.5 + 0.5; break
    case 'crystal': case 'gold': case 'gem': p.glow = Math.max(0, Math.sin(t * (life.motion === 'gem' ? 0.45 : 0.8) + phase)) ** 24; break
    case 'altar': case 'up': case 'down': p.glow = wave * 0.5 + 0.5; break
    case 'potion': p.angle = Math.sin(t * 1.3 + phase) * 0.012; break
    case 'paper': p.angle = Math.sin(t * 1.1 + phase) * 0.015; p.sy += wave * 0.007; break
    case 'bog': p.glow = Math.max(0, wave) ** 6; break
  }
  if (life.weary) p.x += Math.sin(t * 0.8 + phase) * 0.006
  if (life.fleeing) p.x += Math.sin(t * (presentation.smooth ? 4 : 23) + phase) * 0.002
  if (life.wading && !life.flying) p.y += Math.sin(t * 1.1 + phase) * 0.008
  if (life.flying) p.y += Math.sin(t * 1.7 + phase) * 0.016
  const strength = presentation.strength ?? 1
  p.x *= strength; p.y *= strength; p.angle *= strength
  p.sx = 1 + (p.sx - 1) * strength; p.sy = 1 + (p.sy - 1) * strength
  return p
}

export interface Light { colour: [number, number, number]; strength: number }
export interface Emitter extends TileLight { x: number; y: number }
export interface LightPool { source: Emitter; cells: SceneCell[] }

export function lightReaches(scene: Scene, from: { x: number; y: number }, to: SceneCell) {
  const dx = to.x - from.x, dy = to.y - from.y
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2)
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + dx * i / steps), y = Math.round(from.y + dy * i / steps)
    if (x === from.x && y === from.y || x === to.x && y === to.y) continue
    const c = scene.cells.get(cellKey(x, y))
    if (!c || c.visibility !== 'visible' || c.occluder) return false
  }
  return true
}

export function emittersFor(scene: Scene): Emitter[] {
  const sources: Emitter[] = []
  const add = (x: number, y: number, lights?: TileLight[]) => {
    if (scene.cells.get(cellKey(x, y))?.visibility !== 'visible') return
    for (const light of lights ?? []) sources.push({ ...light, x, y })
  }
  for (const c of scene.cells.values()) {
    if (c.life?.lights?.length) add(c.x, c.y, c.life.lights)
    else if (c.flags?.lava) add(c.x, c.y, [{ colour: [255, 92, 24], radius: 3, power: 0.4, pulse: 'slow' }])
    else if (c.feature?.type === 'portal' || c.feature?.type === 'transporter') add(c.x, c.y, [{ colour: [145, 110, 255], radius: 3, power: 0.35, pulse: 'slow' }])
    else if (c.feature?.type === 'altar') add(c.x, c.y, [{ colour: [255, 226, 170], radius: 2.5, power: 0.25, pulse: 'slow' }])
  }
  for (const b of scene.billboards) add(b.x, b.y, b.life?.lights)
  return [...new Map(sources.map(s => [`${s.x},${s.y}:${s.colour}:${s.radius}`, s])).values()]
}

export function lightPulse(source: Emitter, time: number) {
  const phase = source.x * 2.31 + source.y * 1.73
  if (source.pulse === 'fire') return 0.87 + Math.sin(time * 8.3 + phase) * 0.08 + Math.sin(time * 17.1 + phase) * 0.05
  if (source.pulse === 'electric') return 0.8 + Math.max(0, Math.sin(time * 23 + phase)) * 0.2
  if (source.pulse === 'slow') return 0.9 + Math.sin(time * 1.7 + phase) * 0.1
  return 1
}

/** Work is bounded by emitter radii, not the area of the explored level. */
export function lightingFor(scene: Scene, sources = emittersFor(scene)): { field: Map<CellKey, Light>; pools: LightPool[] } {
  const pools: LightPool[] = [], sums = new Map<CellKey, number[]>()
  for (const source of sources) {
    if (scene.cells.get(cellKey(source.x, source.y))?.visibility !== 'visible') continue
    const cells: SceneCell[] = [], radius = Math.ceil(source.radius)
    for (let y = source.y - radius; y <= source.y + radius; y++) for (let x = source.x - radius; x <= source.x + radius; x++) {
      const key = cellKey(x, y), cell = scene.cells.get(key), distance = Math.hypot(x - source.x, y - source.y)
      if (!cell || cell.visibility !== 'visible' || distance >= source.radius || !lightReaches(scene, source, cell)) continue
      if (!cell.occluder) cells.push(cell)
      const weight = source.power * (1 - distance / source.radius) ** 2, sum = sums.get(key) ?? [0, 0, 0, 0]
      for (let i = 0; i < 3; i++) sum[i] += source.colour[i] * weight
      sum[3] += weight
      sums.set(key, sum)
    }
    pools.push({ source, cells })
  }
  const field = new Map<CellKey, Light>()
  for (const [key, [r, g, b, weight]] of sums) if (weight > 0.015) field.set(key, {
    colour: [r, g, b].map(c => Math.min(255, Math.round(c / weight / 16) * 16)) as Light['colour'],
    strength: Math.round(Math.min(0.5, weight) * 32) / 32,
  })
  return { field, pools }
}

/** Soft warm LOS, with a readable floor at the limit of sight. */
export function lanternAt(scene: Scene, cell: SceneCell) {
  if (!scene.playerOnLevel || cell.visibility !== 'visible') return 0
  return 0.035 + 0.1 * Math.max(0, 1 - Math.hypot(cell.x - scene.player.x, cell.y - scene.player.y) / 9)
}

export interface DungeonRipple { x: number; y: number; born: number; strength: number; kind?: 'impact' | 'water' | 'arrival' }
const ranks = ['uninjured', 'lightly_damaged', 'moderately_damaged', 'heavily_damaged', 'severely_damaged', 'almost_dead']
const actorId = (b: Billboard) => (b.ref as { id?: number } | undefined)?.id ?? `${b.x},${b.y}:${b.name}`

/** Owns only visual history. No protocol, timers, or independent hit popups. */
export class DungeonLife {
  ripples: DungeonRipple[] = []
  private previous: Scene | null = null
  private revision = -1
  private lastPlayer = { x: 0, y: 0 }
  private lastLevel: string | undefined
  private onLevel = false
  private actors = new Map<number | string, number>()
  private trails = new Map<string, { source: Emitter; born: number }>()
  private sources: Emitter[] = []
  private current = new Set<string>()
  get active() { return this.ripples.length > 0 || [...this.trails.keys()].some(key => !this.current.has(key)) }
  private signature(s: Emitter) { return `${s.x},${s.y}:${s.colour}:${s.radius}` }

  observe(scene: Scene, now: number) {
    if (scene === this.previous && scene.revision === this.revision) return
    const old = this.previous
    if (old && (!scene.playerOnLevel || !this.onLevel || scene.levelKey !== this.lastLevel)) this.clear()
    const next = new Map<number | string, number>()
    for (const b of scene.billboards) {
      if (b.kind !== 'monster' || b.scenery || scene.cells.get(cellKey(b.x, b.y))?.visibility !== 'visible') continue
      const id = actorId(b), rank = ranks.indexOf(b.damage ?? 'uninjured'), was = this.actors.get(id)
      if (was !== undefined && rank > was) this.ripple(b.x, b.y, now, Math.min(1, (rank - was) * 0.25))
      next.set(id, rank)
    }
    if (old && this.previous && scene.playerOnLevel && (this.lastPlayer.x !== scene.player.x || this.lastPlayer.y !== scene.player.y)) {
      const c = scene.cells.get(cellKey(scene.player.x, scene.player.y))
      // Auto-explore/travel can batch many steps into one scene. Distance alone
      // does not confirm an impact or teleport; confirmed spells own that VFX.
      if (c?.visibility === 'visible' && c.flags?.water) this.ripple(c.x, c.y, now, 0.35, 'water')
    }
    this.actors = next
    this.sources = emittersFor(scene)
    const current = new Set(this.sources.map(s => this.signature(s)))
    for (const s of this.sources) if (s.transient) this.trails.set(this.signature(s), { source: s, born: now })
    for (const key of this.current) if (!current.has(key)) { const t = this.trails.get(key); if (t) t.born = now }
    this.current = current
    this.previous = scene
    this.revision = scene.revision
    this.lastPlayer = { ...scene.player }
    this.lastLevel = scene.levelKey
    this.onLevel = scene.playerOnLevel
    while (this.trails.size > 96) this.trails.delete(this.trails.keys().next().value!)
  }
  ripple(x: number, y: number, born: number, strength: number, kind: DungeonRipple['kind'] = 'impact') {
    const existing = this.ripples.find(r => r.x === x && r.y === y && (r.kind ?? 'impact') === kind && Math.abs(born - r.born) < 0.12)
    if (existing) existing.strength = Math.max(existing.strength, strength)
    else this.ripples.push({ x, y, born, strength, kind })
    this.ripples = this.ripples.slice(-12)
  }
  emitters(now: number): Emitter[] {
    const result = [...this.sources]
    for (const [key, trail] of this.trails) {
      if (this.current.has(key)) continue
      const fade = 1 - (now - trail.born) / 0.35
      if (fade <= 0) { this.trails.delete(key); continue }
      result.push({ ...trail.source, power: trail.source.power * fade })
    }
    return result
  }
  tick(now: number) { this.ripples = this.ripples.filter(r => now - r.born < 1.5) }
  clear() { this.previous = null; this.revision = -1; this.actors.clear(); this.trails.clear(); this.sources = []; this.current.clear(); this.ripples = [] }
}
