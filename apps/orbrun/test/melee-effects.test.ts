import { describe, expect, it } from 'vitest'
import { emptyScene } from '@orbrun/scene'
import { combatText } from '../src/combat-feedback'
import { incomingMelee, meleeFor, meleeStyle } from '../src/melee-effects'

describe('confirmed melee presentation', () => {
  it.each([
    [undefined, 'unarmed'], ['a +2 long sword of flaming', 'slash'], ['a broad axe', 'cleave'],
    ['a +3 battleaxe', 'cleave'], ['an eveningstar', 'crush'],
    ['a +0 demon trident', 'thrust'], ['a quick blade', 'thrust'], ['a giant spiked club', 'crush'],
    ['a +9 arbalest', null], ['a sling', null],
  ] as const)('varies gestures for %s', (weapon, style) => expect(meleeStyle(weapon)).toBe(style))

  it('uses resolved melee hits and misses, but excludes spell/brand and distant feedback', () => {
    const scene = emptyScene()
    const hit = { ...combatText('You slash the goblin!')[0], x: 1, y: 0 }
    expect(meleeFor(hit, scene, 'long sword')).toMatchObject({ style: 'slash', hit: true, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } })
    expect(meleeFor({ ...hit, amount: 0 }, scene, 'long sword')?.hit).toBe(false)
    expect(meleeFor({ ...combatText('You miss the goblin.')[0], x: 1, y: 0 }, scene, 'mace')).toMatchObject({ style: 'crush', hit: false })
    for (const text of ['You burn the goblin!', 'You electrocute the goblin!', 'The bolt hits the goblin!']) {
      expect(meleeFor({ ...combatText(text)[0], x: 1, y: 0 }, scene, 'long sword')).toBeNull()
    }
    expect(meleeFor({ ...hit, x: 2 }, scene, 'long sword')).toBeNull()
    expect(meleeFor({ ...hit, x: 2 }, scene, 'spear')?.style).toBe('thrust')
    expect(meleeFor(hit, scene, 'shortbow')).toBeNull()
    expect(meleeFor({ ...hit, brandOnly: true }, scene, 'long sword')).toBeNull()
  })

  it('recognizes explicit enemy contact while leaving spell and projectile hits alone', () => {
    expect(incomingMelee('The goblin hits you with a +0 club. The adder bites you!')).toMatchObject([
      { attacker: 'goblin', style: 'crush', hit: true }, { attacker: 'adder', style: 'unarmed', hit: true },
    ])
    expect(incomingMelee('The orc barely misses you.')).toMatchObject([{ attacker: 'orc', style: 'unarmed', hit: false }])
    expect(incomingMelee('The orc hits you with a mace but does no damage.')[0]?.hit).toBe(false)
    expect(incomingMelee('The bolt of fire hits you! The wall freezes you. The centaur hits you with a shortbow. The goblin hits you with a dart.')).toMatchObject([
      { attacker: 'bolt of fire', style: 'unarmed', hit: true },
    ]) // Non-actors are discarded when resolving the scene, not guessed to be attackers.
  })
  it('recognizes engine-reported incoming damage without treating the amount as a weapon', () => {
    expect(incomingMelee('The goblin hits you with a +0 club for 12!')).toMatchObject([
      { attacker: 'goblin', style: 'crush', hit: true, intensity: 'solid' },
    ])
    expect(incomingMelee('The adder bites you for 0.')[0].hit).toBe(false)
    expect(incomingMelee('The adder bites you for 3.')[0].intensity).toBe('light')
  })
})
