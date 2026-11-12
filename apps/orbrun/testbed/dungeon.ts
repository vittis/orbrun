import { Render25d, fittedScale, type MovementEasing } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { cellKey, emptyScene, type TileSource, type MeleeAttack, type WoundLevel, type TileLight, type SpellEffect } from '@orbrun/scene'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles, RoomTiles } from '../src/room/tiles'
import { readScene, type PlaceFile } from '../src/room/place-data'

const tiles = await loadRoomTiles()
// Synthetic server-style pickup cursor to inspect alignment with real item art.
const marker = document.createElement('canvas')
marker.width = marker.height = 32
const markerInk = marker.getContext('2d')!
markerInk.strokeStyle = '#00ff00'
markerInk.lineWidth = 1
markerInk.strokeRect(0.5, 0.5, 31, 31)
const spellKinds = ['fire', 'cold', 'electric', 'magic'] as const
const spellColours: TileLight['colour'][] = [[255, 118, 30], [140, 215, 255], [150, 190, 255], [185, 100, 255]]
const spellArt = document.createElement('canvas')
spellArt.width = 128; spellArt.height = 32
const spellInk = spellArt.getContext('2d')!
for (let i = 0; i < 4; i++) {
  spellInk.fillStyle = `rgb(${spellColours[i].join(',')})`
  spellInk.beginPath(); spellInk.moveTo(i * 32 + 2, 16); spellInk.lineTo(i * 32 + 17, 11)
  spellInk.lineTo(i * 32 + 30, 16); spellInk.lineTo(i * 32 + 17, 21); spellInk.fill()
  spellInk.fillStyle = '#fff1d5'; spellInk.fillRect(i * 32 + 11, 15, 17, 2)
}
const spellTile = (id: number) => id <= -3 && id >= -6 ? { atlas: 'preview-spells', sx: (-id - 3) * 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 } : undefined
const roomSource: TileSource = {
  tile: id => spellTile(id) ?? (id === -2 ? { atlas: 'preview-marker', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 } : tiles.tile(id)),
  atlas: name => name === 'preview-spells' ? spellArt : name === 'preview-marker' ? marker : tiles.atlas(name),
  atlasNames: () => [...tiles.atlasNames(), 'preview-marker', 'preview-spells'],
}
let { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 0.7 },
  { x: 10, y: 4, tile: 4274, kind: 'item', height: 0.6 },
  { x: 12, y: 6, tile: 4631, kind: 'item', height: 0.6 },
  { x: 9, y: 3, tile: 7189, kind: 'monster', height: 0.4, attitude: 'hostile' },
  { x: 13, y: 4, tile: 7114, kind: 'monster', height: 0.5, attitude: 'friendly' },
  { x: 7, y: 3, tile: 4519, kind: 'doll', scenery: true, height: 1,
    life: { motion: 'flame', lights: [{ colour: [255, 158, 64], radius: 4.2, power: 0.7, pulse: 'fire' }] } },
)
for (const b of scene.billboards.filter(b => b.kind === 'item' && !b.lying)) {
  const c = scene.cells.get(cellKey(b.x, b.y))!
  c.cursorTile = -2
  c.icons = [...(c.icons ?? []), -2]
}
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
renderer.setTiles(roomSource)
renderer.setScene(scene)
const original = new Render2d({ center: { x: 9, y: 4 } })
original.mount(canvas)
original.setTiles(roomSource)
original.setScene(scene)
const flat = document.querySelector<HTMLInputElement>('#original')!
const animate = document.querySelector<HTMLInputElement>('#animate')!
animate.checked = !matchMedia('(prefers-reduced-motion: reduce)').matches
let raf = 0
// Optional deterministic effect frame for real-canvas captures, without mutating
// renderer state from browser automation. Normal preview playback stays live.
const effectFrame = Number(new URLSearchParams(location.search).get('effectFrame')) || 0
let captureTime: number | null = null
function frame(now: number) {
  raf = 0
  if (flat.checked) original.render()
  else renderer.render(captureTime ?? now / 1000)
  if (!flat.checked && captureTime === null && renderer.animating) raf = requestAnimationFrame(frame)
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
for (const id of ['tilt', 'zoom', 'animate', 'original', 'duration', 'easing']) document.getElementById(id)!.addEventListener('change', () => {
  const duration = Number((document.getElementById('duration') as HTMLSelectElement).value)
  renderer.setOptions({ tilt: Number((document.getElementById('tilt') as HTMLSelectElement).value), zoom: Number((document.getElementById('zoom') as HTMLSelectElement).value), animate: animate.checked,
    movement: duration > 0, movementDuration: duration || 0.1, movementEasing: (document.getElementById('easing') as HTMLSelectElement).value as MovementEasing })
  fit()
})
const roomScene = scene
const corridorScene = emptyScene()
corridorScene.playerOnLevel = true
// A one-cell east–west passage with a north–south junction, using the same room art.
for (let y = -4; y <= 4; y++) for (let x = -8; x <= 8; x++) {
  const wall = !(y === 0 && x > -8 && x < 8 || x === 5 && y > -4 && y < 4)
  corridorScene.cells.set(cellKey(x, y), {
    x, y, kind: wall ? 'wall' : 'floor', visibility: 'visible', occluder: wall,
    floorTile: 4, wallTile: 1113,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
}
corridorScene.billboards = [
  { x: 0, y: 0, tile: 4519, kind: 'player', height: 0.7 },
  { x: -2, y: 0, tile: 4274, kind: 'item', height: 0.6 },
  { x: 2, y: 0, tile: 7189, kind: 'monster', height: 0.4, attitude: 'hostile' },
]
document.getElementById('scene')!.addEventListener('change', async () => {
  const id = (document.getElementById('scene') as HTMLSelectElement).value
  let source: TileSource = roomSource
  if (id === 'room') scene = roomScene
  else if (id === 'corridor') scene = corridorScene
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
      tile: tile => spellTile(tile) ?? (tile === -1 ? { ...tiles.tile(4519)!, atlas: 'preview-player' } : place.tile(tile)),
      atlas: name => name === 'preview-spells' ? spellArt : name === 'preview-player' ? tiles.atlas('room') : place.atlas(name),
      atlasNames: () => [...place.atlasNames(), 'preview-player', 'preview-spells'],
    }
    scene = readScene(file.scene)
    scene.billboards = [...scene.billboards, { ...scene.player, tile: -1, kind: 'player', height: 0.7 }]
  }
  const center = id === 'room' ? { x: 9, y: 4 } : scene.player
  scene.levelKey = id
  renderer.setTiles(source)
  renderer.setOptions({ center })
  renderer.setScene(scene)
  original.setTiles(source)
  original.setScene(scene)
  original.setOptions({ center })
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
  wake()
})
let moveDirection = 1
let dimmedLOS = false
document.getElementById('travel')!.addEventListener('click', () => {
  const [dx, dy] = (document.getElementById('travel-direction') as HTMLSelectElement).value.split(',').map(Number)
  const next = [4, 3, 2].map(distance => scene.cells.get(cellKey(scene.player.x + dx * distance, scene.player.y + dy * distance)))
    .find(cell => cell?.visibility === 'visible' && !cell.occluder)
  if (!next) return
  scene.player = { x: next.x, y: next.y }
  scene.billboards = scene.billboards.map(b => b.kind === 'player' ? { ...b, ...scene.player } : b)
  scene.revision++
  const now = performance.now() / 1000
  renderer.setOptions({ center: scene.player })
  renderer.setScene(scene, now)
  original.setOptions({ center: scene.player })
  original.setScene(scene)
  captureTime = effectFrame ? now + effectFrame : null
  wake()
})
document.getElementById('los')!.addEventListener('click', () => {
  dimmedLOS = !dimmedLOS
  for (const cell of scene.cells.values()) {
    if (Math.abs(cell.x - scene.player.x) <= 3 && Math.abs(cell.y - scene.player.y) <= 3) cell.visibility = dimmedLOS ? 'remembered' : 'visible'
  }
  syncDemo()
})
document.getElementById('move')!.addEventListener('click', () => {
  // Give all demo entities a stable identity, including items with identical art.
  for (const [i, b] of scene.billboards.entries()) b.id ??= `preview:${i}`
  renderer.setScene({ ...scene, revision: ++scene.revision })
  scene.billboards = scene.billboards.map(b => {
    if (b.scenery || !['player', 'monster', 'item'].includes(b.kind)) return b
    const next = scene.cells.get(cellKey(b.x + moveDirection, b.y))
    if (next?.visibility !== 'visible' || next.occluder) return b
    if (b.kind === 'item') {
      const before = scene.cells.get(cellKey(b.x, b.y))!
      before.icons = before.icons?.filter(tile => tile !== -2)
      before.cursorTile = undefined
      next.cursorTile = -2
      next.icons = [...(next.icons ?? []).filter(tile => tile !== -2), -2]
    }
    return { ...b, x: next.x }
  })
  const player = scene.billboards.find(b => b.kind === 'player')
  if (player) scene.player = { x: player.x, y: player.y }
  moveDirection *= -1
  renderer.setScene({ ...scene, revision: ++scene.revision })
  original.setScene(scene)
  wake()
})
function syncDemo() {
  scene = { ...scene, revision: scene.revision + 1 }
  renderer.setScene(scene)
  original.setScene(scene)
  wake()
}
function practiceEnemy() {
  const next = [[1, 0], [-1, 0], [0, -1], [0, 1]].map(([dx, dy]) => scene.cells.get(cellKey(scene.player.x + dx, scene.player.y + dy)))
    .find(c => c?.visibility === 'visible' && !c.occluder)
  const art = scene.billboards.find(b => b.kind === 'monster' && !b.scenery && !b.lying && b.id !== 'practice-enemy')
  if (!next || !art) return null
  const enemy = { ...art, id: 'practice-enemy', x: next.x, y: next.y, scenery: false, alpha: 1,
    damage: (document.getElementById('wound') as HTMLSelectElement).value as WoundLevel,
    life: { motion: 'breath' as const, rate: 1.1, weary: true } }
  scene.billboards = [...scene.billboards.filter(b => b.id !== 'practice-enemy'), enemy]
  syncDemo()
  return enemy
}
document.getElementById('wound')!.addEventListener('change', practiceEnemy)
document.getElementById('melee')!.addEventListener('click', () => {
  const enemy = practiceEnemy()
  if (!enemy) return
  renderer.melee({ from: scene.player, to: enemy, style: (document.getElementById('weapon') as HTMLSelectElement).value as MeleeAttack['style'], hit: true }, performance.now() / 1000)
  if (effectFrame) captureTime = performance.now() / 1000 + effectFrame
  wake()
})
let castSequence = 0
document.getElementById('cast')!.addEventListener('click', () => {
  const selection = (document.getElementById('spell') as HTMLSelectElement).value
  if (selection.startsWith('burst:')) {
    const kind = selection.slice(6) as SpellEffect['kind']
    const target = ['heal', 'buff', 'teleport'].includes(kind) ? scene.player : practiceEnemy()
    if (!target) return
    const now = performance.now() / 1000
    renderer.spell({ x: target.x, y: target.y, kind }, now)
    if (effectFrame) captureTime = now + effectFrame
    wake()
    return
  }
  const index = spellKinds.indexOf(selection as typeof spellKinds[number])
  const id = `preview-spell:${++castSequence}`
  const cells = [-2, -1, 0, 1, 2].map(dx => scene.cells.get(cellKey(scene.player.x + dx, scene.player.y - 1)))
    .filter(c => c?.visibility === 'visible' && !c.occluder)
  const level = scene.levelKey
  scene.billboards = [...scene.billboards, ...cells.map(c => ({ id, x: c!.x, y: c!.y, tile: -3 - index, kind: 'projectile' as const, height: 1,
    life: { lights: [{ colour: spellColours[index], radius: 2.8, power: 0.45, pulse: index === 0 ? 'fire' as const : index === 2 ? 'electric' as const : 'slow' as const, transient: true }] } }))]
  syncDemo()
  setTimeout(() => {
    if (scene.levelKey !== level) return
    scene.billboards = scene.billboards.filter(b => b.id !== id)
    syncDemo()
    if (effectFrame) captureTime = performance.now() / 1000 + effectFrame
  }, 220)
})
document.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).matches('select, input, button')) return
  const step = ({ ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] } as Record<string, number[]>)[event.key]
  if (!step) return
  event.preventDefault()
  const next = scene.cells.get(cellKey(scene.player.x + step[0], scene.player.y + step[1]))
  if (!next || next.occluder || next.visibility !== 'visible') return
  scene.player = { x: next.x, y: next.y }
  scene.billboards = scene.billboards.map(b => b.kind === 'player' ? { ...b, ...scene.player } : b)
  renderer.setOptions({ center: scene.player })
  renderer.setScene({ ...scene, revision: ++scene.revision })
  original.setOptions({ center: scene.player })
  original.setScene(scene)
  wake()
})
fit()
// Exposed only in this testbed for deterministic browser captures and picking checks.
Object.assign(window, { renderer, scene, tiles, canvas, cellKey, __ready: true })
