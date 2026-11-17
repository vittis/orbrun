import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, bumpTiming, type MapRenderer,  } from '@orbrun/scene'
import { deathFor } from '../src/death-effects'
import { CombatFeedback, combatText } from '../src/combat-feedback'
import { initialState, reduce } from '@orbrun/webtiles'
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
  it.each(['hit', 'miss', 'block', 'no-damage'])('bumps all four surrounding attackers with identical hobgoblins (%s)', outcome => {
    const { scene, renderer } = harness()
    scene.billboards = [
      { id: 1, name: 'orc', x: 0, y: -1, kind: 'monster', tile: 1, height: 1 },
      { id: 2, name: 'goblin', x: -1, y: 0, kind: 'monster', tile: 1, height: 1 },
      { id: 3, name: 'hobgoblin', x: -1, y: -1, kind: 'monster', tile: 1, height: 1 },
      { id: 4, name: 'hobgoblin', x: 1, y: -1, kind: 'monster', tile: 1, height: 1 },
      { id: 5, name: 'hobgoblin', x: 3, y: 0, kind: 'monster', tile: 1, height: 1 },
      { id: 6, name: 'hobgoblin', x: 1, y: 0, kind: 'monster', tile: 1, height: 1 },
    ]
    for (const b of scene.billboards) scene.cells.set(cellKey(b.x, b.y), {
      ...scene.cells.get(cellKey(0, 0))!, x: b.x, y: b.y, visibility: b.id === 6 ? 'remembered' : 'visible',
    })
    const state = initialState()
    state.player.hp_max = 30
    const feedback = new CombatFeedback(state)
    feedback.flush(scene)
    const sentences = {
      hit: 'The hobgoblin hits you!', miss: 'The hobgoblin misses you.',
      block: "You block the hobgoblin's attack.", 'no-damage': 'The hobgoblin hits you but does no damage.',
    }
    const msg = { msg: 'msgs', messages: [{ text: `The orc hits you! The goblin hits you! ${sentences[outcome]} ${sentences[outcome]}`, turn: 101 }] }
    reduce(state, msg); feedback.observe(state, msg)
    const events = feedback.flush(scene)
    expect(events).toHaveLength(4)
    const spells = feedback.takeSpells()
    presentCombat(renderer, scene, events, spells, 'shortbow', 1000, true)
    expect(renderer.bump).toHaveBeenCalledTimes(4)
    expect(vi.mocked(renderer.bump!).mock.calls.map(([b]) => b.fromId)).toEqual(['id:1', 'id:2', 'id:3', 'id:4'])
    expect(renderer.hit).toHaveBeenCalledTimes(outcome === 'hit' ? 4 : 2)
    expect(renderer.impact).toHaveBeenCalledTimes(outcome === 'hit' ? 4 : 2)
    expect(renderer.spell).not.toHaveBeenCalled()
    presentCombat(renderer, scene, events, spells, 'shortbow', 2000, false)
    expect(renderer.bump).toHaveBeenCalledTimes(4)
  })

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
    expect(renderer.hit).not.toHaveBeenCalled()
    expect(renderer.impact).not.toHaveBeenCalled()
    expect(vi.mocked(renderer.death!).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(renderer.bump!).mock.invocationCallOrder[0])
    presentCombat(renderer, scene, [events[1]], [], undefined, 2000, true)
    expect(renderer.death).toHaveBeenLastCalledWith(death, 2)
    presentCombat(renderer, scene, events, [], weapon, 3000, false)
    expect(renderer.death).toHaveBeenCalledTimes(2)
  })
  it('suppresses lethal hit and spell bursts while preserving another actor at the same cell', () => {
    const { scene, renderer } = harness()
    const death = deathFor({ kind: 'monster', id: 1, name: 'goblin', tile: 1, height: 0.8, x: 1, y: 0 }, scene.player)
    presentCombat(renderer, scene, [
      { kind: 'hit', x: 1, y: 0, actorId: 'id:1', amount: 12 },
      { kind: 'kill', x: 1, y: 0, actorId: 'id:1', death },
      { kind: 'hit', x: 1, y: 0, actorId: 'id:2', amount: 5 },
    ], [{ x: 1, y: 0, actorId: 'id:1', kind: 'fire' }, { x: 2, y: 0, kind: 'cold' }], undefined, 1000, true)
    expect(renderer.hit).toHaveBeenCalledTimes(1)
    expect(renderer.hit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'id:2' }), 1)
    expect(renderer.impact).toHaveBeenCalledTimes(1)
    expect(renderer.spell).toHaveBeenCalledExactlyOnceWith({ x: 2, y: 0, kind: 'cold' }, 1)
    expect(renderer.death).toHaveBeenCalledExactlyOnceWith(death, 1)
  })

  it.each([0.5, 1, 2])('aligns elemental burst, flash and ripple with the body bump at %sx speed', speed => {
    const { scene, renderer } = harness()
    const events = combatText('You slash the goblin for 8!').map(e => ({ ...e, x: 1, y: 0, actorId: 'id:1' }))
    presentCombat(renderer, scene, events, [{ x: 1, y: 0, kind: 'fire' }], 'long sword', 1000, true, speed)
    const contact = 0.055 / speed
    expect(renderer.bump).toHaveBeenCalledWith(expect.objectContaining({ fromId: 'player', toId: 'id:1', hit: true, speed }), 1)
    expect(renderer.impact).toHaveBeenCalledWith(1, 0, 0.6, 1 + contact)
    expect(renderer.hit).toHaveBeenCalledWith({ x: 1, y: 0, actorId: 'id:1', turn: undefined, tone: 'physical', intensity: 'solid' }, 1 + contact)
    expect(renderer.spell).toHaveBeenCalledWith({ x: 1, y: 0, kind: 'fire' }, 1 + contact)
  })

  it('keeps incoming HP loss on the player and unrelated spell damage immediate', () => {
    const { scene, renderer } = harness()
    presentCombat(renderer, scene, [
      { kind: 'hurt', amount: 12, player: true },
      { kind: 'hit', x: 2, y: 0, tone: 'magic', intensity: 'solid' },
    ], [], undefined, 1000, true)
    expect(renderer.hit).toHaveBeenCalledWith({ x: 0, y: 0, actorId: 'player', turn: undefined, tone: undefined, intensity: undefined }, 1)
    expect(renderer.bump).not.toHaveBeenCalled()
    expect(renderer.hit).toHaveBeenCalledWith({ x: 2, y: 0, actorId: undefined, turn: undefined, tone: 'magic', intensity: 'solid' }, 1)
  })

  it('keeps misses and zero-damage bumps without impact VFX', () => {
    const { scene, renderer } = harness()
    for (const text of ['You miss the goblin.', 'You hit the goblin but do no damage.']) {
      const events = combatText(text).map(e => ({ ...e, x: 1, y: 0 }))
      presentCombat(renderer, scene, events, [], 'mace', 0, true)
    }
    expect(renderer.bump).toHaveBeenCalledTimes(2)
    expect(renderer.impact).not.toHaveBeenCalled()
    expect(renderer.hit).not.toHaveBeenCalled()
  })

  it.each([0.5, 2])('animates blocked melee at %sx without impact VFX', speed => {
    const { scene, renderer } = harness()
    scene.billboards = [{ x: 1, y: 0, id: 1, name: 'goblin', kind: 'monster', tile: 1, height: 1 }]
    const state = initialState()
    state.player.hp_max = 30
    const feedback = new CombatFeedback(state)
    feedback.flush(scene)
    const msg = { msg: 'msgs', messages: [{ text: "You block the goblin's attack. The goblin blocks your attack." }] }
    reduce(state, msg); feedback.observe(state, msg)
    const events = feedback.flush(scene)
    const spells = feedback.takeSpells()
    presentCombat(renderer, scene, events, spells, 'mace', 1000, true, speed)
    expect(renderer.bump).toHaveBeenCalledTimes(2)
    expect(renderer.bump).toHaveBeenCalledWith(expect.objectContaining({ fromId: 'id:1', toId: 'player', hit: false, speed }), 1)
    expect(renderer.bump).toHaveBeenCalledWith(expect.objectContaining({ fromId: 'player', toId: 'id:1', hit: false, speed }), 1)
    expect(renderer.hit).not.toHaveBeenCalled()
    expect(renderer.impact).not.toHaveBeenCalled()
    expect(renderer.spell).not.toHaveBeenCalled()
    presentCombat(renderer, scene, events, spells, 'mace', 2000, false, speed)
    expect(renderer.bump).toHaveBeenCalledTimes(2)
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


it('keeps reciprocal player, enemy and ally hits on the same contact clock', () => {
  const { scene, renderer } = harness()
  scene.billboards = [
    { x: 1, y: 0, id: 1, name: 'goblin', kind: 'monster', tile: 1, height: 1 },
    { x: 2, y: 0, id: 2, name: 'orc', attitude: 'friendly', kind: 'monster', tile: 1, height: 1 },
  ]
  const state = initialState()
  state.player.hp_max = 30
  const feedback = new CombatFeedback(state)
  feedback.flush(scene)
  const msg = { msg: 'msgs', messages: [{ text: 'You hit the goblin! The goblin hits you! Your orc hits the goblin! The goblin hits your orc!' }] }
  reduce(state, msg); feedback.observe(state, msg)
  presentCombat(renderer, scene, feedback.flush(scene), feedback.takeSpells(), 'mace', 1000, true)
  expect(renderer.bump).toHaveBeenCalledTimes(4)
  for (const id of ['player', 'id:1', 'id:2']) {
    expect(renderer.hit).toHaveBeenCalledWith(expect.objectContaining({ actorId: id }), 1 + bumpTiming().contact)
  }
})
