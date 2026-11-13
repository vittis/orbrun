import { describe, it, expect } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { cellKey, emptyScene, type Billboard } from '@orbrun/scene'
import { bumpFor } from '../src/bump-effects'
import { CombatFeedback, combatText } from '../src/combat-feedback'
import { readFileSync } from 'node:fs'

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
  it.each(['.', '!', '!!'])('keeps ordinary melee target identity with %s punctuation', punctuation => {
    expect(combatText(`You slash the goblin${punctuation}`)).toMatchObject([
      { kind: 'hit', target: 'the goblin', melee: true },
    ])
  })
  // mon-death.cc uses passive wording for indirect kills and omits articles
  // for unique monsters. None of these sentences reports an HP amount.
  it.each([
    ['The goblin is killed!', 'The goblin'],
    ['Sigmund is killed!', 'Sigmund'],
    ['Sigmund dies!', 'Sigmund'],
    ['Your orc is destroyed!', 'Your orc'],
    ['The orc zombie crumbles into dust!', 'The orc zombie'],
    ['You blow up the goblin!', 'the goblin'],
  ])('recognizes the confirmed death sentence: %s', (text, target) => {
    expect(combatText(text)).toMatchObject([{ kind: 'kill', target }])
    expect(combatText(text)[0].amount).toBeUndefined()
  })

  it.each([
    'The ice thorns skewer the goblin.',
    '<lightblue>The ice thorns skewer the goblin!<lightgrey>',
    'Your ice thorns skewer the goblin!!',
  ])('recognizes trunk Ice Thorns damage: %s', text => {
    const [hit] = combatText(text)
    expect(hit).toMatchObject({ kind: 'hit', target: 'the goblin', tone: 'cold', })
    expect(hit.intensity).toBeDefined()
    expect(hit.amount).toBeUndefined()
  })

  it.each([
    'The ice thorns skewer the goblin but do no damage.',
    'The wall freezes the goblin but does no damage.',
    'You hit the goblin but do no damage.',
    'The ice thorns skewer the goblin for 0 damage.',
  ])('retains an explicit zero without estimating damage: %s', text => {
    expect(combatText(text)).toMatchObject([{ kind: 'hit', target: 'the goblin', amount: 0 }])
    expect(combatText(text)[0].amount).toBe(0)
  })

  it.each([
    'The ice thorns skewer you but do no damage.',
    'The goblin hits you with a +0 club but does no damage.',
    'The goblin bites you but does no damage.',
  ])('does not create outgoing damage from an incoming no-damage sentence: %s', text => {
    expect(combatText(text).every(e => e.kind === 'hurt' && e.player && e.amount === 0)).toBe(true)
  })

  it('keeps patched-server exact Ice Thorns damage exact and ignores crumbling terrain', () => {
    expect(combatText('The ice thorns skewer the goblin for 7 damage!')).toMatchObject([{ kind: 'hit', amount: 7, tone: 'cold' }])
    expect(combatText('Your icy thorns crumble before you. The icy thorns crumble before the goblin.')).toEqual([])
  })

  it.each([
    'You perforate the hornet like a sieve!!!',
    'You skewer the hornet like a kebab!!!',
    'You stick the hornet like a pincushion!!!',
    'You spit the hornet like a pig!!!',
    'You cut the hornet into ribbons!!!',
    'You flatten the hornet like a pancake!!!',
    'You thrash the hornet mercilessly!!!',
    'You tentacle-slap the hornet!',
    'You clumsily bash the hornet.',
  ])('recognizes native weapon/unarmed wording: %s', text => {
    expect(combatText(text)).toMatchObject([{ kind: 'hit', target: 'the hornet', }])
  })
  it('keeps electric and acid damage distinct from magic and poison', () => {
    expect(combatText('You electrocute the goblin for 7 damage.')[0]?.tone).toBe('electric')
    expect(combatText('You burn the goblin with acid for 7 damage.')[0]?.tone).toBe('acid')
    expect(combatText('The bolt hits the goblin with acid for 7 damage.')[0]?.tone).toBe('acid')
  })
  it('uses actual damage when supplied and honest hit feedback otherwise', () => {
    expect(combatText('<yellow>You slash the goblin for 23!!</yellow>')[0]).toMatchObject({ kind: 'hit', amount: 23, target: 'the goblin' })
    expect(combatText('You hit the goblin.')[0]).toMatchObject({ kind: 'hit', amount: undefined, intensity: 'light' })
    expect(combatText('You hit the goblin but do no damage.')[0]).toMatchObject({ amount: 0, target: 'the goblin' })
    expect(combatText('The bolt of fire hits the goblin for 12!')[0]).toMatchObject({ amount: 12, tone: 'fire' })
    expect(combatText('The puff of frost hits the goblin for 5.')[0]).toMatchObject({ amount: 5, tone: 'cold' })
    expect(combatText('The bolt hits the goblin!')[0]).toMatchObject({ tone: 'physical' })
  })
  it('distinguishes misses, shield blocks and kills from hits', () => {
    expect(combatText('You barely miss the goblin. The goblin closely misses you. You block the goblin\'s attack. You kill the goblin!').map(p => p.kind)).toEqual(['miss', 'miss', 'block', 'kill'])
    expect(combatText('The goblin blocks your attack.')).toMatchObject([{ kind: 'block', melee: true, target: 'The goblin' }])
    expect(combatText('The arrow misses the goblin.')).toEqual([])
  })
  it('distinguishes incoming damage from prompts and inventory', () => {
    expect(combatText('You see here a dagger. You feel sick. You begin to explore. The bolt of fire hits you for 12!')).toMatchObject([{ kind: 'hurt', player: true, amount: 12, tone: 'fire' }])
  })

  it.each([
    'The goblin hits you with a +0 club.',
    'The black mamba bites you!',
    'Something hits you.',
    'Sigmund hits you with a +0 scythe!',
    'The ice thorns skewer you!',
    'The fireball engulfs you!',
    'You are engulfed in blazing flames.',
    'You are smitten!',
    'Pain shoots through your body!',
    'The air twists around and strikes you!',
  ])('uses confirmed incoming damage for the player hit effect: %s', text => {
    expect(combatText(text)).toMatchObject([{ kind: 'hurt', player: true, amount: undefined }])
  })

  it.each([
    'You block the arrow.',
    'The bolt of fire hits you for 0 damage.',
    'Casting: Magic Dart (safe; 1% risk of failure)',
    'You miscast Magic Dart.',
    'You feel sick.',
  ])('does not invent an incoming hit: %s', text => {
    expect(combatText(text)).toEqual([])
  })
})

