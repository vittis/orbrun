import { cellKey, combatActorId, emittersFor, meleePose, meleeTiming, impactStrength, type Billboard, type Emitter, type MeleeAttack, type Scene, type ProjectileAppearance, type SpellEffect } from '@orbrun/scene'

export interface MeleeStroke extends MeleeAttack { born: number; duration: number }
export interface SpellTrace { source: Emitter; born: number; duration: number; appearance?: ProjectileAppearance }
export interface SpellBurst extends SpellEffect { born: number; duration: number; impact?: boolean; material?: ProjectileAppearance['kind']; direction?: number }
interface SpellSample { source: Emitter; appearance?: ProjectileAppearance }
interface ProjectilePoint { billboard: Billboard; at: number }
interface ProjectileFlight { points: ProjectilePoint[]; seen: number; ended?: number; presented?: boolean }
const PROJECTILE_SPEED = 240
const MIN_PROJECTILE_TIME = 0.02
const shotKey = (b: Billboard) => `${b.x},${b.y}:${b.tile}`
const shotFamily = (b: Billboard) => {
  const a = b.life?.projectile
  return a ? a.family ?? `${a.kind}:${a.colour}:${a.beam}` : `tile:${b.tile}`
}
const separation = (a: Billboard, b: Billboard) => Math.hypot(a.x - b.x, a.y - b.y)
const tail = (flight: ProjectileFlight) => flight.points[flight.points.length - 1]
const arrival = (flight: ProjectileFlight) => Math.max(flight.ended ?? Infinity, tail(flight).at, flight.points[0].at + MIN_PROJECTILE_TIME)
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
    const groups = new Map<string, Billboard[]>()
    for (const b of scene.billboards) {
      if (b.kind !== 'projectile') continue
      const a = b.life?.projectile, key = `${shotFamily(b)}:${a ? a.angle : ''}`
      const group = groups.get(key) ?? []
      group.push(b); groups.set(key, group)
    }
    const projectiles = [...groups.values()].flatMap(group => this.orderProjectiles(scene, group))
    if (animate && scene.playerOnLevel) for (const billboard of projectiles) {
      if (billboard.kind !== 'projectile' || billboard.life?.projectile === false || !visible(scene, billboard)) continue
      const key = shotKey(billboard)
      let flight = this.shots.get(key)
      if (!flight) {
        // Overlay deltas have no missile ID. Join only nearby, fresh samples of
        // the same art family; old/remote shots remain separate flights.
        const candidates = this.flights.filter(f => {
          const last = tail(f).billboard, previous = f.points.at(-2)?.billboard
          const dx = last.x - (previous?.x ?? last.x), dy = last.y - (previous?.y ?? last.y)
          const forward = !previous || (billboard.x - last.x) * dx + (billboard.y - last.y) * dy >= 0
          return now - f.seen < 0.12 && now < arrival(f) && forward
            && shotFamily(last) === shotFamily(billboard)
            && separation(last, billboard) > 0 && separation(last, billboard) <= Math.SQRT2 + 0.01
        })
        flight = candidates.length === 1 ? candidates[0] : undefined
        if (flight) {
          const previous = tail(flight)
          // Only extend the launch backwards once the observed path establishes
          // which adjacent actor is behind the missile. Never pick the target.
          if (flight.points.length === 1 && !flight.presented) {
            this.launch(scene, flight, billboard.x - previous.billboard.x, billboard.y - previous.billboard.y)
          }
          if (flight.presented) previous.at = Math.max(previous.at, now)
          flight.points.push({ billboard, at: Math.max(now, tail(flight).at + separation(previous.billboard, billboard) / PROJECTILE_SPEED) })
          // Bound long-lived/bouncing paths without dropping unplayed samples.
          if (flight.points.length > 128) flight.points.splice(0, flight.points.length - 128)
          flight.ended = undefined
        } else {
          flight = { points: [{ billboard, at: now }], seen: now }
          const appearance = billboard.life?.projectile
          const angle = appearance ? appearance.angle : undefined
          if (angle !== undefined) this.launch(scene, flight,
            Math.cos(angle), Math.sin(angle))
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

  private orderProjectiles(scene: Scene, group: Billboard[]) {
    const appearance = group[0].life?.projectile
    if (!appearance) return group
    const angle = appearance.angle
    if (angle !== undefined) return group.sort((p, q) => (p.x - q.x) * Math.cos(angle) + (p.y - q.y) * Math.sin(angle))
    if (!appearance.distanceCycle || group.length < 2) return group
    // Crawl batches a complete ray in map order. Magic Dart's six variants
    // encode distance, NOT direction or a unique sequence (distance 7 wraps).
    // Score visible actors outside the ray against every encoded distance.
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
    const matches = (origin: { x: number; y: number }) => !group.some(b => b.x === origin.x && b.y === origin.y)
      && group.some(b => distance(b, origin) === 1)
      && group.every(b => {
        const art = b.life?.projectile
        return !art || art.distancePhase === undefined || !art.distanceCycle || (distance(b, origin) - 1) % art.distanceCycle === art.distancePhase
      })
    const actors = [scene.player, ...scene.billboards.filter(b => b.kind === 'monster' && !b.scenery)]
      .filter(a => visible(scene, a) && matches(a))
    if (actors.length === 1) return group.sort((a, b) => distance(a, actors[0]) - distance(b, actors[0]))
    // An offscreen shooter is still safe when all possible ray origins imply
    // the same ordering. Otherwise retain chronological samples, never flip.
    const origins = new Map<string, { x: number; y: number }>()
    for (const b of group) if (b.life?.projectile && b.life.projectile.distancePhase === 0) {
      for (let y = b.y - 1; y <= b.y + 1; y++) for (let x = b.x - 1; x <= b.x + 1; x++) {
        if (matches({ x, y })) origins.set(`${x},${y}`, { x, y })
      }
    }
    const orders = [...origins.values()].map(origin => [...group].sort((a, b) => distance(a, origin) - distance(b, origin)))
    if (orders.length && orders.every(order => order.every((b, i) => b === orders[0][i]))) return orders[0]
    const known = group.map(b => this.shots.get(shotKey(b))).find(f => f && f.points.length > 1)
    if (known) return group.sort((a, b) => distance(a, known.points[0].billboard) - distance(b, known.points[0].billboard))
    // With no trustworthy direction, do not invent a backwards flight or fake
    // impacts along an unordered snapshot. Later confirmed samples may resolve it.
    return []
  }

  private launch(scene: Scene, flight: ProjectileFlight, dx: number, dy: number) {
    const first = flight.points[0]
    const actors = [scene.player, ...scene.billboards.filter(b => b.kind === 'monster' && !b.scenery)]
    const origins = actors.filter(a => {
      const x = first.billboard.x - a.x, y = first.billboard.y - a.y
      return Math.hypot(x, y) > 0 && Math.hypot(x, y) <= Math.SQRT2 + 0.01
        && x * dx + y * dy > 0.01 && visible(scene, a) && !scene.cells.get(cellKey(a.x, a.y))?.occluder
    })
    if (origins.length !== 1) return
    const { x, y } = origins[0]
    flight.points.unshift({ billboard: { ...first.billboard, x, y }, at: first.at })
    first.at += separation(first.billboard, flight.points[0].billboard) / PROJECTILE_SPEED
  }

  /** One interpolated sprite per flight, even when all deltas arrive in one RAF. */
  projectiles(now: number): Billboard[] {
    return this.flights.flatMap(flight => {
      if (now >= arrival(flight)) return []
      flight.presented = true
      const points = flight.points
      const index = points.findIndex(point => point.at > now)
      const from = points[Math.max(0, index < 0 ? points.length - 2 : index - 1)]
      const to = index < 0 ? tail(flight) : points[index]
      const t = to.at > from.at ? Math.max(0, Math.min(1, (now - from.at) / (to.at - from.at))) : 1
      const artwork = to.billboard.life?.projectile
      const dx = to.billboard.x - from.billboard.x, dy = to.billboard.y - from.billboard.y
      const aimX = tail(flight).billboard.x - points[0].billboard.x
      const aimY = tail(flight).billboard.y - points[0].billboard.y
      const rotation = artwork && artwork.angle !== undefined && (aimX || aimY)
        ? Math.atan2(aimY, aimX) - artwork.angle : undefined
      return [{ ...to.billboard, rotation, x: from.billboard.x + dx * t, y: from.billboard.y + dy * t }]
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
      const kind = appearance?.kind === 'sand' || appearance?.kind === 'stone' ? 'earth' : physical ? 'physical' : appearance?.kind ?? 'magic'
      const burstDuration = kind === 'electric' ? 0.5 : 0.4
      if (now - born < burstDuration) this.bursts.push({ x: billboard.x, y: billboard.y, kind: kind as SpellEffect['kind'], born, duration: burstDuration, impact: true, material: appearance?.kind, direction: Math.atan2(billboard.y - flight.points[0].billboard.y, billboard.x - flight.points[0].billboard.x) })
      return false
    })
    this.traces = this.traces.slice(-48)
    this.bursts = this.bursts.slice(-48)
    for (const [key, flight] of this.shots) if (!this.flights.includes(flight)) this.shots.delete(key)
  }

  coversImpact(x: number, y: number, now: number) {
    return this.traces.some(t => t.source.x === x && t.source.y === y && now >= t.born && now - t.born < t.duration)
      || this.bursts.some(b => b.x === x && b.y === y && now - b.born >= 0 && now - b.born < b.duration)
      || this.strokes.some(s => s.hit && s.to.x === x && s.to.y === y && now - s.born >= 0 && now - s.born < s.duration)
      || this.flights.some(f => tail(f).billboard.x === x && tail(f).billboard.y === y && now < arrival(f))
  }

  clear() { this.strokes = []; this.traces = []; this.bursts = []; this.flashes.clear(); this.spells.clear(); this.shots.clear(); this.flights = []; this.onLevel = false; this.level = undefined }
}
