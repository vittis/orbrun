import { describe, expect, it } from 'vitest'
import { cellKey, DeathEffects, emptyScene, type DeathEffect, type DeathKind, type SceneCell } from '../src/index.js'

const death = (kind: DeathKind = 'flesh', id = 1): DeathEffect => ({ actorId: 'id:' + id, kind, x: 0, y: 0, height: 0.8, direction: { x: 1, y: 0 } })
function room() {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, floorTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  return scene
}

describe('enemy death presentation', () => {
  it('retains a delayed killing blow, then bursts, lands and fades without timers', () => {
    const scene = room(), fx = new DeathEffects()
    fx.observe(scene, true)
    fx.spawn(scene, death('bone'), 1.15)
    expect(fx.sample(scene, 1)).toEqual([])
    expect(fx.active).toBe(true)
    const burst = fx.sample(scene, 1.2)
    expect(burst.some(p => p.shape === 'ring')).toBe(true)
    expect(burst.filter(p => p.shape === 'chip').length).toBeGreaterThan(15)
    const settled = fx.sample(scene, 2.5)
    expect(settled.length).toBeGreaterThan(0)
    expect(settled.every(p => p.z < 0.08)).toBe(true)
    expect(settled.some(p => p.alpha < 1)).toBe(true)
    expect(fx.sample(scene, 4)).toEqual([])
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
    expect(particles.length).toBeLessThanOrEqual(24 * 32)
    expect(particles.every(p => {
      const c = scene.cells.get(cellKey(Math.round(p.x), Math.round(p.y)))
      return c?.visibility === 'visible' && !c.occluder && p.z >= 0 && p.alpha <= 1
    })).toBe(true)
  })

  it('gives spectral enemies rising wisps and slimes round splashes rather than bone chips', () => {
    const scene = room()
    const sample = (kind: DeathKind, t: number) => {
      const fx = new DeathEffects(); fx.observe(scene, true); fx.spawn(scene, death(kind), 1)
      return fx.sample(scene, 1 + t)
    }
    expect(sample('spirit', 0.7).every(p => p.shape === 'mote' && p.z > 0.3)).toBe(true)
    expect(sample('slime', 1).every(p => p.shape === 'mote' && p.stretch === 2.2)).toBe(true)
    expect(sample('bone', 1).every(p => p.shape === 'chip' && p.stretch === 2.8)).toBe(true)
  })
})
