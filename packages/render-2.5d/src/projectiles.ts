import { cellKey, combatActorId, type Billboard, type Scene, type SpellEffect } from '@orbrun/scene'

interface Flight {
  points: Billboard[]
  born: number
  seen: number
  clock?: number
  endClock?: number
  ended?: number
  targetId?: string
  travelled: number
  presented?: boolean
}
export interface ProjectileSprite extends Billboard {
  targetId?: string
  /** Blend the last segment onto the recipient's upright WebTiles artwork. */
  contactBlend: number
  destination: { x: number; y: number }
}
export interface ProjectileContact {
  time(): number
  /** Incoming path segment, kept current while a native batch is assembled. */
  direction(): { x: number; y: number } | undefined
}
const LANDING_TIME = 0.06
const MIN_TRAVEL = 0.07
const TRAVEL_STRETCH = 1.35
const key = (b: Billboard) => `${b.x},${b.y}:${b.tile}`
const family = (b: Billboard) => {
  const art = b.life?.projectile
  return art ? art.family ?? `${art.kind}:${art.colour}:${art.beam}` : `tile:${b.tile}`
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const gridDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const tail = (f: Flight) => f.points[f.points.length - 1]
const length = (f: Flight) => f.points.reduce((sum, b, i) => sum + (i ? distance(f.points[i - 1], b) : 0), 0)
const duration = (f: Flight) => {
  const native = f.clock !== undefined && f.endClock !== undefined ? f.endClock - f.clock : 0
  // Native delays describe the whole batch, not a delay to add at every tile.
  const pacing = native > 0 ? native : Math.max(f.seen - f.born, length(f) * 0.025)
  return Math.max(MIN_TRAVEL, Math.min(0.3, pacing * TRAVEL_STRETCH))
}
const arrival = (f: Flight) => f.born + duration(f)
const visible = (scene: Scene, b: { x: number; y: number }) => scene.cells.get(cellKey(Math.round(b.x), Math.round(b.y)))?.visibility === 'visible'

/** One head follows confirmed overlays; hit feedback still owns the only burst. */
export class DungeonProjectiles {
  private flights: Flight[] = []
  private current = new Map<string, Flight>()

  observe(scene: Scene, now: number, recipient: (b: Billboard) => Billboard | undefined) {
    const groups = new Map<string, Billboard[]>()
    for (const b of scene.billboards) {
      if (b.kind !== 'projectile' || b.life?.projectile === false || !visible(scene, b)) continue
      const art = b.life?.projectile, groupKey = `${family(b)}:${art ? art.angle : ''}`
      const group = groups.get(groupKey) ?? []
      group.push(b); groups.set(groupKey, group)
    }
    const current = new Map<string, Flight>()
    for (const group of groups.values()) for (const b of this.order(scene, group)) {
      let flight = this.current.get(key(b))
      if (!flight) {
        const candidates = this.flights.filter(f => {
          const last = tail(f), previous = f.points.at(-2)
          const forward = !previous || (b.x - last.x) * (last.x - previous.x) + (b.y - last.y) * (last.y - previous.y) >= 0
          return f.ended === undefined && now - f.seen < 0.2 && family(last) === family(b) && forward
            && distance(last, b) > 0 && distance(last, b) <= Math.SQRT2 + 0.01
        })
        flight = candidates.length === 1 ? candidates[0] : undefined
        if (flight) {
          if (flight.points.length === 1 && !flight.presented) this.launch(scene, flight, b.x - tail(flight).x, b.y - tail(flight).y)
          flight.points.push(b)
          flight.targetId = undefined
          if (flight.points.length > 128) flight.points.splice(0, flight.points.length - 128)
        } else {
          flight = { points: [b], born: now, seen: now, clock: scene.projectileTime, travelled: 0 }
          const art = b.life?.projectile
          if (art && art.angle !== undefined) this.launch(scene, flight, Math.cos(art.angle), Math.sin(art.angle))
          this.flights.push(flight)
        }
      }
      flight.seen = now
      flight.endClock = scene.projectileTime
      current.set(key(b), flight)
    }
    const live = new Set(current.values())
    for (const f of this.flights) {
      if (!live.has(f) && f.ended === undefined) { f.ended = now; f.endClock = scene.projectileTime }
      const target = recipient(tail(f))
      if (target) f.targetId = combatActorId(target)
    }
    this.current = current
    this.flights = this.flights.slice(-48)
    this.tick(scene, now)
  }

  private order(scene: Scene, group: Billboard[]) {
    const art = group[0].life?.projectile
    if (art && art.angle !== undefined) return group.sort((a, b) => (a.x - b.x) * Math.cos(art.angle!) + (a.y - b.y) * Math.sin(art.angle!))
    if (group.length < 2) return group
    const matches = (origin: { x: number; y: number }) => !group.some(b => gridDistance(b, origin) === 0)
      && group.some(b => gridDistance(b, origin) === 1)
      && group.every(b => {
        const a = b.life?.projectile
        return !a || a.distancePhase === undefined || !a.distanceCycle || (gridDistance(b, origin) - 1) % a.distanceCycle === a.distancePhase
      })
    const actors = [scene.player, ...scene.billboards.filter(b => b.kind === 'monster' && !b.scenery)]
      .filter(a => visible(scene, a) && matches(a))
    if (actors.length === 1) return group.sort((a, b) => gridDistance(a, actors[0]) - gridDistance(b, actors[0]))
    if (art && art.distanceCycle) {
      const origins: { x: number; y: number }[] = []
      for (const b of group) if (b.life?.projectile && b.life.projectile.distancePhase === 0) {
        for (let y = b.y - 1; y <= b.y + 1; y++) for (let x = b.x - 1; x <= b.x + 1; x++) if (matches({ x, y })) origins.push({ x, y })
      }
      const orders = origins.map(o => [...group].sort((a, b) => gridDistance(a, o) - gridDistance(b, o)))
      if (orders.length && orders.every(order => order.every((b, i) => b === orders[0][i]))) return orders[0]
      const known = group.map(b => this.current.get(key(b))).find(f => f && f.points.length > 1)
      return known ? group.sort((a, b) => gridDistance(a, known.points[0]) - gridDistance(b, known.points[0])) : []
    }
    return group
  }

  private launch(scene: Scene, f: Flight, dx: number, dy: number) {
    const first = f.points[0]
    const origins = [scene.player, ...scene.billboards.filter(b => b.kind === 'monster' && !b.scenery)].filter(a => {
      const x = first.x - a.x, y = first.y - a.y
      return distance(first, a) > 0 && distance(first, a) <= Math.SQRT2 + 0.01 && x * dx + y * dy > 0.01 && visible(scene, a)
        && !scene.cells.get(cellKey(a.x, a.y))?.occluder
    })
    if (origins.length === 1) f.points.unshift({ ...first, x: origins[0].x, y: origins[0].y })
  }

  bind(effect: SpellEffect, now: number): ProjectileContact | undefined {
    const matches = this.flights.filter(f => now - f.seen < 0.25 && (effect.turn === undefined || f.ended === undefined || now < arrival(f) + LANDING_TIME)
      && (effect.actorId && effect.actorId === f.targetId || f.points.some(b => b.x === effect.x && b.y === effect.y)))
    if (matches.length !== 1) return
    const f = matches[0]
    if (effect.actorId && tail(f).x === effect.x && tail(f).y === effect.y) f.targetId = effect.actorId
    return { direction: () => {
      const index = effect.actorId && effect.actorId === f.targetId ? f.points.length - 1
        : f.points.findIndex(b => b.x === effect.x && b.y === effect.y)
      const to = f.points[Math.max(0, index)], from = f.points[Math.max(0, index - 1)]
      const next = f.points[1]
      const dx = index > 0 ? to.x - from.x : next ? next.x - to.x : 0
      const dy = index > 0 ? to.y - from.y : next ? next.y - to.y : 0
      const distance = Math.hypot(dx, dy)
      if (distance) return { x: dx / distance, y: dy / distance }
      const art = to.life?.projectile
      if (art && art.angle !== undefined) return { x: Math.cos(art.angle), y: Math.sin(art.angle) }
    }, time: () => {
      if (effect.actorId && effect.actorId === f.targetId) return arrival(f)
      let along = 0
      for (let i = 0; i < f.points.length; i++) {
        if (i) along += distance(f.points[i - 1], f.points[i])
        if (f.points[i].x === effect.x && f.points[i].y === effect.y) return f.born + duration(f) * (length(f) ? along / length(f) : 1)
      }
      return arrival(f)
    } }
  }

  sample(now: number): ProjectileSprite[] {
    return this.flights.flatMap(f => {
      if (f.ended !== undefined && now >= Math.max(f.ended, arrival(f)) + LANDING_TIME) return []
      f.presented = true
      const total = length(f), travelled = Math.min(total, Math.max(f.travelled, total * Math.max(0, Math.min(1, (now - f.born) / duration(f)))))
      f.travelled = travelled
      let along = 0
      for (let i = 1; i < f.points.length; i++) {
        const from = f.points[i - 1], to = f.points[i], segment = distance(from, to)
        if (travelled > along + segment && i < f.points.length - 1) { along += segment; continue }
        const t = segment ? Math.max(0, Math.min(1, (travelled - along) / segment)) : 1
        return [{ ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
          targetId: f.targetId, contactBlend: i === f.points.length - 1 ? t : 0, destination: tail(f) }]
      }
      return [{ ...tail(f), targetId: f.targetId, contactBlend: 1, destination: tail(f) }]
    })
  }

  tick(scene: Scene, now: number) {
    this.flights = this.flights.filter(f => visible(scene, tail(f))
      && (!f.targetId || !scene.billboards.some(b => combatActorId(b) === f.targetId && !visible(scene, b)))
      && (f.ended === undefined || now < Math.max(f.ended, arrival(f)) + LANDING_TIME))
    for (const [k, f] of this.current) if (!this.flights.includes(f)) this.current.delete(k)
  }
  clear() { this.flights = []; this.current.clear() }
}
