import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, meleeTiming, type MapRenderer, type MeleeAttack } from '@orbrun/scene'
import { deathFor } from '../src/death-effects'
import { combatText } from '../src/combat-feedback'
import { presentCombat } from '../src/combat-presentation'

function harness() {
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (const x of [0, 1, 2]) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 0, flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  const renderer = { melee: vi.fn(), spell: vi.fn(), impact: vi.fn(), death: vi.fn() } as unknown as MapRenderer
  return { scene, renderer }
}

describe('combat contact timing', () => {
  it('spawns death VFX at melee contact and immediately for ranged kills, respecting Still mode', () => {
    const { scene, renderer } = harness()
    const death = deathFor({ kind: 'monster', id: 1, name: 'jelly', tile: 1, height: 0.8, x: 1, y: 0 }, scene.player)
    const events = combatText('You slash the jelly! You kill the jelly!').map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1', ...(e.kind === 'kill' ? { death } : {}) }))
    presentCombat(renderer, scene, events, [], [], 'long sword', 1000, true)
    expect(renderer.death).toHaveBeenLastCalledWith(death, 1 + meleeTiming('slash').contact)
    presentCombat(renderer, scene, [events[1]], [], [], undefined, 2000, true)
    expect(renderer.death).toHaveBeenLastCalledWith(death, 2)
    presentCombat(renderer, scene, events, [], [], 'long sword', 3000, false)
    expect(renderer.death).toHaveBeenCalledTimes(2)
  })
  it('aligns the confirmed number, elemental burst and ripple with the outgoing stroke', () => {
    const { scene, renderer } = harness()
    const events = combatText('You slash the goblin for 8! You kill the goblin!').map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1' }))
    const timed = presentCombat(renderer, scene, events, [], [{ x: 1, y: 0, kind: 'fire' }], 'long sword', 1000, true)
    const contact = meleeTiming('slash').contact
    expect(renderer.melee).toHaveBeenCalledWith(expect.objectContaining({ fromId: 'player', toId: 'id:1', hit: true }), 1)
    expect(timed.map(e => e.delay)).toEqual([contact * 1000, contact * 1000])
    expect(timed[0].amount).toBe(8)
    expect(renderer.impact).toHaveBeenCalledWith(1, 0, 0.6, 1 + contact)
    expect(renderer.spell).toHaveBeenCalledWith({ x: 1, y: 0, kind: 'fire' }, 1 + contact)
  })

  it('keeps incoming HP loss on the player and unrelated spell damage immediate', () => {
    const { scene, renderer } = harness()
    const attack: MeleeAttack = { from: { x: 1, y: 0 }, to: scene.player, fromId: 'id:1', toId: 'player', style: 'crush', hit: true }
    const timed = presentCombat(renderer, scene, [
      { kind: 'hurt', text: '-12', amount: 12, player: true },
      { kind: 'hit', text: 'HIT', x: 2, y: 0, tone: 'magic', intensity: 'solid' },
      { kind: 'heal', text: '+7 HP', player: true },
    ], [attack], [], undefined, 1000, true)
    expect(timed[0]).toMatchObject({ text: '-12', player: true, delay: meleeTiming('crush').contact * 1000 })
    expect(timed[1].delay).toBeUndefined()
    expect(timed[1].amount).toBeUndefined()
    expect(timed[2].delay).toBeUndefined()
  })

  it('shows misses and armor at contact without emitting a damage ripple', () => {
    const { scene, renderer } = harness()
    for (const text of ['You miss the goblin.', 'You hit the goblin but do no damage.']) {
      const events = combatText(text).map(e => ({ ...e, x: 1, y: 0 }))
      expect(presentCombat(renderer, scene, events, [], [], 'mace', 0, true)[0].delay).toBeGreaterThan(0)
    }
    expect(renderer.melee).toHaveBeenCalledTimes(2)
    expect(renderer.impact).not.toHaveBeenCalled()
  })

  it.each(['still', 'unsupported', 'hidden'] as const)('does not delay feedback without a visible animated stroke (%s)', mode => {
    const { scene, renderer } = harness()
    if (mode === 'unsupported') renderer.melee = undefined
    if (mode === 'hidden') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    const events = combatText('You hit the goblin for 8!').map(e => ({ ...e, x: 1, y: 0 }))
    const [event] = presentCombat(renderer, scene, events, [], [], 'long sword', 1000, mode !== 'still')
    expect(event.delay).toBeUndefined()
  })
})
