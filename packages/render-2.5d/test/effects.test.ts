import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type Billboard, type MeleeAttack, type Scene } from '@orbrun/scene'
import { DungeonEffects } from '../src/effects.js'

function world(): Scene {
  const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
  for (let x = 0; x < 4; x++) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  return scene
}
const attack: MeleeAttack = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, style: 'slash', hit: true }
const player: Billboard = { x: 0, y: 0, kind: 'player', tile: 1, height: 1 }
const target: Billboard = { x: 1, y: 0, kind: 'monster', tile: 2, height: 1 }
const spell = (x = 1): Billboard => ({ x, y: 0, kind: 'projectile', tile: 3, height: 1,
  life: { lights: [{ colour: [255, 118, 30], radius: 2.8, power: 0.45, pulse: 'fire', transient: true }] } })

describe('bounded dungeon combat presentation', () => {
  it('lunges and recoils without changing confirmed cells, settles, and ignores miss recoil', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.melee(scene, attack, 1)
    expect(fx.offset(player, 1.1).x).toBeGreaterThan(0)
    expect(fx.offset(target, 1.1).x).toBeGreaterThan(0)
    expect(player.x).toBe(0); expect(target.x).toBe(1)
    expect(fx.offset({ ...player, life: { held: true } }, 1.1).x).toBe(0)
    fx.tick(scene, 2)
    expect(fx.strokes).toHaveLength(0)
    expect(fx.offset(player, 2)).toEqual({ x: 0, y: 0 })
    fx.melee(scene, { ...attack, hit: false }, 2)
    expect(fx.offset(target, 2.1)).toEqual({ x: 0, y: 0 })
    expect(fx.offset(player, 2.1).x).toBeGreaterThan(0)
  })

  it('deduplicates rapid reports, caps history and motion, and refuses hidden targets', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.melee(scene, attack, 1); fx.melee(scene, attack, 1.03)
    expect(fx.strokes).toHaveLength(1)
    for (let i = 0; i < 100; i++) fx.melee(scene, attack, 2 + i * 0.1)
    expect(fx.strokes.length).toBeLessThanOrEqual(12)
    expect(Math.hypot(...Object.values(fx.offset(player, 11.96)))).toBeLessThanOrEqual(0.12)
    scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    fx.tick(scene, 12)
    expect(fx.strokes).toHaveLength(0)
    expect(fx.melee(scene, attack, 12)).toBe(false)
  })

  it('leaves one trace when a confirmed spell disappears, with no refresh on unrelated updates', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.billboards = [spell()]
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, revision: 1 }, 0.1, true)
    expect(fx.traces).toHaveLength(0)
    fx.observe({ ...scene, billboards: [], revision: 2 }, 0.2, true)
    expect(fx.traces).toHaveLength(1)
    fx.observe({ ...scene, billboards: [], revision: 3 }, 1, true)
    expect(fx.traces[0].born).toBe(0.2)
    fx.tick(scene, 3.1)
    expect(fx.traces).toHaveLength(0)
  })

  it('clears histories across levels, still mode, remote maps, and loss of visibility', () => {
    for (const reset of ['level', 'still', 'remote', 'visibility']) {
      const fx = new DungeonEffects(), scene = world()
      scene.billboards = [spell()]
      fx.observe(scene, 0, true)
      fx.observe({ ...scene, billboards: [] }, 0.1, true)
      fx.melee(scene, attack, 0.1)
      if (reset === 'level') scene.levelKey = 'D:2'
      if (reset === 'remote') scene.playerOnLevel = false
      if (reset === 'visibility') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
      fx.observe({ ...scene, billboards: [] }, 0.15, reset !== 'still')
      expect(fx.strokes).toHaveLength(0)
      expect(fx.traces).toHaveLength(0)
    }
  })
})
