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

  it.each([[12, 0], [0, -12], [-12, 12], [2, 0]])('settles all LOS changes on an arrival at (%i, %i)', (x, y) => {
    const { fade, scene, cell } = world()
    cell.visibility = 'remembered'; fade.observe(scene, 1, true)
    expect(fade.moving(cell, 1.05)).toBe(true)
    // Mutate the existing position just as producers can mutate scene cells.
    scene.player.x = x; scene.player.y = y
    const arrival: SceneCell = { ...cell, x, y, visibility: 'visible' }
    scene.cells.set(cellKey(x, y), arrival)
    fade.observe(scene, 1.05, true)
    expect(fade.darkness(arrival, 1.05)).toBe(0)
    expect(fade.moving(arrival, 1.05)).toBe(false)
    expect(fade.darkness(cell, 1.05)).toBe(MEMORY_DARKNESS)
    expect(fade.moving(cell, 1.05)).toBe(false)
    // Repeated updates at the destination must not restart a reveal.
    fade.observe(scene, 1.06, true)
    expect(fade.darkness(arrival, 1.06)).toBe(0)
    expect(fade.moving(arrival, 1.06)).toBe(false)
    // Normal LOS changes resume fading after the arrival.
    arrival.visibility = 'remembered'
    fade.observe(scene, 1.1, true)
    expect(fade.darkness(arrival, 1.21)).toBeCloseTo(MEMORY_DARKNESS / 2)
  })

  it.each([[1, 0], [0, -1], [-1, 1]])('keeps first discoveries fading during a step to (%i, %i)', (x, y) => {
    const { fade, scene, cell } = world()
    scene.player.x = x; scene.player.y = y
    const discovery = { ...cell, x, y }
    scene.cells.set(cellKey(x, y), discovery)
    fade.observe(scene, 1, true)
    expect(fade.darkness(discovery, 1)).toBe(1)
    expect(fade.darkness(discovery, 1.11)).toBeCloseTo(0.5)
    expect(fade.moving(discovery, 1.11)).toBe(true)
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
