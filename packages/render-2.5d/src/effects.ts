import { DungeonProjectiles, type ProjectileContact } from './projectiles.js'
import { DungeonSpawns } from './spawns.js'
import { nativeSpellArt } from './spell-presentation.js'
import { cellKey, combatActorId, creatureMaterial, emittersFor, bumpPose, bumpTiming, impactStrength, HitEffects, type HitEffect, type Billboard, type Emitter, type CombatBump, type Scene, type ProjectileAppearance, type SpellEffect } from '@orbrun/scene'
import { HIT_SPRAY_DURATION, type HitSpray } from './hit-spray.js'

export interface BodyBump extends CombatBump { born: number; duration: number }
export interface SpellTrace { source: Emitter; born: number; duration: number; appearance?: ProjectileAppearance }
type ImpactSource = 'generic' | 'flash' | 'melee' | 'confirmed'
export interface SpellBurst extends SpellEffect { born: number; duration: number; source: ImpactSource; material?: ProjectileAppearance['kind']; requested: number; contact?: ProjectileContact; spray?: HitSpray; nativeArtwork?: boolean }
interface SpellSample { source: Emitter; appearance?: ProjectileAppearance }
interface ActorPosition { x: number; y: number; at: number; previous?: { x: number; y: number; at: number } }
interface ProjectileSample { billboard: Billboard; ended?: number }
const PROJECTILE_EXPOSURE = 0.12
const priority: Record<ImpactSource, number> = { generic: 0, flash: 1, melee: 2, confirmed: 3 }
const shotKey = (b: Billboard) => `${b.x},${b.y}:${b.tile}`
const creature = (b: Billboard) => b.kind === 'player' || b.kind === 'monster' && !b.scenery
const visible = (scene: Scene, p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
const signature = (s: Emitter) => `${s.x},${s.y}:${s.colour.join(',')}`

/** Small, bounded visual histories. No game rules, prose parsing or timers. */
export class DungeonEffects {
  readonly hits = new HitEffects()
  readonly spawns = new DungeonSpawns()
  bumps: BodyBump[] = []
  traces: SpellTrace[] = []
  bursts: SpellBurst[] = []
  private nativeCells = new Set<ReturnType<typeof cellKey>>()
  private nativeUntil = new Map<ReturnType<typeof cellKey>, number>()
  private flashes = new Map<ReturnType<typeof cellKey>, string>()
  private spells = new Map<string, SpellSample>()
  private shots = new Map<string, ProjectileSample>()
  private missiles = new DungeonProjectiles()
  private actors = new Map<string, ActorPosition>()
  private level: string | undefined
  private onLevel = false
  private spraySequence = 0

  observe(scene: Scene, now: number, animate: boolean) {
    const continuing = animate && scene.playerOnLevel && this.onLevel && scene.levelKey === this.level
    if (!animate || !scene.playerOnLevel || !this.onLevel || scene.levelKey !== this.level) this.clear()
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
    this.hits.observe(scene, animate)
    this.actors = new Map(scene.billboards.filter(b => creature(b) && visible(scene, b)).map(b => {
      const id = combatActorId(b), old = this.actors.get(id)
      const previous = old && (old.x !== b.x || old.y !== b.y) ? { x: old.x, y: old.y, at: now } : old?.previous
      return [id, { x: b.x, y: b.y, at: now, previous }]
    }))
    if (animate && scene.playerOnLevel) {
      this.spawns.observe(scene, now, continuing)
      this.missiles.observe(scene, now, b => this.target(scene, { x: b.x, y: b.y, kind: 'magic' }, now), b => this.spawns.stationary(b))
    }
    for (const [key, until] of this.nativeUntil) if (now >= until) this.nativeUntil.delete(key)
    for (const key of this.nativeCells) this.nativeUntil.set(key, now + PROJECTILE_EXPOSURE)
    this.nativeCells = new Set(scene.billboards.filter(b => this.nativeArea(b) && visible(scene, b)).map(b => cellKey(b.x, b.y)))
    for (const cell of scene.cells.values()) if (cell.life?.spawn && cell.visibility === 'visible') this.nativeCells.add(cellKey(cell.x, cell.y))
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
      this.spell(scene, { x: cell.x, y: cell.y, kind }, now, 'flash')
    }
    this.flashes = flashes
    // Native overlays own projectile artwork; they never invent hit locations.
    const nonProjectiles = { ...scene, billboards: scene.billboards.filter(b => b.kind !== 'projectile') }
    const next = new Map<string, SpellSample>(emittersFor(nonProjectiles).filter(s => s.transient).map(source => [signature(source), { source }]))
    const current = new Set<string>()
    if (animate && scene.playerOnLevel) for (const billboard of scene.billboards) {
      if (billboard.kind !== 'projectile' || billboard.life?.projectile === false || !visible(scene, billboard)) continue
      const key = shotKey(billboard)
      current.add(key)
      this.shots.set(key, { billboard })
    }
    for (const [key, shot] of this.shots) if (!current.has(key) && shot.ended === undefined) shot.ended = now
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
    while (this.shots.size > 128) this.shots.delete(this.shots.keys().next().value!)
  }

  projectiles(now: number) { return this.missiles.sample(now) }

  hit(scene: Scene, effect: HitEffect, now: number) {
    const target = this.target(scene, { ...effect, kind: 'physical' }, now)
    const placed = target ? { ...effect, actorId: combatActorId(target), x: target.x, y: target.y } : effect
    const contact = this.missiles.bind({ ...placed, kind: 'physical' }, now)
    const added = this.hits.spawn(scene, placed, now, contact?.time)
    // Only confirmed damage emits body material. Misses, resisted casts and
    // utility effects can still have their own spell art without shedding blood.
    if (added && target) {
      const direction = contact?.direction() ?? (target.kind === 'player' ? { x: 0, y: 0 }
        : { x: target.x - scene.player.x, y: target.y - scene.player.y })
      this.spell(scene, { ...placed, kind: 'physical' }, now, 'generic', this.sprayFor(target, direction, 'ranged'))
    }
    return added
  }

  private sprayFor(target: Billboard, direction: { x: number; y: number }, source: HitSpray['source']): HitSpray {
    const seed = ++this.spraySequence, length = Math.hypot(direction.x, direction.y)
    // Untraced incoming damage has no known attacker; vary its emission angle.
    const angle = seed * 2.399963229728653
    return { kind: creatureMaterial(target), height: Math.max(0.35, Math.min(1.4, target.height)), seed, source,
      direction: length ? { x: direction.x / length, y: direction.y / length } : { x: Math.cos(angle), y: Math.sin(angle) } }
  }

  private target(scene: Scene, effect: SpellEffect, now: number) {
    const actors = scene.billboards.filter(b => creature(b) && visible(scene, b))
    if (effect.actorId) return actors.find(b => combatActorId(b) === effect.actorId)
    const atCell = actors.filter(b => b.x === effect.x && b.y === effect.y)
    if (atCell.length === 1) return atCell[0]
    // A flash can refer to the cell occupied before this turn's approaching step.
    const moved = actors.filter(b => {
      const history = this.actors.get(combatActorId(b))
      return [history, history?.previous].some(old => old && now - old.at < 0.2 && old.x === effect.x && old.y === effect.y
        && Math.max(Math.abs(b.x - old.x), Math.abs(b.y - old.y)) <= 1)
    })
    return moved.length === 1 ? moved[0] : undefined
  }

  spell(scene: Scene, effect: SpellEffect, now: number, source: ImpactSource = 'confirmed', spray?: HitSpray) {
    const target = this.target(scene, effect, now)
    const previous = target && this.actors.get(combatActorId(target))?.previous
    const art = [...this.shots.values()].filter(shot => (shot.ended === undefined || now - shot.ended < PROJECTILE_EXPOSURE)
      && (shot.billboard.x === effect.x && shot.billboard.y === effect.y
        || previous && now - previous.at < 0.2 && shot.billboard.x === previous.x && shot.billboard.y === previous.y))
      .map(shot => shot.billboard.life?.projectile).filter((a): a is ProjectileAppearance => !!a)
    const material = art.length && art.every(a => a.kind === art[0].kind) ? art[0].kind : undefined
    const kind = effect.kind !== 'physical' || !material ? effect.kind
      : material === 'stone' || material === 'sand' ? 'earth' : material === 'metal' ? 'physical' : material
    const placed = { ...effect, kind, material, turn: effect.turn ?? scene.turn,
      ...(target ? { x: target.x, y: target.y, actorId: combatActorId(target) } : {}) }
    if (!scene.playerOnLevel || !visible(scene, placed) || scene.cells.get(cellKey(placed.x, placed.y))?.occluder) return false
    const utility = (kind: SpellEffect['kind']) => ['heal', 'buff', 'debuff', 'teleport'].includes(kind)
    const contact = source === 'melee' || utility(placed.kind) ? undefined : this.missiles.bind(placed, now)
    const born = Math.max(now, contact?.time() ?? now)
    const existing = this.bursts.find(b => {
      const sameTarget = b.actorId && placed.actorId ? b.actorId === placed.actorId : b.x === placed.x && b.y === placed.y
      const sameResult = b.turn !== undefined && placed.turn !== undefined ? b.turn === placed.turn : Math.abs(now - b.requested) < 0.2
      return sameTarget && sameResult
    })
    const nativeArtwork = !utility(placed.kind) && (this.nativeCovers(scene, effect, now) || this.nativeCovers(scene, placed, now))
    if (existing) {
      existing.nativeArtwork ||= nativeArtwork
      // Explicit results replace colour guesses and generic damage. One owner,
      // one clock: another report cannot start a differently coloured second hit.
      const intensity = impactStrength(placed.intensity) > impactStrength(existing.intensity) ? placed.intensity : existing.intensity
      if (priority[source] > priority[existing.source]
        || source === existing.source && existing.kind === 'physical' && placed.kind !== 'physical') {
        Object.assign(existing, placed, { source })
        if (source === 'melee') { existing.requested = now; existing.born = now; existing.contact = undefined }
      }
      existing.intensity = intensity
      if (spray && (!existing.spray || spray.source === 'melee' && existing.spray.source !== 'melee')) {
        existing.spray = spray
        existing.duration = HIT_SPRAY_DURATION
        if (spray.source === 'melee') {
          existing.born = existing.requested = now
          existing.contact = undefined
        }
      }
      if (contact && !existing.contact && existing.spray?.source !== 'melee') { existing.contact = contact; existing.born = Math.max(existing.requested, contact.time()) }
      return false
    }
    const duration = spray ? HIT_SPRAY_DURATION : utility(placed.kind) || placed.kind === 'drain' ? 0.85 : source === 'melee' ? 0.25 : placed.kind === 'electric' ? 0.5 : 0.4
    this.bursts.push({ ...placed, born, requested: now, contact, duration, source, spray, nativeArtwork })
    this.bursts = this.bursts.slice(-48)
    return true
  }

  bump(scene: Scene, attack: CombatBump, now: number) {
    const playerAttack = attack.fromId ? attack.fromId === 'player'
      : attack.from.x === scene.player.x && attack.from.y === scene.player.y
    if (!playerAttack) return false
    const distance = Math.hypot(attack.to.x - attack.from.x, attack.to.y - attack.from.y)
    if (!scene.playerOnLevel || !visible(scene, attack.from) || !visible(scene, attack.to) || distance < 0.5 || distance > 2.9) return false
    // Multiple reports for a cleave/brand must not stack the same bump.
    if (this.bumps.some(s => s.from.x === attack.from.x && s.from.y === attack.from.y && s.to.x === attack.to.x && s.to.y === attack.to.y && Math.abs(now - s.born) < 0.09)) return false
    this.bumps.push({ ...attack, from: { ...attack.from }, to: { ...attack.to }, born: now, duration: bumpTiming().duration })
    this.bumps = this.bumps.slice(-12)
    if (attack.hit) {
      const effect = { ...attack.to, actorId: attack.toId, kind: attack.tone ?? 'physical', intensity: attack.intensity }
      const target = this.target(scene, effect, now)
      const spray = target ? this.sprayFor(target, { x: attack.to.x - attack.from.x, y: attack.to.y - attack.from.y }, 'melee') : undefined
      this.spell(scene, effect, now + bumpTiming().contact, 'melee', spray)
    }
    return true
  }

  offset(b: Billboard, now: number, bumpStrength = 1, bumpSnap = 1) {
    let x = 0, y = 0
    if (b.lying || b.scenery || b.life?.held || b.kind !== 'monster' && b.kind !== 'player') return { x, y }
    for (const bump of this.bumps) {
      const age = (now - bump.born) / bump.duration
      if (age < 0 || age >= 1) continue
      const dx = bump.to.x - bump.from.x, dy = bump.to.y - bump.from.y, length = Math.hypot(dx, dy)
      const id = combatActorId(b)
      const attacker = bump.fromId ? id === bump.fromId : b.x === bump.from.x && b.y === bump.from.y
      const target = bump.hit && (bump.toId ? id === bump.toId : b.x === bump.to.x && b.y === bump.to.y)
      const pose = bumpPose(now - bump.born, bumpSnap)
      const kick = attacker ? pose.lunge : target ? pose.recoil * (0.6 + impactStrength(bump.intensity) * 0.4) : 0
      x += dx / length * kick * bumpStrength; y += dy / length * kick * bumpStrength
    }
    // Rapid actions never accumulate more than a small fraction of a cell.
    const limit = Math.max(1, Math.hypot(x, y) / 0.44)
    return { x: x / limit, y: y / limit }
  }

  private nativeArea(b: Billboard) {
    return nativeSpellArt(b) && (b.kind !== 'projectile' || this.spawns.stationary(b))
  }

  private nativeCovers(scene: Scene, p: { x: number; y: number }, now: number) {
    return (this.nativeUntil.get(cellKey(p.x, p.y)) ?? -Infinity) > now
      || scene.billboards.some(b => this.nativeArea(b) && b.x === p.x && b.y === p.y)
      || !!scene.cells.get(cellKey(p.x, p.y))?.life?.spawn
  }

  tick(scene: Scene, now: number) {
    this.spawns.tick(scene, now)
    this.missiles.tick(scene, now)
    this.hits.tick(scene, now)
    for (const burst of this.bursts) {
      if (!['heal', 'buff', 'debuff', 'teleport'].includes(burst.kind)) burst.nativeArtwork ||= this.nativeCovers(scene, burst, now)
      if (burst.contact) {
        burst.born = Math.max(burst.requested, burst.contact.time())
        const direction = burst.contact.direction()
        if (direction && burst.spray?.source === 'ranged' && !burst.spray.origin) burst.spray.direction = direction
      }
      const target = burst.actorId && scene.billboards.find(b => creature(b) && combatActorId(b) === burst.actorId)
      if (target) { burst.x = target.x; burst.y = target.y }
    }
    this.bursts = this.bursts.filter(b => now - b.born < b.duration && visible(scene, b))
    this.bumps = this.bumps.filter(s => now - s.born < s.duration && visible(scene, s.from) && visible(scene, s.to))
    this.traces = this.traces.filter(t => now - t.born < t.duration && visible(scene, t.source))
    for (const [key, shot] of this.shots) if (!visible(scene, shot.billboard) || shot.ended !== undefined && now - shot.ended >= PROJECTILE_EXPOSURE) this.shots.delete(key)
    this.traces = this.traces.slice(-48)
    this.bursts = this.bursts.slice(-48)
  }

  /** Rapid later hits replace the visible stamp instead of stacking over it. */
  visibleBursts(now: number) {
    const current = new Map<string, SpellBurst>()
    for (const burst of this.bursts) {
      if (now < burst.born || now - burst.born >= burst.duration || burst.nativeArtwork && !burst.spray && burst.source !== 'melee') continue
      const key = burst.actorId ?? `cell:${burst.x},${burst.y}`
      const previous = current.get(key)
      if (!previous || burst.born >= previous.born) current.set(key, burst)
    }
    return [...current.values()]
  }

  clear() { this.nativeCells.clear(); this.nativeUntil.clear(); this.spawns.clear(); this.hits.clear(); this.bumps = []; this.traces = []; this.bursts = []; this.flashes.clear(); this.spells.clear(); this.shots.clear(); this.missiles.clear(); this.actors.clear(); this.onLevel = false; this.level = undefined }
}
