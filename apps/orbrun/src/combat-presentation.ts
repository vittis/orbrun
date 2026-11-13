import { cellKey, impactStrength, bumpTiming, type MapRenderer, type Scene, type SpellEffect } from '@orbrun/scene'
import type { CombatEvent } from './combat-feedback'
import { bumpFor } from './bump-effects'

/** Schedule presentation only. State and input are never delayed. */
export function presentCombat(renderer: MapRenderer, scene: Scene, events: CombatEvent[], spells: SpellEffect[], weapon: string | undefined, now: number, animate: boolean): void {
  const deaths = events.filter(e => e.kind === 'kill')
  const killed = (x: number | undefined, y: number | undefined, id?: string) => deaths.some(e =>
    id && e.actorId ? id === e.actorId : x !== undefined && y !== undefined && e.x === x && e.y === y)
  // Establish death ownership before a bump can schedule its contact spray.
  // A kill is confirmed by the server; never predict it from damage or wounds.
  if (animate) for (const event of deaths) if (event.death) renderer.death?.(event.death, now / 1000)
  const attacks = events.flatMap(e => {
    const attack = bumpFor(e, scene, weapon)
    return attack ? [attack] : []
  })
  const visible = (p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
  const scheduled = animate && renderer.bump ? attacks.filter(a => scene.playerOnLevel && visible(a.from) && visible(a.to)) : []
  for (const attack of scheduled) renderer.bump!(attack, now / 1000)
  const delayFor = (x: number | undefined, y: number | undefined, id?: string) => Math.max(0, ...scheduled
    .filter(a => id && a.toId ? id === a.toId : a.to.x === x && a.to.y === y)
    .map(() => bumpTiming().contact * 1000))
  for (const event of events) {
    const x = event.player ? scene.player.x : event.x, y = event.player ? scene.player.y : event.y
    const delay = delayFor(x, y, event.player ? 'player' : event.actorId)
    if (killed(x, y, event.player ? 'player' : event.actorId)) continue
    if (animate && (event.kind === 'hit' || event.kind === 'hurt') && event.amount !== 0 && x !== undefined && y !== undefined) {
      renderer.hit?.({ x, y, actorId: event.player ? 'player' : event.actorId, turn: event.turn }, (now + delay) / 1000)
    }
    if ((event.kind === 'hit' || event.kind === 'hurt') && event.amount !== 0 && x !== undefined && y !== undefined) {
      renderer.impact?.(x, y, impactStrength(event.intensity), (now + delay) / 1000)
    }
  }
  for (const spell of spells) if (!killed(spell.x, spell.y, spell.actorId)) renderer.spell?.(spell, (now + delayFor(spell.x, spell.y)) / 1000)
}
