import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, type DeathEffect, type SceneCell } from '@orbrun/scene'
import { DeathVfx } from '../src/death-vfx.js'

function room() {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) scene.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, flags: {},
  } as SceneCell)
  return scene
}
const death: DeathEffect = { actorId: 'id:1', kind: 'bone', x: 0, y: 0, height: 0.8, direction: { x: 0, y: -1 } }

describe('instanced death VFX', () => {
  it('writes real instance buffers, stays out of the terrain depth pass and stops drawing after expiry', () => {
    const world = new THREE.Scene(), scene = room(), fx = new DeathVfx(world)
    fx.observe(scene, true); fx.spawn(scene, death, 1)
    fx.update(scene, 1.05)
    expect(world.children).toHaveLength(3)
    for (const object of world.children) {
      const mesh = object as THREE.InstancedMesh
      expect(mesh.count).toBeGreaterThan(0)
      expect(mesh.layers.isEnabled(0)).toBe(false)
      expect(mesh.layers.isEnabled(1)).toBe(true)
      expect(mesh.geometry.getAttribute('iDeathColour').getW(0)).toBeGreaterThan(0)
      expect((mesh.material as THREE.Material).depthWrite).toBe(false)
    }
    fx.update(scene, 4)
    expect(fx.active).toBe(false)
    expect(world.children.every(o => !o.visible && (o as THREE.InstancedMesh).count === 0)).toBe(true)
    fx.destroy()
  })

  it('clears pooled draws for Still mode and disposes GPU resources on teardown', () => {
    const world = new THREE.Scene(), scene = room(), fx = new DeathVfx(world)
    fx.observe(scene, true); fx.spawn(scene, death, 1); fx.update(scene, 1.05)
    const meshes = world.children as THREE.InstancedMesh[]
    const dispose = meshes.map(m => [vi.spyOn(m, 'dispose'), vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')])
    fx.observe(scene, false)
    expect(fx.active).toBe(false)
    expect(meshes.every(m => !m.visible && m.count === 0)).toBe(true)
    fx.destroy()
    expect(world.children).toHaveLength(0)
    expect(dispose.flat().every(spy => spy.mock.calls.length === 1)).toBe(true)
  })
})
