import { describe, expect, it } from 'vitest'
import { creatureLife, tileLight, tileMotion, projectileAppearance } from '../src/living.js'
import { livingPose, type Billboard } from '@orbrun/scene'
import type { FlagWord } from '@orbrun/gamedata'

const monster: Billboard = { x: 1, y: 0, kind: 'monster', tile: 1, height: 0.6, attitude: 'hostile' }
describe('server tile semantics for atmosphere', () => {
  it.each([
    ['BOLT_SANDBLAST', 'sand'], ['BOLT_SANDBLAST_2', 'sand'], ['BOLT_STONE_ARROW', 'stone'],
    ['BOLT_IRON_SHOT', 'metal'], ['BOLT_METAL_SPLINTERS', 'metal'], ['MI_STONE', 'stone'],
    ['BOLT_WEAK_AIR', 'air'], ['BOLT_MAGIC_DART', 'magic'], ['BOLT_ICICLE', 'cold'],
  ] as const)('gives %s projectile effects independent of lighting', (name, kind) => {
    expect(projectileAppearance(name)).toMatchObject({ kind })
    if (['sand', 'stone', 'metal'].includes(kind)) {
      expect(tileLight(name)).toBeUndefined()
      expect(projectileAppearance(name)).toMatchObject({ beam: false })
    }
  })
  it('distinguishes directional artwork from distance/animation variants', () => {
    expect(projectileAppearance('BOLT_MAGIC_DART_5', 6)).toMatchObject({ family: 'BOLT_MAGIC_DART', distancePhase: 5, distanceCycle: 6 })
    expect(projectileAppearance('BOLT_MAGIC_DART', 6)).toMatchObject({ distancePhase: 0, distanceCycle: 6 })
    expect(projectileAppearance('MI_ARROW0')).toMatchObject({ family: 'MI_ARROW', angle: -Math.PI / 2 })
    expect(projectileAppearance('MI_ARROW6')).toMatchObject({ family: 'MI_ARROW', angle: Math.PI })
    expect(projectileAppearance('BOLT_STONE_ARROW_2')).toMatchObject({ family: 'BOLT_STONE_ARROW', angle: 0 })
    expect(projectileAppearance('BOLT_IRON_SHOT_5')).toMatchObject({ family: 'BOLT_IRON_SHOT', angle: 3 * Math.PI / 4 })
    for (const name of ['BOLT_MAGIC_DART_3', 'BOLT_SANDBLAST_2', 'BOLT_FROST_1']) {
      expect(projectileAppearance(name)).not.toHaveProperty('angle')
    }
  })
  it('preserves compact/unknown missile art and deliberately invisible spells', () => {
    expect(projectileAppearance('BOLT_MAGIC_DART')).toMatchObject({ beam: false })
    expect(projectileAppearance('MI_BOLT_MAGIC')).toMatchObject({ beam: false })
    expect(projectileAppearance('BOLT_NEW_SPELL')).toMatchObject({ beam: false })
    expect(projectileAppearance('BOLT_DEFAULT_BLACK')).toBe(false)
    expect(projectileAppearance('BOLT_ZAP')).toMatchObject({ beam: true })
  })
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
