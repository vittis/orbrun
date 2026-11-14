import { cellKey, StepCadence, planStep, sampleStep, type StepCurve, type Billboard, type Scene } from '@orbrun/scene'

export type MovementEasing = 'ease-out' | 'smooth' | 'linear'
export interface MovementOptions { enabled: boolean; duration: number; easing: MovementEasing }
interface Point { x: number; y: number }
interface Tween { from: Point; to: Point; start: number; duration: number; easing: MovementEasing; curve?: StepCurve }
interface Actor {
  kind: Billboard['kind']; signature: string; tween: Tween
  // Snapshot the phase origin and integrate rate changes; mutable scene objects
  // and destination cells must never restart an actor's idle animation.
  origin: Point; time: number; at: number; rate: number
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
const distance = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
const still = (p: Point): Tween => ({ from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y }, start: 0, duration: 0, easing: 'linear' })
const visible = (scene: Scene, p: Point) => scene.cells.get(cellKey(Math.round(p.x), Math.round(p.y)))?.visibility === 'visible'
const identity = (b: Billboard): string | undefined => {
  if (b.kind === 'player') return 'player'
  const id = b.id ?? (b.ref as { id?: number | string } | undefined)?.id
  return id === undefined ? undefined : `${b.kind}:${typeof id}:${id}`
}
const signature = (b: Billboard) => JSON.stringify([b.kind, b.tile, b.name, b.lying ?? false])

export function sampleMovement(tween: Tween, now: number): Point {
  const t = tween.duration ? Math.max(0, Math.min(1, (now - tween.start) / tween.duration)) : 1
  const f = tween.curve ? sampleStep(tween.curve, now - tween.start).distance / tween.curve.length
    : tween.easing === 'ease-out' ? 1 - (1 - t) ** 3 : tween.easing === 'smooth' ? t * t * (3 - 2 * t) : t
  return { x: tween.from.x + (tween.to.x - tween.from.x) * f, y: tween.from.y + (tween.to.y - tween.from.y) * f }
}

function velocity(tween: Tween, now: number): Point {
  const t = tween.duration ? Math.max(0, (now - tween.start) / tween.duration) : 1
  if (t >= 1) return { x: 0, y: 0 }
  const rate = tween.curve ? sampleStep(tween.curve, now - tween.start).speed / tween.curve.length
    : (tween.easing === 'ease-out' ? 3 * (1 - t) ** 2 : tween.easing === 'smooth' ? 6 * t * (1 - t) : 1) / tween.duration
  return { x: (tween.to.x - tween.from.x) * rate, y: (tween.to.y - tween.from.y) * rate }
}

/** Confirmed positions only. Retarget in place; never queue turns or mutate a Scene. */
export class DungeonMovement {
  private actors = new Map<string, Actor>()
  private billboards = new Map<Billboard, Actor>()
  private camera: Tween | null = null
  private player: Point | null = null
  private level: string | undefined
  private onLevel = false
  private nextId = 0
  private cadence = new StepCadence()