describe('combat updates', () => {

  it('places Ice Thorns zero and damage results on a stepping enemy without requiring a wound change', () => {
    const { feedback, scene, text } = harness()
    text('The ice thorns skewer the goblin but do no damage.')
    const moved = world(goblin(1, 2))
    expect(feedback.flush(moved)).toMatchObject([{ kind: 'hit', actorId: 'id:1', x: 2, y: 0, amount: 0, tone: 'cold' }])
    text('The ice thorns skewer the goblin.')
    expect(feedback.flush(moved)).toMatchObject([{ kind: 'hit', actorId: 'id:1', x: 2, intensity: 'light', tone: 'cold' }])
    expect(feedback.flush(scene)).toEqual([])
  })

  it('does not replay an Ice Thorns hit when Crawl appends a wound sentence', () => {
    const { feedback, scene, text } = harness()
    text('The ice thorns skewer the goblin!')
    expect(feedback.flush(scene)).toMatchObject([{ intensity: 'solid', tone: 'cold' }])
    text('The ice thorns skewer the goblin! The goblin is heavily wounded.', 1)
    expect(feedback.flush(scene)).toEqual([])
  })

  it('resolves an observed live strong-hit sentence into a placed effect alongside a kill', () => {
    const { feedback, text } = harness()
    const scene = world({ ...goblin(), name: 'hornet', id: 7, ref: undefined })
    feedback.flush(scene)
    text('<lightgrey>You perforate the hornet like a sieve!!!<lightgrey> <red>You kill the hornet!<lightgrey>')
    expect(feedback.flush(world())).toMatchObject([
      { kind: 'hit', actorId: 'id:7', x: 1, y: 0, intensity: 'heavy' },
      { kind: 'kill', actorId: 'id:7', x: 1, y: 0 },
    ])
  })

  it('produces combat events from the recorded public WebTiles stream', () => {
    const trace = readFileSync(new URL('../../../packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson', import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line).m as ServerMessage)
    const state = initialState(), feedback = new CombatFeedback(state)
    const scene = world({ ...goblin(), name: 'black mamba', ref: { id: 1, name: 'black mamba' } })
    const events = []
    for (const msg of trace) {
      reduce(state, msg); feedback.observe(state, msg)
      events.push(...feedback.flush(scene))
    }
    expect(events.some(p => p.kind === 'hit' && p.amount === undefined && p.intensity)).toBe(true)
    expect(events.some(p => p.kind === 'miss')).toBe(true)
    expect(events.some(p => p.kind === 'hurt' && p.player)).toBe(true)
  })

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
    expect(feedback.flush(scene).map(p => p.kind)).toEqual(['hit'])
  })
  it('folds an unknown brand hit into its base hit, retaining actual damage', () => {
    const { feedback, scene, text } = harness()
    text('The bolt hits the goblin for 7! The bolt burns the goblin!')
    expect(feedback.flush(scene)).toMatchObject([{ amount: 7, tone: 'fire' }])
    text('You hit the goblin. You freeze the goblin!')
    expect(feedback.flush(scene)).toMatchObject([{ tone: 'cold', intensity: 'light' }])
  })
  it('handles appended message rollbacks without repeating a hit', () => {
    const { feedback, scene, text } = harness()
    text('You hit the goblin for 5.')
    expect(feedback.flush(scene).map(p => p.kind)).toEqual(['hit'])
    text('You hit the goblin for 5. You miss the goblin.', 1)
    expect(feedback.flush(scene).map(p => p.kind)).toEqual(['miss'])
    text('You hit the goblin for 5. You miss the goblin.', 1)
    expect(feedback.flush(scene)).toEqual([])
    text('You hit the goblin for 5.') // A new attack may have exactly the same wording.
    expect(feedback.flush(scene).map(p => p.kind)).toEqual(['hit'])
  })
  it('keeps multiple player updates between frames and never doubles incoming damage', () => {
    const { feedback, scene, send, text } = harness()
    send({ msg: 'player', hp: 26 })
    text('The bolt of fire hits you for 4!')
    send({ msg: 'player', hp: 21 })
    text('The goblin hits you for 5!')
    expect(feedback.flush(scene).map(p => p.amount)).toEqual([4, 5])
    send({ msg: 'player', hp: 28 })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.takeSpells()).toMatchObject([{ kind: 'heal', actorId: 'player', intensity: 'solid' }])
    send({ msg: 'player', hp: 29 }) // Don't spam passive regeneration.
    expect(feedback.flush(scene)).toEqual([])
  })
  it.each([false, true])('ignores Djinni preview/cast HP costs while retaining enemy hits (HP first=%s)', hpFirst => {
    const { feedback, scene, send, text } = harness()
    send({ msg: 'player', species: 'Djinni', hp: 29 })
    text('Casting: Magic Dart (safe; 1% risk of failure)')
    expect(feedback.flush(scene)).toEqual([])
    send({ msg: 'player', hp: 30 }) // Cancel preview.
    expect(feedback.flush(scene)).toEqual([])
    send({ msg: 'player', hp: 29 })
    text('The magic dart hits the goblin.')
    expect(feedback.flush(scene).map(e => e.kind)).toEqual(['hit'])
    const hurt = () => text('The goblin hits you!')
    const hp = () => send({ msg: 'player', hp: 23 }) // Cast cost and enemy damage share an update.
    ;(hpFirst ? hp : hurt)()
    const events = feedback.flush(scene)
    ;(hpFirst ? hurt : hp)()
    events.push(...feedback.flush(scene))
    expect(events).toMatchObject([{ kind: 'hurt', player: true, amount: undefined }])
    text('The goblin hits you! The goblin misses you.', 1)
    expect(feedback.flush(scene)).toMatchObject([{ kind: 'miss', player: true, melee: true }])
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
    expect(feedback.flush(scene).map(p => p.kind)).toEqual(['miss'])
  })
  it('reports status transitions once, without retriggering changing poison strength', () => {
    const { feedback, scene, send } = harness()
    send({ msg: 'player', status: [{ light: 'Pois', text: 'poisoned' }] })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.takeSpells()).toMatchObject([{ kind: 'debuff', actorId: 'player' }])
    send({ msg: 'player', status: [{ light: 'Pois', text: 'very poisoned' }] })
    expect(feedback.flush(scene)).toEqual([])
    send({ msg: 'player', status: [] })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.takeSpells()).toMatchObject([{ kind: 'heal', actorId: 'player' }])
    send({ msg: 'player', xl: 4, hp: 35, hp_max: 35 })
    expect(feedback.flush(scene)).toEqual([])
    expect(feedback.takeSpells()).toEqual([])
  })
  it('uses the last visible location for kills and pairs a kill with its hit', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, 2))
    feedback.flush(scene)
    text('You hit the goblin for 8! You kill the goblin!')
    const next = world(goblin(2, 2))
    expect(feedback.flush(next).map(p => [p.kind, p.x])).toEqual([['hit', 1], ['kill', 1]])
  })
  it('preserves the slain creature material and identity after its billboard is removed', () => {
    const { feedback, text } = harness()
    const skeleton = { ...goblin(), name: 'skeleton', ref: { id: 1, name: 'skeleton' } }
    const before = world(skeleton)
    feedback.flush(before)
    text('You destroy the skeleton!')
    const after = { ...before, billboards: [] }
    const [kill] = feedback.flush(after)
    expect(kill.death).toMatchObject({ actorId: 'id:1', kind: 'bone', x: 1, y: 0, direction: { x: 1, y: 0 } })
    expect(feedback.flush(after)).toEqual([])
  })
  it('does not infer death when an actor simply leaves sight', () => {
    const { feedback } = harness()
    expect(feedback.flush(world())).toEqual([])
  })
  it.each(['You kill the goblin!', 'The goblin is killed!', 'The goblin dies!'])(
    'keeps a Foxfire victim through map removal until its confirmed death arrives: %s', deathText => {
      const { feedback, text } = harness()
      const foxfire: Billboard = { ...goblin(3, 0), name: 'foxfire', ref: { id: 3, name: 'foxfire' }, attitude: 'friendly' }
      const before = world(goblin(1, 1), goblin(2, 2), foxfire)
      feedback.flush(before, 100)
      const after = { ...before, billboards: [goblin(2, 2)] }
      expect(feedback.flush(after, 110)).toEqual([])
      expect(feedback.flush(after, 120)).toEqual([])
      text(`The foxfire burns the goblin! ${deathText}`)
      const events = feedback.flush(after, 130)
      expect(events).toMatchObject([
        { kind: 'hit', actorId: 'id:1', x: 1, y: 0, tone: 'fire', melee: false },
        { kind: 'kill', actorId: 'id:1', death: { actorId: 'id:1', x: 1, y: 0, kind: 'flesh' } },
      ])
      expect(events.filter(e => e.death)).toHaveLength(1)
      expect(feedback.flush(after, 140)).toEqual([])
      text('The goblin is killed!')
      expect(feedback.flush(after, 150).some(e => e.actorId === 'id:1')).toBe(false)
    },
  )
  it('resolves a named unique killed indirectly after its map removal', () => {
    const { feedback, text } = harness()
    const unique: Billboard = { ...goblin(7), name: 'Sigmund', ref: { id: 7, name: 'Sigmund' } }
    const before = world(unique)
    feedback.flush(before, 100)
    const after = { ...before, billboards: [] }
    feedback.flush(after, 110)
    text('The foxfire burns Sigmund! Sigmund is killed!')
    expect(feedback.flush(after, 120).find(e => e.kind === 'kill')).toMatchObject({
      actorId: 'id:7', death: { actorId: 'id:7', x: 1, y: 0 },
    })
  })
  it('keeps separate remembered victims for multiple indirect kills with the same name', () => {
    const { feedback, text } = harness()
    const before = world(goblin(1, 1), goblin(2, 2))
    feedback.flush(before, 100)
    const after = { ...before, billboards: [] }
    feedback.flush(after, 110)
    text('The goblin is killed! The goblin dies!')
    expect(feedback.flush(after, 120).map(e => e.death?.actorId)).toEqual(['id:1', 'id:2'])
  })
  it.each(['expired', 'hidden', 'level'] as const)('does not reuse %s victim positions for a delayed kill', change => {
    const { feedback, text } = harness()
    const before = { ...world(goblin()), levelKey: 'D:1' }
    feedback.flush(before, 100)
    const after = { ...before, billboards: [] }
    feedback.flush(after, 110)
    if (change === 'hidden') after.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    if (change === 'level') after.levelKey = 'D:2'
    text('The goblin is killed!')
    expect(feedback.flush(after, change === 'expired' ? 2200 : 120)).toEqual([])
  })
  it('does not turn a Foxfire hit or a dissipating Foxfire into an inferred death', () => {
    const { feedback, text } = harness()
    const before = world(goblin())
    feedback.flush(before, 100)
    const after = { ...before, billboards: [] }
    feedback.flush(after, 110)
    text('The foxfire burns the goblin! The foxfire dissipates!')
    expect(feedback.flush(after, 120)).toEqual([])
  })
  it('spawns separate deaths for same-name victims and recognizes damage-over-time death messages', () => {
    const { feedback, text } = harness()
    const before = world(goblin(1, 1), goblin(2, 2))
    feedback.flush(before)
    text('You slash the goblin! You kill the goblin! The goblin dies!')
    const kills = feedback.flush({ ...before, billboards: [] }).filter(e => e.kind === 'kill')
    expect(kills.map(e => e.death?.actorId)).toEqual(['id:1', 'id:2'])
  })
  it('spreads same-name cleave attacks and ignores unknown or invisible targets', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, 2))
    text('You slash the goblin for 5! You slash the goblin for 7! You hit the invisible orc for 9!')
    expect(feedback.flush(scene).map(p => p.x)).toEqual([1, 2])
  })
  it.each(['You hit the goblin!', 'You miss the goblin.'])('keeps a minotaur headbutt on the preceding target after %s', attack => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, -1))
    text(`${attack} You headbutt the goblin! You hit the goblin!`)
    const events = feedback.flush(scene)
    expect(events.map(e => e.actorId)).toEqual(['id:1', 'id:1', 'id:2'])
    expect(events[1]).toMatchObject({ auxiliary: true, kind: 'hit', x: 1, y: 0 })
  })
  it('discards pending combat on level changes and session resets', () => {
    const { feedback, scene, send, text } = harness()
    text('You hit the goblin for 5.')
    send({ msg: 'player', depth: 2, hp: 20 })
    expect(feedback.flush(scene)).toEqual([])
    text('You miss the goblin.')
    send({ msg: 'go_lobby' })
    expect(feedback.flush(scene)).toEqual([])
  })
})

