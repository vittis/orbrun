import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type DeathEffect, type DeathKind, type SceneCell } from '@orbrun/scene'
import { DungeonDeaths as DeathEffects } from '../src/death.js'
import { DEATH_ART, DEATH_TEXELS, deathDither } from '../src/death-art.js'

const death = (kind: DeathKind = 'flesh', id = 1): DeathEffect => ({ actorId: 'id:' + id, kind, x: 0, y: 0, height: 0.8, direction: { x: 1, y: 0 } })
function room() {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, floorTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  return scene
}

describe('enemy death presentation', () => {
  it('keeps the reduced death spray close to its centre across every material and profile', () => {
    const scene = room()
    for (const kind of ['flesh', 'bone', 'slime', 'stone', 'spirit', 'fire', 'ice', 'plant', 'insect', 'water'] as const) {
      for (let id = 1; id <= 24; id++) {
        const fx = new DeathEffects()
        fx.observe(scene, true); fx.spawn(scene, death(kind, id), 1)
        expect(fx.sample(scene, 1).length).toBeLessThanOrEqual(65)
        const settled = fx.sample(scene, 1.6)
        expect(settled.length).toBeGreaterThan(0)
        expect(settled.every(p => Math.hypot(p.x, p.y) <= 1.4)).toBe(true)
      }
    }
  })

  it('varies count, launch speed and spray shape between consecutive enemies of every material', () => {
    const scene = room()
    for (const kind of ['flesh', 'bone', 'slime', 'stone', 'spirit', 'fire', 'ice', 'plant', 'insect', 'water'] as const) {
      const counts = new Set<number>(), travel = new Set<number>(), shapes = new Set<number>()
      for (let id = 1; id <= 24; id++) {
        const fx = new DeathEffects()
        fx.observe(scene, true); fx.spawn(scene, death(kind, id), 1)
        const launch = fx.sample(scene, 1).filter(p => p.sprite !== 'burst')
        const spray = fx.sample(scene, 1.2).filter(p => !p.ground && p.sprite !== 'burst')
        counts.add(launch.length)
        expect(launch.length).toBeGreaterThan(20)
        expect(launch.length).toBeLessThan(80)
        // Mean displacement measures energy; lateral/forward spread measures shape.
        travel.add(Math.round(spray.reduce((sum, p) => sum + Math.hypot(p.x, p.y), 0) / spray.length * 100))
        const lateral = spray.reduce((sum, p) => sum + p.y * p.y, 0)
        const forward = spray.reduce((sum, p) => sum + p.x * p.x, 0)
        shapes.add(Math.round(lateral / forward * 100))
      }
      expect(counts.size, kind).toBeGreaterThan(8)
      expect(travel.size, kind).toBeGreaterThan(8)
      expect(shapes.size, kind).toBeGreaterThan(8)
    }
  })

  it('keeps each death deterministic across redraws and different frame cadences', () => {
    const scene = room(), continuous = new DeathEffects(), sparse = new DeathEffects()
    for (const fx of [continuous, sparse]) {
      fx.observe(scene, true); fx.spawn(scene, death(), 1)
    }
    for (const t of [1, 1.04, 1.1, 1.3]) continuous.sample(scene, t)
    const particles = continuous.sample(scene, 1.4)
    expect(particles).toEqual(sparse.sample(scene, 1.4))
    expect(continuous.sample(scene, 1.4)).toEqual(particles)
    const landed = continuous.sample(scene, 2.5)
    expect(landed).toEqual(sparse.sample(scene, 2.5))
    expect(landed.filter(p => p.ground).length).toBeGreaterThan(0)
  })

  it('draws the burst and debris on the exact frame the enemy is removed', () => {
    const scene = room(), fx = new DeathEffects(), now = 1.234
    fx.observe(scene, true)
    fx.spawn(scene, death(), now)
    const particles = fx.sample(scene, now)
    expect(particles.some(p => p.sprite === 'burst' && p.alpha === 1)).toBe(true)
    expect(particles.some(p => p.sprite === 'gib' && p.alpha === 1)).toBe(true)
    expect(fx.coversImpact(0, 0, now)).toBe(true)
  })

  it('retains a delayed killing blow, then bursts, lands and fades without timers', () => {
    const scene = room(), fx = new DeathEffects()
    fx.observe(scene, true)
    fx.spawn(scene, death('bone'), 1.15)
    expect(fx.sample(scene, 1)).toEqual([])
    expect(fx.active).toBe(true)
    expect(fx.coversImpact(0, 0, 1)).toBe(false)
    expect(fx.coversImpact(0, 0, 1.2)).toBe(true)
    const burst = fx.sample(scene, 1.2)
    expect(burst.some(p => p.sprite === 'burst')).toBe(true)
    expect(burst.filter(p => p.sprite === 'shard').length).toBeGreaterThan(15)
    const settled = fx.sample(scene, 2.5)
    expect(settled.length).toBeGreaterThan(0)
    expect(settled.every(p => p.z < 0.08)).toBe(true)
    expect(settled.some(p => p.alpha < 1)).toBe(true)
    expect(fx.sample(scene, 6)).toEqual([])
    expect(fx.active).toBe(false)
  })

  it.each(['level', 'remote', 'still', 'hidden'] as const)('removes effects after %s changes', change => {
    const scene = room(), fx = new DeathEffects()
    fx.observe(scene, true); fx.spawn(scene, death(), 1)
    if (change === 'level') scene.levelKey = 'D:2'
    if (change === 'remote') scene.playerOnLevel = false
    if (change === 'hidden') scene.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    fx.observe(scene, change !== 'still')
    expect(fx.sample(scene, 1.1)).toEqual([])
    expect(fx.active).toBe(false)
  })

  it('bounds simultaneous deaths, deduplicates an actor and clips debris at walls and hidden cells', () => {
    const scene = room(), fx = new DeathEffects()
    fx.observe(scene, true)
    expect(fx.spawn(scene, death(), 1)).toBe(true)
    expect(fx.spawn(scene, death(), 1.01)).toBe(false)
    scene.cells.get(cellKey(1, 0))!.occluder = true
    scene.cells.get(cellKey(0, 1))!.visibility = 'remembered'
    for (let i = 2; i < 100; i++) fx.spawn(scene, death('bone', i), 1)
    const particles = fx.sample(scene, 1.4)
    expect(particles.length).toBeLessThanOrEqual(24 * 96)
    expect(particles.every(p => {
      const c = scene.cells.get(cellKey(Math.round(p.x), Math.round(p.y)))
      return c?.visibility === 'visible' && !c.occluder && p.z >= 0 && p.alpha <= 1
    })).toBe(true)
  })

  it('gives spectral enemies pixel wisps, slimes floor splats and skeletons bone shards', () => {
    const scene = room()
    const sample = (kind: DeathKind, t: number) => {
      const fx = new DeathEffects(); fx.observe(scene, true); fx.spawn(scene, death(kind), 1)
      return fx.sample(scene, 1 + t)
    }
    expect(sample('spirit', 0.7).every(p => p.sprite === 'wisp' && !p.ground && p.z > 0.3)).toBe(true)
    expect(sample('slime', 1).every(p => p.sprite === 'splat' && p.ground)).toBe(true)
    expect(sample('bone', 1).every(p => p.sprite === 'shard' && !p.ground)).toBe(true)
  })

  it('throws larger flesh gibs, leaves blood below actors and dissolves the residue after a short lifetime', () => {
    const scene = room(), fx = new DeathEffects()
    fx.observe(scene, true); fx.spawn(scene, death(), 1)
    const spray = fx.sample(scene, 1.2)
    expect(spray.length).toBeGreaterThan(50)
    expect(spray.filter(p => p.sprite === 'gib').length).toBeGreaterThanOrEqual(6)
    expect(spray.some(p => p.sprite === 'drop' && !p.ground && p.z > 0.2)).toBe(true)
    expect(spray.some(p => p.ground && p.sprite === 'splat' && p.size >= 0.3)).toBe(true)
    const remains = fx.sample(scene, 2.5)
    expect(remains.filter(p => p.ground).length).toBeGreaterThan(20)
    expect(remains.every(p => p.z < 0.08)).toBe(true)
    expect(fx.sample(scene, 5.3).some(p => p.ground && p.alpha > 0 && p.alpha < 1)).toBe(true)
    expect(fx.sample(scene, 5.7)).toEqual([])
    expect(fx.active).toBe(false)
  })

  it('uses complete pixel masks and a stable dissolve covering all sixteen texel thresholds', () => {
    for (const rows of Object.values(DEATH_ART)) {
      expect(rows).toHaveLength(DEATH_TEXELS)
      expect(rows.every(row => row.length === DEATH_TEXELS && /^[0-5]+$/.test(row))).toBe(true)
      expect(rows.some(row => row.includes('1') && row.includes('4'))).toBe(true)
    }
    const thresholds = Array.from({ length: 16 }, (_, i) => deathDither(i % 4, Math.floor(i / 4)))
    expect(new Set(thresholds).size).toBe(16)
    expect(Math.min(...thresholds)).toBeGreaterThan(0)
    expect(Math.max(...thresholds)).toBeLessThan(1)
  })
})
