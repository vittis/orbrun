import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { cellKey, makeCamera, type TileSource } from '@orbrun/scene'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles, RoomTiles } from '../src/room/tiles'
import { readScene, type PlaceFile } from '../src/room/place-data'

const tiles = await loadRoomTiles()
let { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 0.7 },
  { x: 10, y: 4, tile: 4274, kind: 'item', height: 0.6 },
  { x: 12, y: 6, tile: 4631, kind: 'item', height: 0.6 },
  { x: 9, y: 3, tile: 7189, kind: 'monster', height: 0.4, attitude: 'hostile' },
  { x: 13, y: 4, tile: 7114, kind: 'monster', height: 0.5, attitude: 'friendly' },
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
const original = new Render2d({ center: { x: 9, y: 4 } })
original.mount(canvas)
original.setTiles(tiles)
original.setScene(scene)
original.setCamera(makeCamera(11, 5))
const flat = document.querySelector<HTMLInputElement>('#original')!
const animate = document.querySelector<HTMLInputElement>('#animate')!
animate.checked = !matchMedia('(prefers-reduced-motion: reduce)').matches
let raf = 0
function frame(now: number) {
  raf = 0
  if (flat.checked) original.render()
  else renderer.render(now / 1000)
  if (!flat.checked && renderer.animating) raf = requestAnimationFrame(frame)
}
function wake() { if (!raf) raf = requestAnimationFrame(frame) }
function fit() {
  const rect = canvas.getBoundingClientRect()
  renderer.resize(rect.width, rect.height, devicePixelRatio)
  original.resize(rect.width, rect.height, devicePixelRatio)
  const tilt = Number((document.getElementById('tilt') as HTMLSelectElement).value) * Math.PI / 180
  const zoom = Number((document.getElementById('zoom') as HTMLSelectElement).value)
  original.setOptions({ cellSize: fittedScale(rect.width, rect.height, tilt, zoom) })
  wake()
}
new ResizeObserver(fit).observe(canvas)
for (const id of ['tilt', 'zoom', 'animate', 'original']) document.getElementById(id)!.addEventListener('change', () => {
  renderer.setOptions({ tilt: Number((document.getElementById('tilt') as HTMLSelectElement).value), zoom: Number((document.getElementById('zoom') as HTMLSelectElement).value), animate: animate.checked })
  fit()
})
const roomScene = scene
document.getElementById('scene')!.addEventListener('change', async () => {
  const id = (document.getElementById('scene') as HTMLSelectElement).value
  let source: TileSource = tiles
  if (id === 'room') scene = roomScene
  else {
    const [file, image] = await Promise.all([
      fetch(`/room/places/${id}.json`).then(response => response.json() as Promise<PlaceFile>),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = `/room/places/${id}.png`
      }),
    ])
    const place = RoomTiles.fromPlace(file, image)
    source = {
      tile: tile => tile === -1 ? { ...tiles.tile(4519)!, atlas: 'preview-player' } : place.tile(tile),
      atlas: name => name === 'preview-player' ? tiles.atlas('room') : place.atlas(name),
      atlasNames: () => [...place.atlasNames(), 'preview-player'],
    }
    scene = readScene(file.scene)
    scene.billboards = [...scene.billboards, { ...scene.player, tile: -1, kind: 'player', height: 0.7 }]
  }
  const center = id === 'room' ? { x: 9, y: 4 } : scene.player
  renderer.setTiles(source)
  renderer.setScene(scene)
  renderer.setOptions({ center })
  original.setTiles(source)
  original.setScene(scene)
  original.setOptions({ center })
  original.setCamera(makeCamera(scene.player.x, scene.player.y))
  fit()
})
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect()
  const key = (flat.checked ? original : renderer).pick(event.clientX - rect.left, event.clientY - rect.top)
  const cell = key === null ? null : scene.cells.get(key)
  renderer.setCursor(cell ? { x: cell.x, y: cell.y, mode: 'examine' } : null)
  original.setCursor(cell ? { x: cell.x, y: cell.y, mode: 'examine' } : null)
  document.getElementById('cell')!.textContent = cell ? `${cell.x}, ${cell.y} · ${cell.visibility} ${cell.kind}` : '—'
  wake()
})
canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect()
  const key = (flat.checked ? original : renderer).pick(event.clientX - rect.left, event.clientY - rect.top)
  const cell = key === null ? null : scene.cells.get(key)
  if (!cell || cell.occluder || cell.visibility !== 'visible') return
  const player = scene.billboards.find(b => b.kind === 'player')!
  player.x = cell.x
  player.y = cell.y
  scene.player = { x: cell.x, y: cell.y }
  renderer.setScene({ ...scene, revision: ++scene.revision })
  original.setScene(scene)
  original.setCamera(makeCamera(scene.player.x, scene.player.y))
  wake()
})
fit()
// Exposed only in this testbed for deterministic browser captures and picking checks.
Object.assign(window, { renderer, scene, tiles, canvas, cellKey, __ready: true })
