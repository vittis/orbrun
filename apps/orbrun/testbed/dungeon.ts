import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, makeCamera } from '@orbrun/scene'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'

const tiles = await loadRoomTiles()
const { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 1 },
  { x: 10, y: 4, tile: 4274, kind: 'item', height: 0.6 },
  { x: 12, y: 6, tile: 4631, kind: 'item', height: 0.6 },
  { x: 9, y: 3, tile: 7189, kind: 'monster', height: 0.8, attitude: 'hostile' },
  { x: 13, y: 4, tile: 7114, kind: 'monster', height: 1, attitude: 'friendly' },
)
for (const cell of scene.cells.values()) {
  if (cell.x < 5) cell.visibility = 'remembered'
  if (cell.x >= 14 && cell.x <= 16 && cell.y >= 5 && cell.y <= 6 && !cell.occluder) {
    cell.flags.lava = true
    cell.flags.water = false
    cell.floorTile = 617 // local packed art; the live game supplies its lava tiles
  }
}
const canvas = document.querySelector<HTMLCanvasElement>('#view')!
const renderer = new Render25d({ center: { x: 9, y: 4 }, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches })
renderer.mount(canvas)
renderer.setTiles(tiles)
renderer.setScene(scene)
renderer.setCamera(makeCamera(11, 5))
const animate = document.querySelector<HTMLInputElement>('#animate')!
animate.checked = !matchMedia('(prefers-reduced-motion: reduce)').matches
let raf = 0
function frame(now: number) {
  raf = 0
  renderer.render(now / 1000)
  if (renderer.animating) raf = requestAnimationFrame(frame)
}
function wake() { if (!raf) raf = requestAnimationFrame(frame) }
function fit() {
  const rect = canvas.getBoundingClientRect()
  renderer.resize(rect.width, rect.height, devicePixelRatio)
  wake()
}
new ResizeObserver(fit).observe(canvas)
for (const id of ['tilt', 'zoom', 'animate']) document.getElementById(id)!.addEventListener('change', () => {
  renderer.setOptions({ tilt: Number((document.getElementById('tilt') as HTMLSelectElement).value), zoom: Number((document.getElementById('zoom') as HTMLSelectElement).value), animate: animate.checked })
  wake()
})
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect()
  const key = renderer.pick(event.clientX - rect.left, event.clientY - rect.top)
  const cell = key === null ? null : scene.cells.get(key)
  renderer.setCursor(cell ? { x: cell.x, y: cell.y, mode: 'examine' } : null)
  document.getElementById('cell')!.textContent = cell ? `${cell.x}, ${cell.y} · ${cell.visibility} ${cell.kind}` : '—'
  wake()
})
canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect()
  const key = renderer.pick(event.clientX - rect.left, event.clientY - rect.top)
  const cell = key === null ? null : scene.cells.get(key)
  if (!cell || cell.occluder || cell.visibility !== 'visible') return
  const player = scene.billboards.find(b => b.kind === 'player')!
  player.x = cell.x
  player.y = cell.y
  scene.player = { x: cell.x, y: cell.y }
  renderer.setScene({ ...scene, revision: ++scene.revision })
  wake()
})
fit()
// Exposed only in this testbed for deterministic browser captures and picking checks.
Object.assign(window, { renderer, scene, tiles, canvas, cellKey, __ready: true })
