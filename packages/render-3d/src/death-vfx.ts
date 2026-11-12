import * as THREE from 'three'
import { DeathEffects, type DeathEffect, type DeathParticle, type Scene } from '@orbrun/scene'

const CAPACITY = 1024
const vertexShader = `
  attribute vec4 iDeathColour;
  varying vec4 vDeathColour;
  void main() {
    vDeathColour = iDeathColour;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = `
  varying vec4 vDeathColour;
  void main() { gl_FragColor = vDeathColour; }
`

/** Three instanced draws at most; terrain depth occludes every shard and mote. */
export class DeathVfx {
  private effects = new DeathEffects()
  private batches = new Map<DeathParticle['shape'], THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>>()
  private transform = new THREE.Object3D()
  constructor(private parent: THREE.Scene) {}
  get active() { return this.effects.active }

  observe(scene: Scene, animate: boolean) { this.effects.observe(scene, animate); if (!this.active) this.hide() }
  spawn(scene: Scene, effect: DeathEffect, now: number) { return this.effects.spawn(scene, effect, now) }

  private batch(shape: DeathParticle['shape']) {
    let mesh = this.batches.get(shape)
    if (mesh) return mesh
    const geometry = shape === 'chip' ? new THREE.BoxGeometry(2, 1.1, 1)
      : shape === 'mote' ? new THREE.OctahedronGeometry(1, 1) : new THREE.RingGeometry(0.9, 1, 32)
    if (shape === 'ring') geometry.rotateX(-Math.PI / 2)
    geometry.setAttribute('iDeathColour', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage))
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    mesh = new THREE.InstancedMesh(geometry, material, CAPACITY)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0; mesh.frustumCulled = false; mesh.layers.set(1); mesh.renderOrder = 5
    this.parent.add(mesh); this.batches.set(shape, mesh)
    return mesh
  }

  update(scene: Scene, now: number) {
    const particles = this.effects.sample(scene, now)
    this.hide()
    for (const p of particles) {
      const mesh = this.batch(p.shape), i = mesh.count
      if (i >= CAPACITY) continue
      this.transform.position.set(p.x + 0.5, p.z, p.y + 0.5)
      this.transform.rotation.set(p.shape === 'ring' ? 0 : p.angle * 0.7, p.angle, p.shape === 'ring' ? 0 : p.angle * 0.4)
      this.transform.scale.set(p.size * p.stretch, p.size, p.size)
      this.transform.updateMatrix()
      mesh.setMatrixAt(i, this.transform.matrix)
      const colour = mesh.geometry.getAttribute('iDeathColour') as THREE.InstancedBufferAttribute
      colour.setXYZW(i, p.colour[0] / 255, p.colour[1] / 255, p.colour[2] / 255, p.alpha)
      mesh.count++; mesh.visible = true
    }
    for (const mesh of this.batches.values()) if (mesh.count) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.geometry.getAttribute('iDeathColour').needsUpdate = true
    }
  }

  private hide() { for (const mesh of this.batches.values()) { mesh.count = 0; mesh.visible = false } }
  clear() { this.effects.clear(); this.hide() }
  destroy() {
    this.clear()
    for (const mesh of this.batches.values()) { mesh.removeFromParent(); mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose() }
    this.batches.clear()
  }
}
