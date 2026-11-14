/** Local stress measurement, outside the test suite. Run with vite-node.
 * Optional argument: a reference movement.ts module for alternating A/B runs. */
import { resolve } from 'node:path'
import { DungeonMovement } from '../../packages/render-2.5d/src/movement'
import { cellKey, emptyScene } from '../../packages/scene/src/index'

const Reference: typeof DungeonMovement = process.argv[2]
  ? (await import(resolve(process.argv[2]))).DungeonMovement : DungeonMovement
const options = { enabled: true, duration: 0.1, easing: 'ease-out' as const }
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const results = []
for (const side of [8, 16, 25]) {
  const scene = emptyScene()
  scene.playerOnLevel = true; scene.levelKey = 'D:1'
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    scene.cells.set(cellKey(x, y), { x, y, kind: 'floor', visibility: 'visible', occluder: false,
      flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false } })
    scene.billboards.push({ kind: 'item', x, y, tile: 2, height: 1 })
  }
  const run = (Movement: typeof DungeonMovement) => {
    const movement = new Movement()
    movement.observe(scene, scene.player, 0, options)
    const start = performance.now()
    for (let frame = 1; frame <= 200; frame++) movement.observe(scene, scene.player, frame * 0.1, options)
    return (performance.now() - start) / 200
  }
  run(Reference); run(DungeonMovement)
  const reference = [], current = []
  for (let sample = 0; sample < 7; sample++) {
    if (sample % 2) { current.push(run(DungeonMovement)); reference.push(run(Reference)) }
    else { reference.push(run(Reference)); current.push(run(DungeonMovement)) }
  }
  results.push({ actors: side * side, referenceMedianMs: median(reference), currentMedianMs: median(current), reference, current })
}
console.log(JSON.stringify({ reference: process.argv[2] ?? 'current (repeatability control)', results }, null, 2))
