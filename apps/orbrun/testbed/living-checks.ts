/** Retained real-browser atmosphere assertions formerly mixed with first-person checks. */
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { cellKey, type MapRenderer } from '@orbrun/scene'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'
const tiles = await loadRoomTiles(), { scene } = antechamberScene(tiles)
const fire = { colour: [255, 118, 30] as [number, number, number], radius: 3.4, power: 0.7, pulse: 'fire' as const }
for (const cell of scene.cells.values()) {
  if (cell.x < 7) cell.visibility = 'remembered'
  cell.life = { motion: cell.flags.water ? 'water' : cell.flags.lava ? 'lava' : undefined }
}
scene.cells.get(cellKey(10, 3))!.life = { motion: 'flame', lights: [fire] }
for (const b of scene.billboards) b.life = { motion: b.scenery ? 'plant' : b.kind === 'monster' ? 'breath' : b.kind === 'cloud' ? 'cloud' : b.kind === 'item' ? 'gold' : undefined }
scene.revision++
const checks: { name: string; passed: boolean }[] = []
const image = (view: MapRenderer, canvas: HTMLCanvasElement, time: number) => { view.render(time); return canvas.toDataURL() }
for (const name of ['Dungeon', 'Flat']) for (const [width, height, dpr] of [[960, 720, 1], [390, 600, 2]]) {
  const canvas = document.createElement('canvas')
  const view = name === 'Dungeon' ? new Render25d({ animate: true }) : new Render2d({ living: true, animate: true, cellSize: 48, center: { x: 11, y: 5 } })
  view.mount(canvas); view.resize(width, height, dpr)
  view.setTiles(tiles); view.setScene(scene, 10)
  const first = image(view, canvas, 10), second = image(view, canvas, 11)
  checks.push({ name: `${name} ${width} DPR${dpr} animated`, passed: first !== second })
  view.setOptions({ animate: false })
  checks.push({ name: `${name} ${width} DPR${dpr} still`, passed: image(view, canvas, 12) === image(view, canvas, 14) })
  view.setOptions({ animate: true })
  const before = image(view, canvas, 20.4)
  view.impact(11, 5, 1, 20)
  checks.push({ name: `${name} ${width} DPR${dpr} impact`, passed: before !== image(view, canvas, 20.4) })
  canvas.style.width = Math.min(width, 480) + 'px'
  document.getElementById('captures')!.append(canvas)
  view.destroy()
}
document.getElementById('result')!.textContent = JSON.stringify({ checks: checks.length, failures: checks.filter(c => !c.passed), results: checks }, null, 2)
