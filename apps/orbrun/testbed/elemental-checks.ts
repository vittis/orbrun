import { cellKey, emptyScene, type DamageType, type SceneCell } from '@orbrun/scene'
import { DungeonDeaths, type DeathParticle } from '../../../packages/render-2.5d/src/death'
import { DeathArt } from '../../../packages/render-2.5d/src/death-draw'
import { sampleHitSpray } from '../../../packages/render-2.5d/src/hit-spray'
import type { Projection } from '../../../packages/render-2.5d/src/projection'
import { captures, fixtureStart, fixtureComplete, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('elemental-checks')
const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }, art = new DeathArt()
for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
  x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1, flags: { water: false, lava: false },
} as SceneCell)
const origin = { x: 0, y: 0 }, direction = { x: 1, y: 0 }
const checks: { label: string; passed: boolean; changed?: number; bright?: number; bends?: number }[] = []
function sample(tone: DamageType, death: boolean) {
  if (!death) return sampleHitSpray(scene, { ...origin, kind: tone, intensity: 'solid', born: 0, requested: 0, duration: 0.3, source: 'confirmed',
    spray: { kind: 'flesh', source: 'ranged', height: 1, seed: 7, direction } }, 0.12, undefined, 1, 1, 0.25)
  const deaths = new DungeonDeaths()
  deaths.observe(scene, true)
  deaths.spawn(scene, { ...origin, actorId: 'id:7', height: 1, kind: 'flesh', tone, intensity: 'solid', direction }, 0)
  return deaths.sample(scene, 0.18, 0.5, 0.75, 0.25)
}
function draw(particles: DeathParticle[], scale: number) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 160
  const ctx = canvas.getContext('2d')!
  const p: Projection = { x: 0, y: 0, width: 192, height: 160, scale, tilt: 50 * Math.PI / 180 }
  ctx.fillStyle = '#181820'; ctx.fillRect(0, 0, 192, 160)
  for (const particle of [...particles].sort((a, b) => Number(b.ground) - Number(a.ground))) art.draw(ctx, p, scene, particle, 1)
  return { canvas, data: ctx.getImageData(0, 0, 192, 160).data }
}
function retain(canvas: HTMLCanvasElement, label: string) {
  if (!captures) { releaseCanvas(canvas); return }
  const figure = document.createElement('figure'), caption = document.createElement('figcaption')
  caption.textContent = label; figure.append(caption, canvas); document.querySelector('#captures')!.append(figure)
}
for (const scale of [24, 48]) for (const death of [false, true]) {
  const baseline = draw(sample('physical', death), scale)
  for (const kind of ['electric', 'fire', 'cold', 'poison', 'acid', 'magic'] as const) {
    const frame = draw(sample(kind, death), scale)
    let changed = 0, bright = 0
    for (let i = 0; i < frame.data.length; i += 4) {
      if (Math.abs(frame.data[i] - baseline.data[i]) + Math.abs(frame.data[i + 1] - baseline.data[i + 1]) + Math.abs(frame.data[i + 2] - baseline.data[i + 2]) > 20) changed++
      if (frame.data[i] > 235 && frame.data[i + 1] > 235 && frame.data[i + 2] > 225) bright++
    }
    const label = `${kind} ${death ? 'death' : 'hit'} · ${scale}px tiles`
    const luminous = ['electric', 'fire', 'cold', 'magic'].includes(kind)
    const passed = changed > 90 && (!luminous || bright >= (kind === 'electric' ? 12 : 3))
    checks.push({ label, passed, changed, bright })
    retain(frame.canvas, `${label} · ${passed ? 'PASS' : 'FAIL'}`)
    await fixtureYield(label)
  }
  releaseCanvas(baseline.canvas)
}
// Independent raster oracle: white cores must visibly reverse direction more
// than once, rather than rendering as a straight spark, a shard or a brown gib.
for (const sprite of ['lightning', 'lightningFork'] as const) {
  const frame = draw([{ ...origin, z: 0, size: 0.1, angle: 0, stretch: 1, alpha: 1, colour: [95, 180, 255], sprite, ground: false, minPixels: 36 }], 24)
  const centres: number[] = []
  let bright = 0
  for (let y = 0; y < 160; y++) {
    const xs: number[] = []
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4
      if (frame.data[i] > 235 && frame.data[i + 1] > 235 && frame.data[i + 2] > 225) { xs.push(x); bright++ }
    }
    if (xs.length) centres.push(xs.reduce((sum, x) => sum + x, 0) / xs.length)
  }
  const directions = centres.slice(1).map((x, i) => Math.sign(x - centres[i])).filter(Boolean)
  const bends = directions.slice(1).filter((sign, i) => sign !== directions[i]).length
  const passed = bright > 80 && bends >= 2
  checks.push({ label: sprite, passed, bright, bends })
  retain(frame.canvas, `${sprite} · ${passed ? 'PASS' : 'FAIL'}`)
}
fixtureComplete({ checks: checks.length, failures: checks.filter(c => !c.passed) })
