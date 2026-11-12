// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type SceneCell } from '@orbrun/scene'
import { initialState } from '@orbrun/webtiles'
import { DungeonEffects } from '../../../packages/render-2.5d/src/effects'
import { NearDeath } from '../src/near-death'

function setup(hp = 80) {
  const state = initialState()
  Object.assign(state.player, { hp, hp_max: 100, place: 'Dungeon', depth: 1 })
  const effect = new NearDeath(state)
  const player = (hp: number, now: number, extra = {}) => {
    Object.assign(state.player, { hp }, extra)
    effect.observe(state, { msg: 'player' }, now)
  }
  const opacity = () => Number(effect.root.style.opacity)
  return { state, effect, player, opacity }
}

function room() {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let x = 0; x < 4; x++) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', floorTile: 1, occluder: false,
    flags: {},
  } as SceneCell)
  return scene
}

describe('near-death vignette', () => {
  it('fades in after low-HP damage and disappears while HP stays low, letting the frame loop sleep', () => {
    const { effect, player, opacity } = setup()
    player(25, 1000)
    effect.render(1080, true, false)
    expect(opacity()).toBeCloseTo(0.5)
    effect.render(1160, true, false)
    expect(opacity()).toBe(1)
    effect.render(2480, true, false)
    expect(opacity()).toBeCloseTo(0.25)
    player(25, 3000) // Unrelated player updates never refresh the warning.
    effect.render(3800, true, false)
    expect(effect.root.hidden).toBe(true)
    expect(effect.active).toBe(false)
  })

  it('ignores initial low HP, healing, healthy damage and maximum-HP changes', () => {
    const { effect, player } = setup(20)
    effect.render(200, true, false)
    expect(effect.root.hidden).toBe(true)
    player(25, 1000)
    player(80, 2000)
    player(50, 3000)
    player(20, 4000, { hp_max: 80 })
    expect(effect.active).toBe(false)
  })

  it('uses one envelope for rapid damage and gently refreshes it for a later hit', () => {
    const { effect, player, opacity } = setup()
    player(25, 1000)
    player(24, 1100)
    effect.render(1500, true, false)
    const before = opacity()
    player(20, 1700)
    effect.render(1700, true, false)
    expect(opacity()).toBeLessThan(before)
    expect(opacity()).toBeGreaterThan(0)
    effect.render(1860, true, false)
    expect(opacity()).toBe(1)
    effect.render(4500, true, false)
    expect(effect.active).toBe(false)
  })

  it('hides over menus and remote maps, lowers intensity for reduced motion, and clears on death or a new game', () => {
    const { state, effect, player, opacity } = setup()
    player(25, 1000)
    effect.render(1160, false, false)
    expect(effect.root.hidden).toBe(true)
    effect.render(1160, true, true)
    expect(opacity()).toBe(0.65)
    expect(effect.root.hidden).toBe(false)
    player(0, 1200)
    expect(effect.active).toBe(false)
    effect.observe(state, { msg: 'game_client' }, 2000)
    player(20, 2100)
    expect(effect.active).toBe(false)
  })

  it('removes a view-wide red warning before it can leave tile fire bursts, without mutating the scene', () => {
    const { effect, player } = setup()
    player(25, 1000)
    const scene = room(), fx = new DungeonEffects()
    fx.observe(scene, 0, true)
    for (const cell of scene.cells.values()) cell.flash = { r: 255, g: 64, b: 64, a: 100 }
    const filtered = effect.scene(scene)
    expect(effect.scene(scene)).toBe(filtered)
    expect([...filtered.cells.values()].every(c => !c.flash)).toBe(true)
    expect([...scene.cells.values()].every(c => c.flash)).toBe(true)
    fx.observe(filtered, 1, true)
    for (const cell of scene.cells.values()) delete cell.flash
    fx.observe(scene, 1.01, true)
    expect(fx.bursts).toEqual([])
    fx.spell(scene, { x: 1, y: 0, kind: 'fire' }, 1.02)
    expect(fx.bursts).toMatchObject([{ kind: 'fire' }])
  })

  it('preserves local fire flashes and non-red view flashes, including at low health', () => {
    const { effect, player } = setup()
    player(25, 1000)
    const scene = room()
    scene.cells.get(cellKey(1, 0))!.flash = { r: 255, g: 64, b: 64, a: 100 }
    expect(effect.scene(scene)).toBe(scene)
    const blue = room()
    for (const cell of blue.cells.values()) cell.flash = { r: 64, g: 64, b: 255, a: 100 }
    expect(effect.scene(blue)).toBe(blue)
  })
})
