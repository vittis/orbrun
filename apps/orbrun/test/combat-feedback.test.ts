import { describe, it, expect } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { cellKey, emptyScene, type Billboard } from '@orbrun/scene'
import { CombatFeedback, combatText } from '../src/combat-feedback'

function world(...monsters: Billboard[]) {
  const scene = emptyScene()
  scene.playerOnLevel = true
  scene.billboards = monsters
  for (const b of monsters) scene.cells.set(cellKey(b.x, b.y), {
    x: b.x, y: b.y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 0,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  return scene
}
const goblin = (id = 1, x = 1): Billboard => ({ x, y: 0, tile: 1, height: 0.8, kind: 'monster', name: 'goblin', ref: { id, name: 'goblin' } })
function harness() {
  const state = initialState()
  Object.assign(state.player, { hp: 30, hp_max: 30, xl: 3, place: 'Dungeon', depth: 1 })
  const feedback = new CombatFeedback(state)
  const scene = world(goblin())
  feedback.flush(scene)
  const send = (m: ServerMessage) => { reduce(state, m); feedback.observe(state, m) }
  const text = (s: string, rollback = 0) => send({ msg: 'msgs', rollback, messages: [{ text: s, turn: state.player.turn }] })
  return { state, feedback, scene, send, text }
}

describe('combat sentences', () => {
  it('uses actual damage when supplied and honest hit feedback otherwise', () => {
    expect(combatText('<yellow>You slash the goblin for 23!!</yellow>')[0]).toMatchObject({ kind: 'hit', text: '23', target: 'the goblin', heavy: true })
    expect(combatText('You hit the goblin.')[0]).toMatchObject({ text: 'HIT', heavy: false })
    expect(combatText('You hit the goblin but do no damage.')[0]).toMatchObject({ text: '0', target: 'the goblin' })
    expect(combatText('The bolt of fire hits the goblin for 12!')[0]).toMatchObject({ text: '12', tone: 'fire' })
    expect(combatText('The puff of frost hits the goblin for 5.')[0]).toMatchObject({ text: '5', tone: 'cold' })
    expect(combatText('The bolt hits the goblin!')[0]).toMatchObject({ tone: 'physical' })
  })
  it('distinguishes misses, shield blocks and kills from hits', () => {
    expect(combatText('You barely miss the goblin. The goblin closely misses you. You block the goblin\'s attack. You kill the goblin!').map(p => p.text)).toEqual(['MISS', 'DODGED', 'BLOCKED', 'SLAIN'])
    expect(combatText('The goblin blocks your attack.')[0]).toMatchObject({ text: 'BLOCKED', target: 'The goblin' })
    expect(combatText('The arrow misses the goblin.')[0]).toMatchObject({ kind: 'miss', target: 'the goblin' })
  })
  it('does not mistake prompts, inventory or incoming damage for outgoing attacks', () => {
    expect(combatText('You see here a dagger. You feel sick. You begin to explore. The bolt of fire hits you for 12!')).toEqual([])
  })
})

describe('combat updates', () => {
  it('does not replay combat queued while the first scene and game data load', () => {
    const state = initialState()
    Object.assign(state.player, { hp: 30, hp_max: 30 })
    const feedback = new CombatFeedback(state), scene = world(goblin())
    for (let n = 0; n < 25; n++) {
      const msg = { msg: 'msgs', messages: [{ text: 'You hit the goblin!' }] }
      reduce(state, msg); feedback.observe(state, msg)
      const hp = { msg: 'player', hp: 30 - n }
      reduce(state, hp); feedback.observe(state, hp)
    }
    expect(feedback.flush(scene)).toEqual([])
    const msg = { msg: 'msgs', messages: [{ text: 'You hit the goblin!' }] }
    reduce(state, msg); feedback.observe(state, msg)
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['HIT'])
  })
  it('folds an unknown brand hit into its base hit, retaining actual damage', () => {
    const { feedback, scene, text } = harness()
    text('The bolt hits the goblin for 7! The bolt burns the goblin!')
    expect(feedback.flush(scene)).toMatchObject([{ text: '7', tone: 'fire' }])
    text('You hit the goblin. You freeze the goblin!')
    expect(feedback.flush(scene)).toMatchObject([{ text: 'HIT', tone: 'cold' }])
  })
  it('handles appended message rollbacks without repeating a hit', () => {
    const { feedback, scene, text } = harness()
    text('You hit the goblin for 5.')
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['5'])
    text('You hit the goblin for 5. You miss the goblin.', 1)
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['MISS'])
    text('You hit the goblin for 5. You miss the goblin.', 1)
    expect(feedback.flush(scene)).toEqual([])
    text('You hit the goblin for 5.') // A new attack may have exactly the same wording.
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['5'])
  })
  it('keeps multiple player updates between frames and never doubles incoming damage', () => {
    const { feedback, scene, send, text } = harness()
    send({ msg: 'player', hp: 26 })
    text('The bolt of fire hits you for 4!')
    send({ msg: 'player', hp: 21 })
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['-4', '-5'])
    send({ msg: 'player', hp: 28 })
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['+7 HP'])
    send({ msg: 'player', hp: 29 }) // Don't spam passive regeneration.
    expect(feedback.flush(scene)).toEqual([])
  })
  it('ignores initial history and stat baselines, including spectating mid-combat', () => {
    const state = initialState(), feedback = new CombatFeedback(state), scene = world(goblin())
    for (const msg of [
      { msg: 'player', hp: 20, hp_max: 30, xl: 10 },
      { msg: 'msgs', messages: [{ text: 'You hit the goblin for 9.' }] },
    ]) { reduce(state, msg); feedback.observe(state, msg) }
    expect(feedback.flush(scene)).toEqual([])
    const msg = { msg: 'msgs', messages: [{ text: 'You miss the goblin.' }] }
    reduce(state, msg); feedback.observe(state, msg)
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['MISS'])
  })
  it('reports status transitions once, without retriggering changing poison strength', () => {
    const { feedback, scene, send } = harness()
    send({ msg: 'player', status: [{ light: 'Pois', text: 'poisoned' }] })
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['POISONED'])
    send({ msg: 'player', status: [{ light: 'Pois', text: 'very poisoned' }] })
    expect(feedback.flush(scene)).toEqual([])
    send({ msg: 'player', status: [] })
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['POISON CLEARED'])
    send({ msg: 'player', xl: 4, hp: 35, hp_max: 35 })
    expect(feedback.flush(scene).map(p => p.text)).toEqual(['LEVEL 4'])
  })
  it('uses the last visible location for kills and pairs a kill with its hit', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, 2))
    feedback.flush(scene)
    text('You hit the goblin for 8! You kill the goblin!')
    const next = world(goblin(2, 2))
    expect(feedback.flush(next).map(p => [p.text, p.x])).toEqual([['8', 1], ['SLAIN', 1]])
  })
  it('spreads same-name cleave attacks and ignores unknown or invisible targets', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, 2))
    text('You slash the goblin for 5! You slash the goblin for 7! You hit the invisible orc for 9!')
    expect(feedback.flush(scene).map(p => p.x)).toEqual([1, 2])
  })
  it('discards pending combat on level changes and session resets', () => {
    const { feedback, scene, send, text } = harness()
    text('You hit the goblin for 5.')
    send({ msg: 'player', depth: 2, hp: 20 })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.resets).toBe(1)
    text('You miss the goblin.')
    send({ msg: 'go_lobby' })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.resets).toBe(2)
  })
})
