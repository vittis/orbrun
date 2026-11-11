import { describe, expect, it } from 'vitest'
import { creatureLife, tileLight, tileMotion } from '../src/living.js'
import { livingPose, type Billboard } from '@orbrun/scene'
import type { FlagWord } from '@orbrun/gamedata'

const monster: Billboard = { x: 1, y: 0, kind: 'monster', tile: 1, height: 0.6, attitude: 'hostile' }
describe('server tile semantics for atmosphere', () => {
  it.each(['DNGN_LAVA_2', 'DNGN_WALL_TORCH', 'CLOUD_FIRE_2', 'CLOUD_COLD_1', 'CLOUD_POISON_3', 'BOLT_STRONG_ELEC', 'BOLT_MAGIC_DART', 'DNGN_ALTAR_ZIN', 'DNGN_PORTAL', 'MONS_FIRE_ELEMENTAL', 'MONS_ANGEL'])('classifies %s as an emitter', name => {
    expect(tileLight(name)?.power).toBeGreaterThan(0)
  })
  it.each(['DNGN_DRY_FOUNTAIN', 'DNGN_PORTAL_INACTIVE', 'BOLT_DEFAULT_BLACK', 'MONS_RAT', 'DNGN_FLOOR_NORMAL'])('keeps %s unlit', name => expect(tileLight(name)).toBeUndefined())
  it('marks beams as transient without marking permanent fire sources', () => {
    expect(tileLight('BOLT_FIRE')?.transient).toBe(true)
    expect(tileLight('DNGN_WALL_TORCH')?.transient).toBeUndefined()
  })
  it('keeps statues still and chooses distinct breathing, plants, undead and ghosts', () => {
    const flags = {} as FlagWord
    expect(creatureLife('orc', flags, monster).motion).toBe('breath')
    expect(creatureLife('iron golem', flags, monster).motion).toBe('still')
    expect(creatureLife('oklob plant', flags, monster).motion).toBe('plant')
    expect(creatureLife('orc zombie', flags, monster).motion).toBe('undead')
    expect(creatureLife('wraith', flags, monster).motion).toBe('float')
    expect(tileMotion('GOLD')).toBe('gold')
    expect(tileMotion('DNGN_TREE_3')).toBe('plant')
  })
  it('changes breathing by sleep/fleeing/wounds and freezes immobilised flying actors', () => {
    const asleep = creatureLife('orc', { STAB: true } as unknown as FlagWord, monster)
    const fleeing = creatureLife('orc', { FLEEING: true } as unknown as FlagWord, monster)
    expect(asleep.rate).toBeLessThan(fleeing.rate!)
    const held = creatureLife('orc', { PARALYSED: true, FLYING: true } as unknown as FlagWord, monster)
    expect(livingPose(held, 1, 0, 10)).toEqual(livingPose(undefined, 1, 0, 10))
  })
})
