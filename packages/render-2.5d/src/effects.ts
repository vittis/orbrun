import { cellKey, combatActorId, emittersFor, meleePose, meleeTiming, impactStrength, type Billboard, type Emitter, type MeleeAttack, type Scene, type ProjectileAppearance, type SpellEffect } from '@orbrun/scene'

export interface MeleeStroke extends MeleeAttack { born: number; duration: number }
export interface SpellTrace { source: Emitter; born: number; duration: number; appearance?: ProjectileAppearance }
export interface SpellBurst extends SpellEffect { born: number; duration: number; impact?: boolean }
interface SpellSample { source: Emitter; appearance?: ProjectileAppearance }
interface ProjectilePoint { billboard: Billboard; at: number }
interface ProjectileFlight { points: ProjectilePoint[]; seen: number; ended?: number }
const shotKey = (b: Billboard) => `${b.x},${b.y}:${b.tile}`
const shotFamily = (b: Billboard) => b.life?.projectile ? JSON.stringify(b.life.projectile) : `tile:${b.tile}`
const separation = (a: Billboard, b: Billboard) => Math.hypot(a.x - b.x, a.y - b.y)
const tail = (flight: ProjectileFlight) => flight.points[flight.points.length - 1]
const arrival = (flight: ProjectileFlight) => Math.max(flight.ended ?? Infinity, tail(flight).at + 0.035)
const visible = (scene: Scene, p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
const signature = (s: Emitter) => `${s.x},${s.y}:${s.colour.join(',')}`

/** Small, bounded visual histories. No game rules, prose parsing or timers. */
export class DungeonEffects {
  strokes: MeleeStroke[] = []
  traces: SpellTrace[] = []
  bursts: SpellBurst[] = []
  private flashes = new Map<ReturnType<typeof cellKey>, string>()
  private spells = new Map<string, SpellSample>()
  private shots = new Map<string, ProjectileFlight>()
  private flights: ProjectileFlight[] = []
  private level: string | undefined
  private onLevel = false

  observe(scene: Scene, now: number, animate: boolean) {
    const continuing = animate && scene.playerOnLevel && this.onLevel && scene.levelKey === this.level
    if (!animate || !scene.playerOnLevel || !this.onLevel || scene.levelKey !== this.level) this.clear()
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
    const flashes = new Map<ReturnType<typeof cellKey>, string>()
    if (animate && scene.playerOnLevel) for (const cell of scene.cells.values()) {
      const f = cell.flash
      if (cell.visibility !== 'visible' || !f || f.a <= 0) continue
      const key = cellKey(cell.x, cell.y), value = `${f.r},${f.g},${f.b},${f.a}`
      flashes.set(key, value)
      if (!continuing || this.flashes.get(key) === value) continue
      // A server flash is confirmed presentation too, including abilities that
      // report no hit sentence. Retain it when received/cleared between frames.
      const kind: SpellEffect['kind'] = f.r > f.b * 1.3 && f.r > f.g * 1.3 ? 'fire'
        : f.b > f.r * 1.2 && f.g > f.r * 1.1 ? 'cold'
        : f.g > f.r * 1.3 && f.g > f.b * 1.2 ? 'poison' : 'magic'
      this.spell(scene, { x: cell.x, y: cell.y, kind }, now)
    }
    this.flashes = flashes
    // Projectile lights belong to the moving head, never to every path cell.
    const nonProjectiles = { ...scene, billboards: scene.billboards.filter(b => b.kind !== 'projectile') }
    const next = new Map<string, SpellSample>(emittersFor(nonProjectiles).filter(s => s.transient).map(source => [signature(source), { source }]))
    const shots = new Map<string, ProjectileFlight>()
    if (animate && scene.playerOnLevel) for (const billboard of scene.billboards) {
      if (billboard.kind !== 'projectile' || billboard.life?.projectile === false || !visible(scene, billboard)) continue
      const key = shotKey(billboard)
      let flight = this.shots.get(key)
      if (!flight) {
        // Overlay deltas have no missile ID. Join only nearby, fresh samples of
        // the same art family; old/remote shots remain separate flights.
        flight = this.flights.find(f => now - f.seen < 0.12 && now < arrival(f)
          && shotFamily(tail(f).billboard) === shotFamily(billboard)
          && separation(tail(f).billboard, billboard) > 0
          && separation(tail(f).billboard, billboard) <= Math.SQRT2 + 0.01)
        if (flight) {
          const previous = tail(flight)
          flight.points.push({ billboard, at: Math.max(now, previous.at + separation(previous.billboard, billboard) / 20) })
          // Bound long-lived/bouncing paths without dropping unplayed samples.
          if (flight.points.length > 128) flight.points.splice(0, flight.points.length - 128)
          flight.ended = undefined
        } else {
          // Use a visible adjacent actor as the launch point only when unique.
          const actors = [scene.player, ...scene.billboards.filter(b => b.kind === 'monster' && !b.scenery)]
          const origins = actors.filter(a => visible(scene, a) && Math.hypot(a.x - billboard.x, a.y - billboard.y) > 0
            && Math.hypot(a.x - billboard.x, a.y - billboard.y) <= Math.SQRT2 + 0.01)
          const origin = origins.length === 1 ? { ...billboard, x: origins[0].x, y: origins[0].y } : billboard
          flight = { points: [{ billboard: origin, at: now }], seen: now }
          if (origin !== billboard) flight.points.push({ billboard, at: now + separation(origin, billboard) / 20 })
          this.flights.push(flight)
        }
      }
      flight.seen = now
      shots.set(key, flight)
    }
    const live = new Set(shots.values())
    for (const flight of this.flights) if (!live.has(flight) && flight.ended === undefined) flight.ended = now
    this.shots = shots
    if (animate && scene.playerOnLevel) for (const [key, { source, appearance }] of this.spells) {
      if (next.has(key) || !visible(scene, source)) continue
      // Fire smoulders longer; electrical/cold/magic traces dissipate sooner.
      const duration = appearance?.kind === 'sand' || appearance?.kind === 'stone' || appearance?.kind === 'metal' ? 1.7
        : source.pulse === 'electric' ? 1.25 : source.pulse === 'fire' ? 2.8 : 2.1
      this.traces = this.traces.filter(t => signature(t.source) !== key)
      this.traces.push({ source, appearance, born: now, duration })
    }
    this.spells = animate ? next : new Map()
    this.tick(scene, now)
    this.traces = this.traces.slice(-48)
    this.flights = this.flights.slice(-48)
  }

  /** One interpolated sprite per flight, even when all deltas arrive in one RAF. */
  projectiles(now: number): Billboard[] {
    return this.flights.flatMap(flight => {
      if (now >= arrival(flight)) return []
      const points = flight.points
      const index = points.findIndex(point => point.at > now)
      if (index < 1) return [{ ...(index === 0 ? points[0] : tail(flight)).billboard }]
      const from = points[index - 1], to = points[index]
      const t = Math.max(0, Math.min(1, (now - from.at) / (to.at - from.at)))
      return [{ ...to.billboard, x: from.billboard.x + (to.billboard.x - from.billboard.x) * t,
        y: from.billboard.y + (to.billboard.y - from.billboard.y) * t }]
    })
  }

  spell(scene: Scene, effect: SpellEffect, now: number) {
    if (!scene.playerOnLevel || !visible(scene, effect) || scene.cells.get(cellKey(effect.x, effect.y))?.occluder) return false
    const existing = this.bursts.find(b => b.x === effect.x && b.y === effect.y && b.kind === effect.kind && Math.abs(now - b.born) < 0.09)
    if (existing) {
      if (impactStrength(effect.intensity) > impactStrength(existing.intensity)) existing.intensity = effect.intensity
      return false
    }
    const duration = ['heal', 'buff', 'debuff', 'teleport', 'drain'].includes(effect.kind) ? 0.85 : effect.kind === 'electric' ? 0.5 : 0.7
    this.bursts.push({ ...effect, born: now, duration })
    this.bursts = this.bursts.slice(-48)
    return true
  }

  melee(scene: Scene, attack: MeleeAttack, now: number) {
    const distance = Math.hypot(attack.to.x - attack.from.x, attack.to.y - attack.from.y)
    if (!scene.playerOnLevel || !visible(scene, attack.from) || !visible(scene, attack.to) || distance < 0.5 || distance > 2.9) return false
    // Multiple reports for a cleave/brand must not stack the same stroke.
    if (this.strokes.some(s => s.from.x === attack.from.x && s.from.y === attack.from.y && s.to.x === attack.to.x && s.to.y === attack.to.y && Math.abs(now - s.born) < 0.09)) return false
    this.strokes.push({ ...attack, from: { ...attack.from }, to: { ...attack.to }, born: now, duration: meleeTiming(attack.style).duration })
    this.strokes = this.strokes.slice(-12)
    return true
  }

  offset(b: Billboard, now: number) {
    let x = 0, y = 0
    if (b.lying || b.scenery || b.life?.held || b.kind !== 'monster' && b.kind !== 'player') return { x, y }
    for (const stroke of this.strokes) {
      const age = (now - stroke.born) / stroke.duration
      if (age < 0 || age >= 1) continue
      const dx = stroke.to.x - stroke.from.x, dy = stroke.to.y - stroke.from.y, length = Math.hypot(dx, dy)
      const id = combatActorId(b)
      const attacker = stroke.fromId ? id === stroke.fromId : b.x === stroke.from.x && b.y === stroke.from.y
      const target = stroke.hit && (stroke.toId ? id === stroke.toId : b.x === stroke.to.x && b.y === stroke.to.y)
      const pose = meleePose(stroke.style, now - stroke.born)
      const kick = attacker ? pose.lunge : target ? pose.recoil * (0.6 + impactStrength(stroke.intensity) * 0.4) : 0
      x += dx / length * kick; y += dy / length * kick
    }
    // Rapid actions never accumulate more than a small fraction of a cell.
    const limit = Math.max(1, Math.hypot(x, y) / 0.18)
    return { x: x / limit, y: y / limit }
  }

  tick(scene: Scene, now: number) {
    this.bursts = this.bursts.filter(b => now - b.born < b.duration && visible(scene, b))
    this.strokes = this.strokes.filter(s => now - s.born < s.duration && visible(scene, s.from) && visible(scene, s.to))
    this.traces = this.traces.filter(t => now - t.born < t.duration && visible(scene, t.source))
    this.flights = this.flights.filter(flight => {
      const billboard = tail(flight).billboard
      if (!visible(scene, billboard)) return false
      const born = arrival(flight)
      if (now < born) return true
      const appearance = billboard.life?.projectile || undefined
      const light = billboard.life?.lights?.find(l => l.transient)
      const source: Emitter = light ? { ...light, x: billboard.x, y: billboard.y } : {
        x: billboard.x, y: billboard.y, colour: appearance?.colour ?? [194, 177, 218], radius: 0.5, power: 0,
      }
      const physical = appearance && ['sand', 'stone', 'metal'].includes(appearance.kind)
      const duration = physical ? 1.7 : source.pulse === 'fire' ? 2.8 : 2.1
      if (now - born < duration) this.traces.push({ source, appearance, born, duration })
      const kind = physical ? 'physical' : appearance?.kind ?? 'magic'
      const burstDuration = kind === 'electric' ? 0.5 : 0.4
      if (now - born < burstDuration) this.bursts.push({ x: billboard.x, y: billboard.y, kind: kind as SpellEffect['kind'], born, duration: burstDuration, impact: true })
      return false
    })
    this.traces = this.traces.slice(-48)
    this.bursts = this.bursts.slice(-48)
    for (const [key, flight] of this.shots) if (!this.flights.includes(flight)) this.shots.delete(key)
  }

  clear() { this.strokes = []; this.traces = []; this.bursts = []; this.flashes.clear(); this.spells.clear(); this.shots.clear(); this.flights = []; this.onLevel = false; this.level = undefined }
}
