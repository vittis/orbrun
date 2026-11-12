import { combatActorId, creatureMaterial, type Billboard, type DeathEffect } from '@orbrun/scene'

/** Prefer material-specific names to generic idle motion (a floating skull is bone). */
export function deathFor(b: Billboard, from: { x: number; y: number }): DeathEffect {
  const kind = creatureMaterial(b)
  const dx = b.x - from.x, dy = b.y - from.y, length = Math.hypot(dx, dy) || 1
  return { actorId: combatActorId(b), x: b.x, y: b.y, height: Math.max(0.35, Math.min(1.4, b.height)), kind, direction: { x: dx / length, y: dy / length } }
}

