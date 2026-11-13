import { describe, expect, it } from 'vitest'
import { emptyScene } from '@orbrun/scene'
import { combatText } from '../src/combat-feedback'
import { bumpFor } from '../src/bump-effects'

describe('confirmed body bumps', () => {
  const scene = emptyScene()
  const hit = { ...combatText('You hit the goblin!')[0], x: 1, y: 0 }
  it('uses the same motion for every melee weapon and unarmed attacks', () => {
    const expected = bumpFor(hit, scene, undefined)
    expect(expected).toMatchObject({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, hit: true })
    for (const weapon of ['dagger', 'long sword', 'war axe', 'whip', 'mace', 'quarterstaff', 'glaive', 'spear']) {
      expect(bumpFor(hit, scene, weapon)).toEqual(expected)
    }
  })
  it('retains reach, confirmed misses, and the spell/ranged/brand boundaries', () => {
    expect(bumpFor({ ...hit, amount: 0 }, scene, 'axe')?.hit).toBe(false)
    expect(bumpFor({ ...combatText('You miss the goblin.')[0], x: 1, y: 0 }, scene, 'axe')?.hit).toBe(false)
    expect(bumpFor({ ...hit, x: 2 }, scene, 'long sword')).toBeNull()
    expect(bumpFor({ ...hit, x: 2 }, scene, 'spear')).not.toBeNull()
    for (const event of [{ ...hit, melee: false }, { ...hit, brandOnly: true }, { ...hit, player: true }, { ...hit, auxiliary: true }]) {
      expect(bumpFor(event, scene, 'axe')).toBeNull()
    }
    expect(bumpFor(hit, scene, 'shortbow')).toBeNull()
  })
})
