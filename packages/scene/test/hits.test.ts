import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, HitEffects } from '../src/index.js'

function world() {
  const scene = emptyScene()
  scene.playerOnLevel = true
  scene.levelKey = 'D:1'
  for (const x of [0, 1, 2]) scene.cells.set(cellKey(x, 0), { x, y: 0, kind: 'floor', visibility: 'visible', occluder: false })
  scene.billboards = [{ id: 7, x: 1, y: 0, tile: 1, kind: 'monster', height: 1 }]
  const hits = new HitEffects()
  hits.observe(scene, true)
  return { hits, scene }
}

describe('entity hit flashes', () => {
  it('waits for contact, follows identity through movement, and fully restores brightness', () => {
    const { hits, scene } = world()
    hits.spawn(scene, { x: 1, y: 0, actorId: 'id:7' }, 1.1)
    expect(hits.brightness('id:7', 1.09)).toBe(1)
    expect(hits.brightness('id:7', 1.12)).toBeGreaterThan(1)
    scene.billboards[0].x = 2
    hits.tick(scene, 1.14)
    expect(hits.brightness('id:7', 1.14)).toBeGreaterThan(1)
    expect(hits.brightness('id:8', 1.14)).toBe(1)
    expect(hits.brightness('id:7', 1.26)).toBe(1)
    hits.tick(scene, 1.27)
    expect(hits.active).toBe(false)
  })

  it('tracks a changing projectile contact clock and coalesces reports without stacking brightness', () => {
    const { hits, scene } = world()
    let contact = 1.1
    const effect = { x: 1, y: 0, actorId: 'id:7', turn: 1 }
    hits.spawn(scene, effect, 1, () => contact)
    expect(hits.spawn(scene, effect, 1.01)).toBe(false)
    contact = 1.2
    hits.tick(scene, 1.19)
    expect(hits.brightness('id:7', 1.19)).toBe(1)
    const brightness = hits.brightness('id:7', 1.22)
    expect(brightness).toBeGreaterThan(1)
    hits.spawn(scene, { ...effect, turn: 2 }, 1.2)
    expect(hits.brightness('id:7', 1.22)).toBe(brightness)
    expect(brightness).toBeLessThan(1.55)
  })

  it.each(['level', 'remote', 'still', 'hidden', 'despawn'] as const)('clears flashes on %s', reset => {
    const { hits, scene } = world()
    hits.spawn(scene, { x: 1, y: 0 }, 1)
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'hidden') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    if (reset === 'despawn') scene.billboards = []
    hits.observe(scene, reset !== 'still')
    hits.tick(scene, 1.03)
    expect(hits.active).toBe(false)
    expect(hits.brightness('id:7', 1.03)).toBe(1)
  })
})
