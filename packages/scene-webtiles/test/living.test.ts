import { describe, expect, it } from 'vitest'
import { creatureLife, tileLight, tileMotion, projectileAppearance, spawnAppearance } from '../src/living.js'
import { livingPose, type Billboard } from '@orbrun/scene'
import type { FlagWord } from '@orbrun/gamedata'

const monster: Billboard = { x: 1, y: 0, kind: 'monster', tile: 1, height: 0.6, attitude: 'hostile' }
describe('server tile semantics for atmosphere', () => {
  it('recognises spawned terrain, prism charge variants, clouds and explicit area artwork', () => {
    expect(spawnAppearance('DNGN_ICE_THORNS_2')).toEqual({ kind: 'cold', style: 'crystal', family: 'DNGN_ICE_THORNS' })
    expect(spawnAppearance('MONS_FULMINANT_PRISM_3')).toEqual(spawnAppearance('MONS_FULMINANT_PRISM'))
    expect(spawnAppearance('CLOUD_COLD_2')).toMatchObject({ kind: 'cold', style: 'cloud' })
    expect(spawnAppearance('BOLT_ICEBLAST_1')).toMatchObject({ kind: 'cold', style: 'burst' })
    for (const name of ['BOLT_FLAME', 'BOLT_DEFAULT_RED', 'BOLT_FROST', 'MONS_ORC', 'DNGN_FLOOR_NORMAL']) expect(spawnAppearance(name)).toBeUndefined()
  })
  it.each([
    ['BOLT_SANDBLAST', 'sand'], ['BOLT_SANDBLAST_2', 'sand'], ['BOLT_STONE_ARROW', 'stone'],
    ['BOLT_CRYSTAL_SPEAR', 'stone'], ['BOLT_SPLINTERSPRAY', 'sand'], ['BOLT_IRON_SHOT', 'metal'], ['BOLT_METAL_SPLINTERS', 'metal'], ['MI_STONE', 'stone'],
    ['BOLT_WEAK_AIR', 'air'], ['BOLT_MAGIC_DART', 'magic'], ['BOLT_ICICLE', 'cold'],
  ] as const)('gives %s projectile effects independent of lighting', (name, kind) => {
    expect(projectileAppearance(name)).toMatchObject({ kind })
    if (['sand', 'stone', 'metal'].includes(kind)) {
      expect(tileLight(name)).toBeUndefined()
      expect(projectileAppearance(name)).toMatchObject({ beam: false })
    }
  })
  it.each([
    ['BOLT_SEARING_RAY', 'fire', 'fire'], ['BOLT_GHOSTLY_FIREBALL', 'magic', 'slow'],
    ['BOLT_SHADOWY_LIGHTNING', 'magic', 'slow'], ['BOLT_UMBRAL_TORCHLIGHT', 'magic', 'slow'],
    ['BOLT_HOLY_FLAME', 'magic', 'slow'], ['BOLT_SIROCCO_2', 'fire', 'fire'],
    ['BOLT_FIERY_PLASMA', 'fire', 'fire'], ['BOLT_PLASMA_BEAM', 'electric', 'electric'],
    ['BOLT_FULSOME_FIRE', 'fire', 'fire'], ['BOLT_FULSOME_ICE', 'cold', 'slow'],
    ['BOLT_FULSOME_POISON', 'poison', 'slow'], ['BOLT_FULSOME_ELECTRIC', 'electric', 'electric'],
    ['BOLT_FULSOME_QUINTESSENCE', 'magic', 'slow'], ['BOLT_FIRE_STORM', 'fire', 'fire'],
    ['CLOUD_ACID_2', 'acid', 'slow'], ['CLOUD_MIASMA_1', 'poison', 'slow'],
  ] as const)('keeps %s projectile/spawn appearance and light in the same family', (name, kind, pulse) => {
    expect(projectileAppearance(name)).toMatchObject({ kind })
    expect(tileLight(name)).toMatchObject({ pulse })
    const spawn = spawnAppearance(name)
    if (spawn) expect(spawn.kind).toBe(kind)
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
  it.each(['bat', 'gargoyle', 'bee', 'fire elemental'])('gives an airborne %s a hover instead of its grounded idle', name => {
    const life = creatureLife(name, { FLYING: true } as unknown as FlagWord, monster)
    expect(life).toMatchObject({ motion: 'fly', flying: true })
    expect(livingPose(life, 0, 0, 1).sy).toBe(1)
    expect(livingPose(life, 0, 0, 1).y).toBeGreaterThan(0)
  })
  it.each(['gnoll', 'orc', 'goblin', 'ogre', 'rat', 'adder', 'iron golem'])('keeps a grounded %s on the floor', name => {
    const life = creatureLife(name, {} as FlagWord, monster)
    expect(life.flying).toBe(false)
    expect(life.motion).not.toBe('fly')
    expect(livingPose(life, 0, 0, 1).y).toBe(0)
  })
  it.each([
    ['orc apostle', 'MONS_ORC_APOSTLE'],
    ['named apostle', 'MONS_ORC_APOSTLE'],
    ['sacred lotus', 'MONS_SACRED_LOTUS'],
  ])('does not confuse %s water-clipping flags with flight', (name, tileName) => {
    const life = creatureLife(name, { FLYING: true } as unknown as FlagWord, monster, tileName)
    expect(life.flying).toBe(false)
    expect(life.motion).not.toBe('fly')
    expect(livingPose(life, 0, 0, 1).y).toBe(0)
  })
})
