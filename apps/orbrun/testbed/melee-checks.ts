import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, meleeTiming, type MeleeAttack, type TileSource } from '@orbrun/scene'
import { drawMelee } from '../../../packages/render-2.5d/src/melee-draw'
import type { MeleeVariant } from '../../../packages/render-2.5d/src/melee-path'
import { captures, matrix, fixtureYield, releaseCanvas } from './fixture'

/** Compare the isolated gesture with real dungeon pixels at a visibility edge.
 * Black terrain makes clipped weapon pixels observable without screenshot
 * baselines or relying on the renderer's internal clipping implementation. */
export async function meleeChecks() {
  const failures: unknown[] = []
  let checks = 0
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
  const ink = atlas.getContext('2d')!; ink.fillStyle = '#000'; ink.fillRect(0, 0, 32, 32)
  const source: TileSource = {
    tile: () => ({ atlas: 'black', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
    atlas: () => atlas, atlasNames: () => ['black'],
  }
  const width = 360, height = 266
  for (const style of matrix<MeleeAttack['style']>(['cleave', 'lash', 'crush'], ['cleave']))
    for (const degrees of matrix([35, 65], [50]))
      for (const variant of matrix<MeleeVariant>([0, 1, 2], [0, 1]))
        for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]])
          for (const hit of [true, false]) {
    const canvas = document.createElement('canvas'), reference = document.createElement('canvas')
    reference.width = width; reference.height = height
    const ctx = canvas.getContext('2d')!, ref = reference.getContext('2d')!
    const r = new Render25d({ tilt: degrees, meleeMotion: 0, movement: false, center: { x: 0, y: 0 } })
    r.mount(canvas); r.resize(width, height, 1); r.setTiles(source)
    const scene = emptyScene(); scene.playerOnLevel = true
    // Only the two combat cells are visible: a doorway / edge of explored LOS.
    for (const [x, y] of [[0, 0], [dx, dy]]) scene.cells.set(cellKey(x, y), {
      x, y, kind: 'floor', visibility: 'visible', floorTile: 1, occluder: false,
      flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
    })
    r.setScene(scene, 0)
    const attack = { from: { x: 0, y: 0 }, to: { x: dx, y: dy }, style, hit, intensity: 'solid' as const }
    // Deterministic accepted gesture, just as the existing preview's variant selector.
    const random = Math.random
    try { Math.random = () => (variant + 0.5) / 3; r.melee(attack, 1) } finally { Math.random = random }
    const tilt = degrees * Math.PI / 180
    const p = { x: 0, y: 0, width, height, tilt, scale: fittedScale(width, height, tilt) }
    const stroke = { ...attack, born: 1, duration: meleeTiming(style).duration, variant, heading: { x: dx, y: dy } }
    for (const phase of [0.35, 0.44]) {
      const time = 1 + phase * stroke.duration
      r.render(time); ref.clearRect(0, 0, width, height); drawMelee(ref, p, stroke, time)
      const expected = ref.getImageData(0, 0, width, height).data
      const actual = ctx.getImageData(0, 0, width, height).data
      let solid = 0, missing = 0
      for (let i = 0; i < expected.length; i += 4) {
        if (expected[i + 3] < 160 || Math.max(expected[i], expected[i + 1], expected[i + 2]) < 100) continue
        solid++
        if (Math.max(actual[i], actual[i + 1], actual[i + 2]) < 30) missing++
      }
      checks++
      if (!solid || missing) failures.push({ style, degrees, variant, dx, dy, hit, phase, solid, missing })
      if (captures && style === 'cleave' && variant === 0 && dx === 0 && dy === -1 && phase === 0.44) {
        const copy = document.createElement('canvas'); copy.width = width; copy.height = height
        copy.getContext('2d')!.drawImage(canvas, 0, 0); document.querySelector('#captures')!.append(copy)
      }
    }
    r.destroy(); releaseCanvas(canvas); releaseCanvas(reference)
    await fixtureYield('melee-checks')
  }
  releaseCanvas(atlas)
  return { checks, failures }
}
