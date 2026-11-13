import { cellKey, impactStrength, meleeTiming, type MapRenderer, type MeleeAttack, type Scene, type SpellEffect } from '@orbrun/scene'
import type { CombatEvent } from './combat-feedback'
import { meleeFor } from './melee-effects'

/** Schedule presentation only. State and input are never delayed. */
export function presentCombat(renderer: MapRenderer, scene: Scene, events: CombatEvent[], incoming: MeleeAttack[], spells: SpellEffect[], weapon: string | undefined, now: number, animate: boolean): void {
  const attacks = [...incoming, ...events.flatMap(e => {
    const attack = meleeFor(e, scene, weapon)
    return attack ? [attack] : []
  })]
  const visible = (p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
  const scheduled = animate && renderer.melee ? attacks.filter(a => scene.playerOnLevel && visible(a.from) && visible(a.to)) : []
  for (const attack of scheduled) renderer.melee!(attack, now / 1000)
  const delayFor = (x: number | undefined, y: number | undefined, id?: string) => Math.max(0, ...scheduled
    .filter(a => id && a.toId ? id === a.toId : a.to.x === x && a.to.y === y)
    .map(a => meleeTiming(a.style).contact * 1000))
  for (const event of events) {
    const x = event.player ? scene.player.x : event.x, y = event.player ? scene.player.y : event.y
    const delay = delayFor(x, y, event.player ? 'player' : event.actorId)
    // The server has already removed the body: replace it on this frame.
    if (animate && event.kind === 'kill' && event.death) renderer.death?.(event.death, now / 1000)
    if (animate && (event.kind === 'hit' || event.kind === 'hurt') && event.amount !== 0 && x !== undefined && y !== undefined) {
      renderer.hit?.({ x, y, actorId: event.player ? 'player' : event.actorId, turn: event.turn }, (now + delay) / 1000)
    }
    if ((event.kind === 'hit' || event.kind === 'hurt') && event.amount !== 0 && x !== undefined && y !== undefined) {
      renderer.impact?.(x, y, impactStrength(event.intensity), (now + delay) / 1000)
    }
  }
  for (const spell of spells) renderer.spell?.(spell, (now + delayFor(spell.x, spell.y)) / 1000)
}
