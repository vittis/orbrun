import { describe, expect, it, vi } from 'vitest'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { cellKey, emptyScene, type MapRenderer, type Scene, type SpellEffect } from '@orbrun/scene'
import { CombatFeedback } from '../src/combat-feedback'
import { spellText } from '../src/spell-effects'
import { presentCombat } from '../src/combat-presentation'
import { DungeonEffects } from '../../../packages/render-2.5d/src/effects'
import { DungeonDeaths, debrisPalettes } from '../../../packages/render-2.5d/src/death'
import { elementalPalettes } from '../../../packages/render-2.5d/src/elemental-spray'
import { sampleHitSpray } from '../../../packages/render-2.5d/src/hit-spray'

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

function presentation(scene: Scene) {
  const fx = new DungeonEffects(), deaths = new DungeonDeaths()
  fx.observe(scene, 0, true); deaths.observe(scene, true)
  const renderer: Partial<MapRenderer> = {
    hit: (effect, now) => { fx.hit(scene, effect, now) },
    spell: (effect, now) => { fx.spell(scene, effect, now) },
    death: (effect, now) => { fx.death(scene, effect, now); deaths.spawn(scene, effect, now) },
    bump: vi.fn(),
  }
  return { fx, deaths, renderer: renderer as MapRenderer }
}

