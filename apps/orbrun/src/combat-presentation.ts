import { cellKey, impactStrength, meleeTiming, type MapRenderer, type MeleeAttack, type Scene, type SpellEffect } from '@orbrun/scene'
import type { CombatPopup } from './combat-feedback'
import { meleeFor } from './melee-effects'

/** Schedule presentation only. State and input are never delayed. */
export function presentCombat(renderer: MapRenderer, scene: Scene, events: CombatPopup[], incoming: MeleeAttack[], spells: SpellEffect[], weapon: string | undefined, now: number, animate: boolean): CombatPopup[] {
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
  const popups = events.map(event => {
    const x = event.player ? scene.player.x : event.x, y = event.player ? scene.player.y : event.y
    const contactResult = event.kind === 'hit' || event.kind === 'hurt' || event.kind === 'miss' || event.kind === 'block' || event.kind === 'kill'
    const delay = contactResult ? delayFor(x, y, event.player ? 'player' : event.actorId) : 0
    if (animate && event.kind === 'kill' && event.death) renderer.death?.(event.death, (now + delay) / 1000)
    if ((event.kind === 'hit' || event.kind === 'hurt' || event.kind === 'level') && event.amount !== 0 && x !== undefined && y !== undefined) {
      renderer.impact?.(x, y, event.kind === 'level' ? 1 : impactStrength(event.intensity), (now + delay) / 1000)
    }
    return delay ? { ...event, delay } : event
  })
  for (const spell of spells) renderer.spell?.(spell, (now + delayFor(spell.x, spell.y)) / 1000)
  return popups
}
