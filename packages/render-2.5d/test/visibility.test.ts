import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type SceneCell } from '@orbrun/scene'
import { DungeonVisibility, MEMORY_DARKNESS } from '../src/visibility.js'

function world(visibility: SceneCell['visibility'] = 'visible') {
  const cell: SceneCell = { x: 0, y: 0, kind: 'floor', occluder: false, visibility, floorTile: 1, flags: { water: false, lava: false } as SceneCell['flags'] }
  const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true, cells: new Map([[cellKey(0, 0), cell]]) }
  const fade = new DungeonVisibility()
  fade.observe(scene, 0, true)
  return { cell, scene, fade }
}

describe('LOS brightness transitions', () => {
  it('snaps the initial view and fades a mutable cell into memory', () => {
    const { fade, scene, cell } = world()
    expect(fade.darkness(cell, 0)).toBe(0)
    expect(fade.moving(cell, 0)).toBe(false)
    cell.visibility = 'remembered'
    fade.observe(scene, 1, true)
    expect(fade.darkness(cell, 1)).toBe(0)
    expect(fade.darkness(cell, 1.11)).toBeCloseTo(MEMORY_DARKNESS / 2)
    expect(fade.darkness(cell, 1.22)).toBe(MEMORY_DARKNESS)
    expect(fade.moving(cell, 1.1)).toBe(true)
    expect(fade.moving(cell, 1.22)).toBe(false)
  })

  it('brightens remembered terrain continuously and does not restart on repeated observations', () => {
    const { fade, scene, cell } = world('remembered')
    cell.visibility = 'visible'; fade.observe(scene, 1, true)
    fade.observe(scene, 1.1, true)
    const frames = Array.from({ length: 28 }, (_, i) => fade.darkness(cell, 1 + i / 120))
    expect(frames[0]).toBe(MEMORY_DARKNESS)
    expect(frames.at(-1)).toBe(0)
    expect(new Set(frames).size).toBeGreaterThan(20)
    expect(frames.every((v, i) => !i || v <= frames[i - 1])).toBe(true)
  })

  it('reverses in place during rapid LOS changes without a brightness jump', () => {
    const { fade, scene, cell } = world()
    cell.visibility = 'remembered'; fade.observe(scene, 1, true)
    const before = fade.darkness(cell, 1.08)
    cell.visibility = 'visible'; fade.observe(scene, 1.08, true)
    expect(fade.darkness(cell, 1.08)).toBe(before)
    expect(fade.darkness(cell, 1.12)).toBeLessThan(before)
    expect(fade.darkness(cell, 1.31)).toBe(0)
    expect(cell.visibility).toBe('visible')
  })

  it('reveals newly known cells from black without retaining hidden state', () => {
    const { fade, scene, cell } = world('unseen')
    cell.visibility = 'visible'; fade.observe(scene, 1, true)
    expect(fade.darkness(cell, 1)).toBe(1)
    expect(fade.darkness(cell, 1.11)).toBeCloseTo(0.5)
    cell.visibility = 'unseen'; fade.observe(scene, 1.12, true)
    expect(fade.moving(cell, 1.12)).toBe(false)
    cell.visibility = 'visible'; fade.observe(scene, 1.13, true)
    expect(fade.darkness(cell, 1.13)).toBe(1)
  })

  it.each(['level', 'remote', 'disabled', 'clear'] as const)('snaps across %s changes', reset => {
    const { fade, scene, cell } = world()
    cell.visibility = 'remembered'; fade.observe(scene, 1, true)
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'clear') fade.clear()
    fade.observe(scene, 1.05, reset !== 'disabled')
    expect(fade.darkness(cell, 1.05)).toBe(MEMORY_DARKNESS)
    expect(fade.moving(cell, 1.05)).toBe(false)
  })

  it('finishes ongoing fades immediately when animation stops', () => {
    const { fade, scene, cell } = world('remembered')
    cell.visibility = 'visible'; fade.observe(scene, 1, true)
    fade.finish()
    expect(fade.darkness(cell, 1.01)).toBe(0)
    expect(fade.moving(cell, 1.01)).toBe(false)
  })
})