describe('confirmed spell splatter through the presentation pipeline', () => {
  it.each(['', ' The goblin is poisoned.'])('shows one venom hit spray with the native poison follow-up %j', suffix => {
    const h = harness(), { fx, renderer } = presentation(h.scene)
    h.state.player.inv[0] = { slot: 0, name: 'a +2 dagger of venom' }; h.state.player.weapon_index = 0
    h.text('You stab the goblin!' + suffix)
    const events = h.feedback.flush(h.scene, 1000)
    expect(events).toHaveLength(1)
    presentCombat(renderer, h.scene, events, h.feedback.takeSpells(), 'a +2 dagger of venom', 1000, true)
    expect(renderer.bump).toHaveBeenCalledOnce()
    expect(fx.bursts).toHaveLength(1)
    const particles = sampleHitSpray(h.scene, fx.bursts[0], 1.15)
    expect(particles.some(p => elementalPalettes.poison.includes(p.colour) && p.sprite === 'bubble')).toBe(true)
    expect(particles.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
  })

  it('gives a lethal venom weapon strike poison death debris even when no status message is sent', () => {
    const h = harness(), removed = world(false), { fx, deaths, renderer } = presentation(removed)
    h.state.player.inv[0] = { slot: 0, name: 'a +2 dagger of venom' }; h.state.player.weapon_index = 0
    h.text('You stab the goblin! You kill the goblin!')
    presentCombat(renderer, removed, h.feedback.flush(removed, 1000), h.feedback.takeSpells(), 'a +2 dagger of venom', 1000, true)
    expect(fx.bursts).toEqual([])
    const particles = deaths.sample(removed, 1.15)
    expect(particles.some(p => elementalPalettes.poison.includes(p.colour) && p.sprite === 'bubble')).toBe(true)
    expect(particles.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
  })

  it('keeps a Prism explosion’s element when it shares a turn and recipient with melee', () => {
    const h = harness(), { fx, renderer } = presentation(h.scene)
    h.text('You hit the goblin! The blast of energy engulfs the goblin!!')
    const events = h.feedback.flush(h.scene, 1000), spells = h.feedback.takeSpells()
    expect(spells).toMatchObject([{ kind: 'magic', actorId: 'id:1' }])
    presentCombat(renderer, h.scene, events, spells, 'mace', 1000, true)
    expect(fx.bursts).toHaveLength(1)
    expect(sampleHitSpray(h.scene, fx.bursts[0], 1.15).some(p => elementalPalettes.magic.includes(p.colour))).toBe(true)
  })

  it.each([
    'The blast of energy engulfs the goblin!!', 'The mystic blast hits the goblin!',
    'The searing ray hits the goblin!', 'The barrage of energy hits the goblin!',
    'The wavering orb of destruction weakly hits the goblin!',
    'The goblin is dispelled!', 'The goblin is blasted by disruptive energy!',
  ])('adds one magic spray alongside blood for %s, following the recipient after knockback', line => {
    const h = harness(), moved = world()
    moved.billboards[0].x = 2
    const { fx, renderer } = presentation(moved)
    h.text(line)
    const events = h.feedback.flush(moved, 1000)
    presentCombat(renderer, moved, events, h.feedback.takeSpells(), undefined, 1000, true)
    expect(renderer.bump).not.toHaveBeenCalled()
    expect(fx.bursts).toHaveLength(1)
    expect(fx.bursts[0]).toMatchObject({ actorId: 'id:1', x: 2, y: 0, kind: 'magic' })
    const particles = sampleHitSpray(moved, fx.bursts[0], 1.1)
    expect(particles.some(p => elementalPalettes.magic.includes(p.colour))).toBe(true)
    expect(particles.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
    h.text(line + ' Nothing happens.', 1)
    expect(h.feedback.flush(moved, 1100)).toEqual([])
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it.each(['The blast of energy engulfs the goblin!', 'The mystic blast hits the goblin!'])(
    'carries %s into the confirmed death instead of spawning a second impact', line => {
      const h = harness(), removed = world(false), { fx, deaths, renderer } = presentation(removed)
      h.text(line + ' You kill the goblin!')
      presentCombat(renderer, removed, h.feedback.flush(removed, 1000), h.feedback.takeSpells(), undefined, 1000, true)
      expect(fx.bursts).toEqual([])
      const particles = deaths.sample(removed, 1.1)
      expect(particles.some(p => elementalPalettes.magic.includes(p.colour))).toBe(true)
      expect(particles.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
    })

  it.each(['zero', 'miss', 'hidden', 'remote', 'still'] as const)('does not shed spell debris for %s results', mode => {
    const h = harness()
    if (mode === 'hidden') h.scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    if (mode === 'remote') h.scene.playerOnLevel = false
    const { fx, deaths, renderer } = presentation(h.scene)
    h.text(mode === 'zero' ? 'The mystic blast hits the goblin but does no damage.'
      : mode === 'miss' ? 'The mystic blast misses the goblin.' : 'The mystic blast hits the goblin!')
    presentCombat(renderer, h.scene, h.feedback.flush(h.scene, 1000), h.feedback.takeSpells(), undefined, 1000, mode !== 'still')
    expect(fx.bursts.every(b => !b.spray)).toBe(true)
    expect(deaths.sample(h.scene, 1.1)).toEqual([])
  })
})

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
    expect(h.feedback.takeSpells()).toMatchObject([{ x: 1, y: 0, kind }])
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('keeps a killing Freeze at the last visible position and does not replay appended messages', () => {
    const h = harness()
    h.text('You freeze the goblin! You kill the goblin!')
    h.feedback.flush(world(false))
    expect(h.feedback.takeSpells()).toMatchObject([{ x: 1, y: 0, kind: 'cold' }])
    h.text('You freeze the goblin! You kill the goblin! You feel stronger.', 1)
    h.feedback.flush(world(false))
    expect(h.feedback.takeSpells()).toEqual([])
  })

  it('resolves moving targets by stable identity and refuses unseen ones', () => {
    const h = harness(), moved = world()
    moved.billboards[0].x = 2
    h.text('Flames lash the goblin.')
    h.feedback.flush(moved)
    expect(h.feedback.takeSpells()).toEqual([{ x: 2, y: 0, kind: 'fire', actorId: 'id:1', turn: 0 }])
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
      { x: 0, y: 0, kind: 'teleport', actorId: 'player', turn: undefined }, { x: 0, y: 0, kind: 'poison', actorId: 'player', turn: undefined },
      { x: 0, y: 0, kind: 'heal', actorId: 'player', turn: undefined }, { x: 0, y: 0, kind: 'buff', actorId: 'player', turn: undefined },
    ]))
  })

  it('covers armour, regeneration, transformations and summons without repeating status countdowns', () => {
    const h = harness()
    h.text('A film of ice covers your body! You call forth a mighty ally!')
    h.send({ msg: 'player', status: [{ light: 'Regen', text: 'regenerating (8 turns)' }, { light: 'Dragon form', text: 'dragon form' }] })
    h.feedback.flush(h.scene)
    expect(h.feedback.takeSpells()).toEqual(expect.arrayContaining([
      { x: 0, y: 0, kind: 'cold', actorId: 'player', turn: undefined }, { x: 0, y: 0, kind: 'magic', actorId: 'player', turn: undefined }, { x: 0, y: 0, kind: 'buff', actorId: 'player', turn: undefined },
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
    expect(h.feedback.takeSpells()).toEqual(expect.arrayContaining([{ x: 0, y: 0, kind, actorId: 'player', turn: undefined }]))
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
