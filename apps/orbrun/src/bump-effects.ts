import { type CombatBump, type Scene } from '@orbrun/scene'
import type { CombatEvent } from './combat-feedback'

/** Confirmed player contact drives body motion and the ordinary hit splash. */
export function bumpFor(event: CombatEvent, scene: Scene, weapon: string | undefined): CombatBump | null {
  if (!event.melee || event.brandOnly || event.player || event.x === undefined || event.y === undefined) return null
  // Auxiliary damage keeps its normal feedback without a second weapon bump.
  if (event.auxiliary && weapon) return null
  if (/\b(?:bow|longbow|shortbow|crossbow|arbalest|sling|hand cannon)\b/i.test(weapon ?? '')) return null
  const distance = Math.max(Math.abs(event.x - scene.player.x), Math.abs(event.y - scene.player.y))
  const reaching = /\b(?:spear|trident|halberd|glaive|bardiche|scythe|lance)\b/i.test(weapon ?? '')
  if (distance < 1 || distance > (reaching ? 2 : 1)) return null
  return { from: { ...scene.player }, to: { x: event.x, y: event.y }, hit: event.kind === 'hit' && event.amount !== 0,
    fromId: 'player', toId: event.actorId, tone: event.tone, intensity: event.intensity }
}
