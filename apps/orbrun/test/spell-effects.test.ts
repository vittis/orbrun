import { describe, expect, it } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { cellKey, emptyScene, type Scene, type SpellEffect } from '@orbrun/scene'
import { CombatFeedback } from '../src/combat-feedback'
import { spellText } from '../src/spell-effects'

function world(alive = true): Scene {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let x = 0; x < 3; x++) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', floorTile: 0, occluder: false,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  if (alive) scene.billboards.push({ id: 1, kind: 'monster', name: 'goblin', x: 1, y: 0, tile: 1, height: 1 })
  return scene
}
function harness() {
  const state = initialState(), scene = world()
  Object.assign(state.player, { hp: 30, hp_max: 30, place: 'Dungeon', depth: 1 })
  const feedback = new CombatFeedback(state)
  feedback.flush(scene)
  const send = (msg: ServerMessage) => { reduce(state, msg); feedback.observe(state, msg) }
  const text = (text: string, rollback = 0) => send({ msg: 'msgs', messages: [{ text, turn: state.player.turn }], rollback })
  return { state, scene, feedback, send, text }
}

describe('confirmed non-projectile spells and abilities', () => {
  it.each<[string, SpellEffect['kind']]>([
    ['You freeze the goblin.', 'cold'],
    ['You freeze the goblin but do no damage.', 'cold'],
    ['You freeze the goblin! You kill the goblin!', 'cold'],
    ['The open air twists around violently and strikes the goblin but does no damage.', 'air'],
    ['The confined air twists around weakly and strikes the goblin!', 'air'],
    ['Flames lash the goblin.', 'fire'],
    ['You draw life force from the goblin!', 'drain'],
    ['You drain the goblin!', 'drain'],
    ['You smite the goblin!', 'holy'],
    ['The goblin convulses!', 'drain'],
    ['The goblin is struck by an electric surge!', 'electric'],
    ['The electricity discharges through the goblin!!', 'electric'],
    ['The goblin is blasted with magical radiation!', 'magic'],
    ['The goblin seems to burn from within!', 'fire'],
    ['The goblin shatters!', 'earth'],
    ['The goblin looks drowsy...', 'debuff'],
    ['The goblin resists.', 'magic'],
  ])('places %s on the visible target (%s)', (line, kind) => {
    const h = harness()
    h.text(line); h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual([{ x: 1, y: 0, kind }])
    expect(h.feedback.takeMelee()).toEqual([])
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('keeps a killing Freeze at the last visible position and does not replay appended messages', () => {
    const h = harness()
    h.text('You freeze the goblin! You kill the goblin!')
    h.feedback.flush(world(false))
    expect(h.feedback.takeSpells()).toEqual([{ x: 1, y: 0, kind: 'cold' }])
    h.text('You freeze the goblin! You kill the goblin! You feel stronger.', 1)
    h.feedback.flush(world(false))
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('resolves moving targets by stable identity and refuses unseen ones', () => {
    const h = harness(), moved = world()
    moved.billboards[0].x = 2
    h.text('Flames lash the goblin.')
    h.feedback.flush(moved)
    expect(h.feedback.takeSpells()).toEqual([{ x: 2, y: 0, kind: 'fire' }])
    h.feedback.flush(world(false))
    const hidden = world()
    hidden.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    h.text('You draw life force from the goblin!')
    h.feedback.flush(hidden)
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('presents confirmed self effects and status changes without requiring damage', () => {
    const h = harness()
    h.text('You blink. You begin to radiate toxic energy. You feel better.')
    h.send({ msg: 'player', status: [{ light: 'Fast', text: 'hasted' }] })
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual(expect.arrayContaining([
      { x: 0, y: 0, kind: 'teleport' }, { x: 0, y: 0, kind: 'poison' },
      { x: 0, y: 0, kind: 'heal' }, { x: 0, y: 0, kind: 'buff' },
    ]))
  })

  it('covers armour, regeneration, transformations and summons without repeating status countdowns', () => {
    const h = harness()
    h.text('A film of ice covers your body! You call forth a mighty ally!')
    h.send({ msg: 'player', status: [{ light: 'Regen', text: 'regenerating (8 turns)' }, { light: 'Dragon form', text: 'dragon form' }] })
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual(expect.arrayContaining([
      { x: 0, y: 0, kind: 'cold' }, { x: 0, y: 0, kind: 'magic' }, { x: 0, y: 0, kind: 'buff' },
    ]))
    h.send({ msg: 'player', status: [{ light: 'Regen', text: 'regenerating (7 turns)' }, { light: 'Dragon form', text: 'dragon form' }] })
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it.each<[string, SpellEffect['kind']]>([
    ['The endoplasm freezes you. You are frozen.', 'cold'],
    ['The air twists around and strikes you!', 'air'],
    ['Something smites you!', 'holy'],
    ['Pain shoots through your body!', 'drain'],
    ['You are struck by an electric surge!', 'electric'],
    ['Your mind is blasted!', 'magic'],
  ])('also presents incoming abilities: %s', (line, kind) => {
    const h = harness()
    h.text(line); h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual(expect.arrayContaining([{ x: 0, y: 0, kind }]))
  })

  it('ignores cancelled casts, failures, prompts, weapon brands and old logs', () => {
    expect(spellText('Casting: Freeze. Aiming: Airstrike. You miscast Freeze. Nothing happens. Okay, then. You cannot blink.')).toEqual([])
    const h = harness()
    h.text('You hit the goblin. You freeze the goblin.')
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual([])
    h.send({ msg: 'game_client' })
    h.text('You freeze the goblin!')
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('discards pending effects on level changes and remote maps', () => {
    for (const reset of ['level', 'remote']) {
      const h = harness()
      h.text('Flames lash the goblin.')
      if (reset === 'level') h.send({ msg: 'player', depth: 2 })
      h.feedback.flush(reset === 'remote' ? { ...h.scene, playerOnLevel: false } : h.scene)
      expect(h.feedback.takeSpells()).toEqual([])
    }
  })
})
