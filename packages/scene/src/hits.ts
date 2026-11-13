import { cellKey } from './coordinates.js'
import { combatActorId } from './combat.js'
import type { Billboard, Scene } from './index.js'

export interface HitEffect { x: number; y: number; actorId?: string; turn?: number }
interface Hit { actorId: string; turn?: number; requested: number; contact?: () => number }
const DURATION = 0.16
const creature = (b: Billboard) => b.kind === 'player' || b.kind === 'monster' && !b.scenery

/** A single subtle brightness pulse, attached to the damaged body. */
export class HitEffects {
  private hits: Hit[] = []
  private level: string | undefined
  get active() { return this.hits.length > 0 }

  observe(scene: Scene, animate: boolean) {
    if (!animate || !scene.playerOnLevel || scene.levelKey !== this.level) this.clear()
    this.level = scene.levelKey
  }

  spawn(scene: Scene, effect: HitEffect, now: number, contact?: () => number) {
    if (!scene.playerOnLevel) return false
    const targets = scene.billboards.filter(b => creature(b)
      && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible'
      && (effect.actorId ? combatActorId(b) === effect.actorId : b.x === effect.x && b.y === effect.y))
    if (targets.length !== 1) return false
    const actorId = combatActorId(targets[0])
    if (this.hits.some(h => h.actorId === actorId && (h.turn !== undefined && effect.turn !== undefined
      ? h.turn === effect.turn : Math.abs(h.requested - now) < 0.09))) return false
    this.hits.push({ actorId, turn: effect.turn, requested: now, contact })
    this.hits = this.hits.slice(-48)
    return true
  }

  tick(scene: Scene, now: number) {
    const visible = new Set(scene.billboards.filter(b => creature(b)
      && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible').map(combatActorId))
    this.hits = this.hits.filter(h => visible.has(h.actorId) && now - this.born(h) < DURATION)
  }

  brightness(actorId: string, now: number) {
    let pulse = 0
    for (const hit of this.hits) {
      if (hit.actorId !== actorId) continue
      const age = now - this.born(hit)
      if (age < 0 || age >= DURATION) continue
      // Quick onset and a soft recovery; overlapping hits never add brightness.
      pulse = Math.max(pulse, Math.min(age / 0.016, (1 - age / DURATION) ** 2))
    }
    return 1 + pulse * 0.55
  }

  private born(hit: Hit) { return Math.max(hit.requested, hit.contact?.() ?? hit.requested) }
  remove(actorId: string) { this.hits = this.hits.filter(h => h.actorId !== actorId) }
  clear() { this.hits = []; this.level = undefined }
}
