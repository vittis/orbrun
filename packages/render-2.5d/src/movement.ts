import { cellKey, type Billboard, type Scene } from '@orbrun/scene'

export type MovementEasing = 'ease-out' | 'smooth' | 'linear'
export interface MovementOptions { enabled: boolean; duration: number; easing: MovementEasing }
interface Point { x: number; y: number }
interface Tween { from: Point; to: Point; start: number; duration: number; easing: MovementEasing }
interface Actor { kind: Billboard['kind']; signature: string; tween: Tween }

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
  const f = tween.easing === 'ease-out' ? 1 - (1 - t) ** 3 : tween.easing === 'smooth' ? t * t * (3 - 2 * t) : t
  return { x: tween.from.x + (tween.to.x - tween.from.x) * f, y: tween.from.y + (tween.to.y - tween.from.y) * f }
}

/** Confirmed positions only. Retarget in place; never queue turns or mutate a Scene. */
export class DungeonMovement {
  private actors = new Map<string, Actor>()
  private billboards = new Map<Billboard, Tween>()
  private camera: Tween | null = null
  private player: Point | null = null
  private level: string | undefined
  private onLevel = false
  private nextId = 0

  observe(scene: Scene, center: Point, now: number, options: MovementOptions) {
    const reset = scene.levelKey !== this.level || scene.playerOnLevel !== this.onLevel
    if (reset) this.clear()
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
    for (const b of boards) {
      if (assigned.has(b)) continue
      const sig = signature(b)
      const old = [...this.actors].find(([id, a]) => id.startsWith('anonymous:') && !used.has(id) && a.signature === sig && same(a.tween.to, b))
      if (old) { assigned.set(b, old[0]); used.add(old[0]) }
    }
    const unmatched = boards.filter(b => !assigned.has(b))
    const previousUnmatched = [...this.actors].filter(([id]) => id.startsWith('anonymous:') && !used.has(id))
    for (const b of unmatched) {
      const sig = signature(b)
      const arrivals = unmatched.filter(other => signature(other) === sig)
      const departures = previousUnmatched.filter(([, a]) => a.signature === sig)
      const id = arrivals.length === 1 && departures.length === 1 ? departures[0][0] : `anonymous:${this.nextId++}`
      assigned.set(b, id); used.add(id)
    }
    this.billboards.clear()
    for (const b of boards) {
      const id = assigned.get(b)!, previous = this.actors.get(id)
      const tween = this.retarget(previous?.kind === b.kind ? previous.tween : undefined, b, scene, now, options)
      next.set(id, { kind: b.kind, signature: signature(b), tween })
      this.billboards.set(b, tween)
    }
    const walked = this.player && !same(this.player, scene.player) && distance(this.player, scene.player) <= 1
    // Only follow a walking camera. Targeting pans, teleports and level changes snap.
    const dx = this.player ? scene.player.x - this.player.x : 0
    const dy = this.player ? scene.player.y - this.player.y : 0
    const following = walked && this.camera && center.x - this.camera.to.x === dx && center.y - this.camera.to.y === dy
    this.camera = this.retarget(this.camera ?? undefined, center, scene, now, { ...options, enabled: options.enabled && (!!following || !!this.camera && same(this.camera.to, center)) }, false)
    this.actors = next
    this.player = { ...scene.player }
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
  }

  private retarget(old: Tween | undefined, to: Point, scene: Scene, now: number, options: MovementOptions, checkVisibility = true): Tween {
    if (!options.enabled || !old) return still(to)
    const from = sampleMovement(old, now)
    // Never glide through unknown space or draw a long streak after a teleport.
    if (distance(old.to, to) > 1 || distance(from, to) > 2 || checkVisibility && (!visible(scene, old.to) || !visible(scene, from))) return still(to)
    if (same(old.to, to)) return old
    return { from, to: { x: to.x, y: to.y }, start: now, duration: options.duration, easing: options.easing }
  }

  position(b: Billboard, now: number): Point { return sampleMovement(this.billboards.get(b) ?? still(b), now) }
  center(target: Point, now: number): Point {
    return this.camera && same(this.camera.to, target) ? sampleMovement(this.camera, now) : target
  }
  moving(b: Billboard, now: number) {
    const tween = this.billboards.get(b)
    return !!tween && now < tween.start + tween.duration - 1e-9
  }
  cameraMoving(now: number) { return !!this.camera && now < this.camera.start + this.camera.duration - 1e-9 }
  finish() {
    for (const actor of this.actors.values()) { actor.tween.from = { ...actor.tween.to }; actor.tween.duration = 0 }
    if (this.camera) this.camera = still(this.camera.to)
  }
  clear() {
    this.actors.clear(); this.billboards.clear(); this.camera = null; this.player = null; this.nextId = 0
  }
}