  observe(scene: Scene, center: Point, now: number, options: MovementOptions) {
    const reset = scene.levelKey !== this.level || scene.playerOnLevel !== this.onLevel
    if (reset) this.clear()
    if (!options.enabled) this.cadence.reset()
    const next = new Map<string, Actor>(), assigned = new Map<Billboard, string>()
    const boards = scene.billboards.filter(b => visible(scene, b))
    const used = new Set<string>()
    // Explicit identities survive tile/doll changes and two identical monsters crossing.
    for (const b of boards) {
      const id = identity(b)
      if (id !== undefined) { assigned.set(b, id); used.add(id) }
    }
    // Anonymous art is matched conservatively: reserve stationary copies first,
    // then only pair a unique disappearance/arrival of the same artwork.
    // Index once: a floor full of anonymous items must not scan and allocate
    // the entire actor list again for each item on every confirmed step.
    const signatures = new Map<Billboard, string>()
    const stationary = new Map<string, string[]>()
    for (const [id, a] of this.actors) {
      if (!id.startsWith('anonymous:')) continue
      const key = `${a.signature}:${a.tween.to.x}:${a.tween.to.y}`
      const ids = stationary.get(key)
      if (ids) ids.push(id)
      else stationary.set(key, [id])
    }
    for (const ids of stationary.values()) ids.reverse()
    const arrivals = new Map<string, number>()
    for (const b of boards) {
      if (assigned.has(b)) continue
      const sig = signature(b)
      signatures.set(b, sig)
      const ids = stationary.get(`${sig}:${b.x}:${b.y}`)
      const id = ids?.pop()
      if (id !== undefined) { assigned.set(b, id); used.add(id) }
      else arrivals.set(sig, (arrivals.get(sig) ?? 0) + 1)
    }
    const departures = new Map<string, string | null>()
    for (const [id, a] of this.actors) {
      if (!id.startsWith('anonymous:') || used.has(id)) continue
      departures.set(a.signature, departures.has(a.signature) ? null : id)
    }
    for (const b of boards) {
      if (assigned.has(b)) continue
      const sig = signatures.get(b)!, previous = departures.get(sig)
      const id = arrivals.get(sig) === 1 && previous != null ? previous : `anonymous:${this.nextId++}`
      assigned.set(b, id); used.add(id)
    }
    this.billboards.clear()
    for (const b of boards) {
      const id = assigned.get(b)!, candidate = this.actors.get(id)
      const previous = candidate?.kind === b.kind ? candidate : undefined
      const tween = this.retarget(previous?.tween, b, scene, now, options, true, b.kind === 'player')
      const rate = b.life?.rate ?? 1
      const actor: Actor = { kind: b.kind, signature: signatures.get(b) ?? signature(b), tween,
        origin: previous?.origin ?? { x: b.x, y: b.y },
        time: previous ? previous.time + (now - previous.at) * previous.rate : now * rate, at: now, rate }
      next.set(id, actor)
      this.billboards.set(b, actor)
    }
    const walked = this.player && !same(this.player, scene.player)
    // Follow confirmed player movement at any distance. Targeting pans still snap.
    const dx = this.player ? scene.player.x - this.player.x : 0
    const dy = this.player ? scene.player.y - this.player.y : 0
    const following = walked && this.camera && center.x - this.camera.to.x === dx && center.y - this.camera.to.y === dy
    const playerTween = next.get('player')?.tween
    if (following && options.enabled && playerTween) {
      const offset = { x: center.x - scene.player.x, y: center.y - scene.player.y }
      // One curve owns both feet and camera, so they cannot drift or settle at different times.
      this.camera = { ...playerTween, from: { x: playerTween.from.x + offset.x, y: playerTween.from.y + offset.y }, to: { ...center } }
    } else this.camera = this.retarget(this.camera ?? undefined, center, scene, now, { ...options, enabled: options.enabled && (!!following || !!this.camera && same(this.camera.to, center)) }, false)
    this.actors = next
    this.player = { ...scene.player }
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
  }

  private retarget(old: Tween | undefined, to: Point, scene: Scene, now: number, options: MovementOptions, checkVisibility = true, player = false): Tween {
    if (!options.enabled || !old) return still(to)
    const from = sampleMovement(old, now)
    // Distance alone cannot distinguish a teleport from fast movement.
    if (checkVisibility && (!visible(scene, old.to) || !visible(scene, from))) {
      if (player) this.cadence.reset()
      return still(to)
    }
    if (same(old.to, to)) return old
    if (same(from, to)) {
      if (player) this.cadence.reset()
      return still(to)
    }
    if (player) {
      const timing = this.cadence.confirm(now)
      if (options.easing === 'ease-out') {
        const duration = timing.continuous ? Math.max(options.duration, Math.min(options.duration * 1.4, timing.duration)) : options.duration
        const length = distance(from, to), v = velocity(old, now)
        const dx = (to.x - from.x) / length, dy = (to.y - from.y) / length
        const speed = timing.continuous ? Math.max(0, (v.x * dx + v.y * dy) / (dx * dx + dy * dy)) : undefined
        return { from, to: { x: to.x, y: to.y }, start: now, duration, easing: options.easing, curve: planStep(length, duration, speed, timing.continuous) }
      }
    }
    return { from, to: { x: to.x, y: to.y }, start: now, duration: options.duration, easing: options.easing }
  }

  position(b: Billboard, now: number): Point { return sampleMovement(this.billboards.get(b)?.tween ?? still(b), now) }
  animation(b: Billboard, now: number): Point & { time: number } {
    const actor = this.billboards.get(b)
    return actor ? { ...actor.origin, time: actor.time + (now - actor.at) * actor.rate }
      : { x: b.x, y: b.y, time: now * (b.life?.rate ?? 1) }
  }
  center(target: Point, now: number): Point {
    return this.camera && same(this.camera.to, target) ? sampleMovement(this.camera, now) : target
  }
  moving(b: Billboard, now: number) {
    const tween = this.billboards.get(b)?.tween
    return !!tween && now < tween.start + tween.duration - 1e-9
  }
  cameraMoving(now: number) { return !!this.camera && now < this.camera.start + this.camera.duration - 1e-9 }
  finish() {
    for (const actor of this.actors.values()) { actor.tween.from = { ...actor.tween.to }; actor.tween.duration = 0; actor.tween.curve = undefined }
    this.cadence.reset()
    if (this.camera) this.camera = still(this.camera.to)
  }
  clear() {
    this.actors.clear(); this.billboards.clear(); this.camera = null; this.player = null; this.nextId = 0
    this.cadence.reset()
  }
}
