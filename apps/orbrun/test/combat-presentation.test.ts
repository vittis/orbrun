import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, bumpTiming, type MapRenderer,  } from '@orbrun/scene'
import { deathFor } from '../src/death-effects'
import { combatText } from '../src/combat-feedback'
import { presentCombat } from '../src/combat-presentation'

function harness() {
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (const x of [0, 1, 2]) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 0, flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  const renderer = { bump: vi.fn(), spell: vi.fn(), impact: vi.fn(), hit: vi.fn(), death: vi.fn() } as unknown as MapRenderer
  return { scene, renderer }
}

describe('combat contact timing', () => {
  it('keeps minotaur headbutt damage without drawing another axe, including retaliation', () => {
    const { scene, renderer } = harness()
    const placed = (text: string) => combatText(text).map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1' }))
    presentCombat(renderer, scene, placed('You hit the goblin! You headbutt the goblin!'), [], '+0 war axe', 1000, true)
    expect(renderer.bump).toHaveBeenCalledTimes(1)
    expect(renderer.bump).toHaveBeenCalledWith(expect.objectContaining({ to: { x: 1, y: 0 } }), 1)
    expect(renderer.hit).toHaveBeenCalledTimes(2)
    presentCombat(renderer, scene, placed('You furiously retaliate! You headbutt the goblin!'), [], '+0 war axe', 2000, true)
    expect(renderer.bump).toHaveBeenCalledTimes(1)
    expect(renderer.hit).toHaveBeenCalledTimes(3)
  })
  it.each(['long sword', 'mace', 'battleaxe'])('spawns death VFX immediately for %s and ranged kills, respecting Still mode', weapon => {
    const { scene, renderer } = harness()
    const death = deathFor({ kind: 'monster', id: 1, name: 'jelly', tile: 1, height: 0.8, x: 1, y: 0 }, scene.player)
    const events = combatText('You slash the jelly! You kill the jelly!').map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1', ...(e.kind === 'kill' ? { death } : {}) }))
    presentCombat(renderer, scene, events, [], weapon, 1000, true)
    expect(renderer.bump).toHaveBeenCalledTimes(1)
    expect(renderer.death).toHaveBeenLastCalledWith(death, 1)
    presentCombat(renderer, scene, [events[1]], [], undefined, 2000, true)
    expect(renderer.death).toHaveBeenLastCalledWith(death, 2)
    presentCombat(renderer, scene, events, [], weapon, 3000, false)
    expect(renderer.death).toHaveBeenCalledTimes(2)
  })
  it('aligns the elemental burst and ripple with the body bump', () => {
    const { scene, renderer } = harness()
    const events = combatText('You slash the goblin for 8! You kill the goblin!').map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1' }))
    presentCombat(renderer, scene, events, [{ x: 1, y: 0, kind: 'fire' }], 'long sword', 1000, true)
    const contact = bumpTiming().contact
    expect(renderer.bump).toHaveBeenCalledWith(expect.objectContaining({ fromId: 'player', toId: 'id:1', hit: true }), 1)
    expect(renderer.impact).toHaveBeenCalledWith(1, 0, 0.6, 1 + contact)
    expect(renderer.hit).toHaveBeenCalledWith({ x: 1, y: 0, actorId: 'id:1', turn: undefined }, 1 + contact)
    expect(renderer.spell).toHaveBeenCalledWith({ x: 1, y: 0, kind: 'fire' }, 1 + contact)
  })

  it('keeps incoming HP loss on the player and unrelated spell damage immediate', () => {
    const { scene, renderer } = harness()
    presentCombat(renderer, scene, [
      { kind: 'hurt', amount: 12, player: true },
      { kind: 'hit', x: 2, y: 0, tone: 'magic', intensity: 'solid' },
    ], [], undefined, 1000, true)
    expect(renderer.hit).toHaveBeenCalledWith({ x: 0, y: 0, actorId: 'player', turn: undefined }, 1)
    expect(renderer.bump).not.toHaveBeenCalled()
    expect(renderer.hit).toHaveBeenCalledWith({ x: 2, y: 0, actorId: undefined, turn: undefined }, 1)
  })

  it('shows misses and armor at contact without emitting a damage ripple', () => {
    const { scene, renderer } = harness()
    for (const text of ['You miss the goblin.', 'You hit the goblin but do no damage.']) {
      const events = combatText(text).map(e => ({ ...e, x: 1, y: 0 }))
      presentCombat(renderer, scene, events, [], 'mace', 0, true)
    }
    expect(renderer.bump).toHaveBeenCalledTimes(2)
    expect(renderer.impact).not.toHaveBeenCalled()
    expect(renderer.hit).not.toHaveBeenCalled()
  })

  it('flashes direct spell damage but ignores resisted, utility, zero-damage and Still-mode results', () => {
    const { scene, renderer } = harness()
    for (const text of ['Flames lash the goblin!', 'The goblin convulses!', 'The electricity discharges through the goblin!', 'The goblin shatters!']) {
      const events = combatText(text).map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1' }))
      presentCombat(renderer, scene, events, [], undefined, 1000, true)
    }
    expect(renderer.hit).toHaveBeenCalledTimes(4)
    for (const text of ['The goblin resists.', 'The goblin struggles to resist.', 'The goblin looks drowsy...', 'You heal the goblin.', 'You freeze the goblin but do no damage.']) {
      presentCombat(renderer, scene, combatText(text).map(e => ({ ...e, x: 1, y: 0 })), [], undefined, 1000, true)
    }
    presentCombat(renderer, scene, [{ kind: 'hurt', amount: 4, player: true }], [], undefined, 1000, false)
    expect(renderer.hit).toHaveBeenCalledTimes(4)
  })

  it.each(['still', 'unsupported', 'hidden'] as const)('does not delay feedback without a visible animated bump (%s)', mode => {
    const { scene, renderer } = harness()
    if (mode === 'unsupported') renderer.bump = undefined
    if (mode === 'hidden') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    const events = combatText('You hit the goblin for 8!').map(e => ({ ...e, x: 1, y: 0 }))
    presentCombat(renderer, scene, events, [], 'long sword', 1000, mode !== 'still')
    expect(renderer.impact).toHaveBeenCalledWith(1, 0, 0.6, 1)
  })
})