function wounded(id: number, x: number, damage: Billboard['damage'], hp = 100): Billboard {
  return { ...goblin(id, x), damage, ref: { id, name: 'goblin', typedata: { avghp: hp } } }
}

describe('confirmed damage and qualitative effect strength', () => {
  it('uses the strongest simultaneous hit for one burst without inventing total damage', () => {
    const { feedback, scene, text } = harness()
    text('The magic dart hits the goblin. The magic dart hits the goblin!')
    const hits = feedback.flush(scene)
    expect(hits.map(h => h.amount)).toEqual([undefined, undefined])
    expect(feedback.takeSpells()).toMatchObject([{ kind: 'magic', intensity: 'solid' }])
  })
  it('never derives a number from a wound decline or average HP', () => {
    const { feedback, text } = harness()
    feedback.flush(world(wounded(1, 1, 'uninjured', 20)))
    text('You hit the goblin.')
    expect(feedback.flush(world(wounded(1, 1, 'lightly_damaged', 20)))).toMatchObject([{ amount: undefined, intensity: 'light' }])
  })
  it('uses punctuation to choose Magic Dart effect strength', () => {
    const { feedback, text } = harness()
    const scene = world(wounded(1, 1, 'moderately_damaged'))
    feedback.flush(scene)
    text('The magic dart hits the goblin!')
    const [hit] = feedback.flush(scene)
    expect(hit.intensity).toBe('solid')
    expect(hit.amount).toBeUndefined()
  })
  it('keeps individual hit feedback without inventing a combined amount', () => {
    const { feedback, scene, send, text } = harness()
    text('You hit the goblin. You hit the goblin.')
    expect(feedback.flush(scene)).toMatchObject([{ amount: undefined }, { amount: undefined }])
    send({ msg: 'msgs', messages: [{ text: 'You hit the goblin.', turn: 20 }, { text: 'You hit the goblin.', turn: 21 }] })
    const hits = feedback.flush(scene)
    expect(hits.map(p => p.turn)).toEqual([20, 21])
    expect(hits.every(p => p.amount === undefined)).toBe(true)
  })
  it('never estimates over an exact reported number or an explicit zero', () => {
    const { feedback, text } = harness()
    feedback.flush(world(wounded(1, 1, 'uninjured')))
    text('You hit the goblin for 8!')
    const [hit] = feedback.flush(world(wounded(1, 1, 'heavily_damaged')))
    expect(hit.amount).toBe(8)
    text('You hit the goblin but do no damage.')
    expect(feedback.flush(world(wounded(1, 1, 'heavily_damaged')))).toMatchObject([{ amount: 0 }])
  })
  it('retains the impact alongside a kill without estimating overkill', () => {
    const { feedback, text } = harness()
    feedback.flush(world(wounded(1, 1, 'uninjured', 10)))
    text('You impale the goblin!!! You kill the goblin!')
    expect(feedback.flush(world()).map(p => p.kind)).toEqual(['hit', 'kill'])
  })
  it('uses wound evidence to choose a farther same-name target', () => {
    const { feedback, text } = harness()
    feedback.flush(world(wounded(1, 1, 'uninjured'), wounded(2, 3, 'uninjured')))
    text('You hit the goblin!!')
    const hits = feedback.flush(world(wounded(1, 1, 'uninjured'), wounded(2, 3, 'moderately_damaged')))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ actorId: 'id:2', x: 3, intensity: 'heavy' })
  })
  it('does not emit independent damage events from wound-status changes', () => {
    const { feedback } = harness()
    feedback.flush(world(wounded(1, 1, 'lightly_damaged', 50)))
    const next = world(wounded(1, 1, 'heavily_damaged', 50))
    expect(feedback.flush(next)).toEqual([])
    expect(feedback.flush(next)).toEqual([])
    expect(feedback.flush(world(wounded(1, 1, 'lightly_damaged', 50)))).toEqual([])
    expect(feedback.flush(world())).toEqual([])
  })
  it('does not manufacture damage when a new monster appears or a monster changes form', () => {
    const { feedback } = harness()
    expect(feedback.flush(world(wounded(2, 2, 'almost_dead')))).toEqual([])
    expect(feedback.flush(world(wounded(2, 2, 'uninjured')))).toEqual([])
    const changed = { ...wounded(2, 2, 'heavily_damaged'), name: 'orc' }
    expect(feedback.flush(world(changed))).toEqual([])
  })
})

// Protocol messages and map changes can land on opposite sides of a render frame.
describe('one event per reported attack', () => {
  it.each([false, true])('does not double an attack when its wound update follows a frame (exact=%s)', exact => {
    const { feedback, text, send } = harness()
    const scene = world(wounded(1, 1, 'uninjured', 50))
    feedback.flush(scene)
    text(exact ? 'You hit the goblin for 8!' : 'You hit the goblin!')
    expect(feedback.flush(scene)).toHaveLength(1)
    send({ msg: 'player', turn: 101 })
    expect(feedback.flush(world(wounded(1, 1, 'heavily_damaged', 50)))).toEqual([])
  })
  it('does not double an attack when its wound update arrives before the attack message', () => {
    const { feedback, text } = harness()
    feedback.flush(world(wounded(1, 1, 'uninjured', 50)))
    const next = world(wounded(1, 1, 'heavily_damaged', 50))
    expect(feedback.flush(next)).toEqual([])
    text('You hit the goblin for 8!')
    expect(feedback.flush(next)).toMatchObject([{ amount: 8, }])
  })
})


describe('visible creature melee sources', () => {
  it.each(['The goblin hits you!', 'The goblin misses you.', 'The goblin hits you but does no damage.', "You block the goblin's attack."])(
    'resolves incoming attempts without consulting the player weapon: %s', sentence => {
      const { feedback, scene, text } = harness()
      text(sentence)
      const events = feedback.flush(scene)
      expect(events).toHaveLength(1)
      expect(bumpFor(events[0], scene, 'shortbow')).toMatchObject({
        from: { x: 1, y: 0 }, fromId: 'id:1', to: { x: 0, y: 0 }, toId: 'player',
        hit: sentence === 'The goblin hits you!',
      })
    })

  it('resolves allies attacking enemies and enemies attacking allies', () => {
    const { feedback, text } = harness()
    const ally: Billboard = { ...goblin(2, 2), name: 'orc', ref: { id: 2, name: 'orc' }, attitude: 'friendly' }
    const scene = world(goblin(), ally)
    feedback.flush(scene)
    text("Your orc hits the goblin! The goblin bites your orc. Your orc blocks the goblin's attack. The goblin blocks your orc's attack.")
    const events = feedback.flush(scene)
    expect(events.map(e => bumpFor(e, scene, 'shortbow'))).toMatchObject([
      { fromId: 'id:2', toId: 'id:1', hit: true },
      { fromId: 'id:1', toId: 'id:2', hit: true },
      { fromId: 'id:1', toId: 'id:2', hit: false },
      { fromId: 'id:2', toId: 'id:1', hit: false },
    ])
    expect(feedback.takeSpells()).toEqual([]) // Contact owns the material spray.
  })

  it('resolves shield blocks in both directions without replaying appended messages', () => {
    const { feedback, scene, text } = harness()
    text("You block the goblin's attack.")
    expect(feedback.flush(scene)).toMatchObject([{ kind: 'block', player: true, source: { actorId: 'id:1' } }])
    text("You block the goblin's attack. The goblin blocks your attack.", 1)
    const events = feedback.flush(scene)
    expect(events).toHaveLength(1)
    expect(bumpFor(events[0], scene, 'mace')).toMatchObject({ fromId: 'player', toId: 'id:1', hit: false })
    expect(feedback.takeSpells()).toEqual([])
  })

  it.each([false, true])('distributes identical attackers across confirmed attempts, including appended packets (flush between=%s)', between => {
    const { feedback, text } = harness()
    const scene = world(goblin(2, -1), goblin(1, 1), goblin(3, 4))
    feedback.flush(scene)
    text('The goblin hits you!')
    const events = between ? feedback.flush(scene) : []
    // Reordering composition must not change which actor gets the next attempt.
    scene.billboards.reverse()
    text('The goblin hits you! The goblin misses you.', 1)
    events.push(...feedback.flush(scene))
    expect(events.map(e => bumpFor(e, scene, 'shortbow'))).toMatchObject([
      { fromId: 'id:1', toId: 'player', hit: true },
      { fromId: 'id:2', toId: 'player', hit: false },
    ])
    text('The goblin hits you! The goblin misses you.', 1)
    expect(feedback.flush(scene)).toEqual([])
    text("You block the goblin's attack.")
    expect(bumpFor(feedback.flush(scene)[0], scene, undefined)).toMatchObject({ fromId: 'id:1', hit: false })
    expect(feedback.takeSpells()).toEqual([])
  })

  it('starts fresh source allocation on the next turn and after leaving the level', () => {
    const { feedback, text, send } = harness()
    const scene = world(goblin(1, 1), goblin(2, -1))
    feedback.flush(scene)
    const attack = () => {
      text('The goblin hits you!')
      return feedback.flush(scene)[0].source?.actorId
    }
    expect(attack()).toBe('id:1')
    send({ msg: 'player', turn: 101 })
    expect(attack()).toBe('id:1')
    feedback.flush({ ...scene, playerOnLevel: false })
    feedback.flush(scene)
    expect(attack()).toBe('id:1')
  })

  it('does not allocate melee sources across ambiguous recipients', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 1), goblin(2, -1), {
      ...goblin(3, 0), y: 1, name: 'orc', ref: { id: 3, name: 'orc' }, attitude: 'friendly',
    })
    feedback.flush(scene)
    text('Your orc hits the goblin!')
    expect(bumpFor(feedback.flush(scene)[0], scene, undefined)).toBeNull()
  })

  it.each(['hidden', 'far', 'spell', 'projectile', 'unknown'])(
    'does not guess a melee source for %s evidence', mode => {
      const { feedback, text } = harness()
      const scene = world(goblin(1, mode === 'far' ? 2 : 1))
      if (mode === 'hidden') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
      feedback.flush(scene)
      text(mode === 'spell' ? 'The goblin smites you!' : mode === 'projectile' ? 'The bolt of fire hits you!'
        : mode === 'unknown' ? 'Something hits you!' : 'The goblin hits you!')
      const events = feedback.flush(scene)
      expect(events).toMatchObject([{ kind: 'hurt', player: true }])
      expect(bumpFor(events[0], scene, undefined)).toBeNull()
      if (['hidden', 'far'].includes(mode)) {
        text("You block the goblin's attack.")
        const blocks = feedback.flush(scene)
        expect(blocks).toMatchObject([{ kind: 'block', player: true }])
        expect(bumpFor(blocks[0], scene, undefined)).toBeNull()
      }
    })

  it('keeps player follow-ups on their target when an ally hits an identically named enemy', () => {
    const { feedback, text } = harness()
    const ally: Billboard = { ...goblin(3, 4), name: 'stone giant', ref: { id: 3, name: 'stone giant' }, attitude: 'friendly' }
    const scene = world(goblin(1, 1), goblin(2, 3), ally)
    feedback.flush(scene)
    text('You hit the goblin! Your stone giant hits the goblin! You headbutt the goblin!')
    const events = feedback.flush(scene)
    expect(events.map(e => e.actorId)).toEqual(['id:1', 'id:2', 'id:1'])
    expect(bumpFor(events[1], scene, undefined)).toMatchObject({ fromId: 'id:3', toId: 'id:2', hit: true })
  })

  it('allows explicitly reported reach and expires source identity on leaving the level', () => {
    const { feedback, text } = harness()
    const scene = world(goblin(1, 2))
    feedback.flush(scene)
    text('The goblin hits you from afar!')
    expect(bumpFor(feedback.flush(scene)[0], scene, undefined)).toMatchObject({ fromId: 'id:1', toId: 'player' })
    text('The goblin hits you!')
    expect(feedback.flush({ ...scene, playerOnLevel: false })).toEqual([])
  })
})
