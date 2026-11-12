import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type MapRenderer, type TileSource } from '@orbrun/scene'
import { CombatPopups } from '../src/combat-popups'
import type { PopupTone } from '../src/combat-feedback'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'
import { surfaceLightChecks } from './surface-light-checks'

const tiles = await loadRoomTiles()
const { scene } = antechamberScene(tiles)
scene.playerOnLevel = true; scene.player = { x: 11, y: 5 }
const beam = document.createElement('canvas'); beam.width = beam.height = 32
const ink = beam.getContext('2d')!; ink.fillStyle = '#c5ecff'; ink.fillRect(0, 14, 32, 4)
const source: TileSource = {
  tile: id => id === -10 ? { atlas: 'beam', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 } : tiles.tile(id),
  atlas: name => name === 'beam' ? beam : tiles.atlas(name), atlasNames: () => [...tiles.atlasNames(), 'beam'],
}
const fire = { colour: [255, 158, 64] as [number, number, number], radius: 4.2, power: 0.7, pulse: 'fire' as const }
const torch = scene.cells.get(cellKey(10, 2))!
scene.billboards.push({ kind: 'player', x: 11, y: 5, tile: 4519, height: 0.7, life: { motion: 'breath' } })
for (const x of [10, 11, 12, 13]) scene.billboards.push({ kind: 'projectile', x, y: 5, tile: -10, height: 0.5 })
for (const c of scene.cells.values()) if (c.x < 5) c.visibility = 'remembered'
const view = document.querySelector<HTMLCanvasElement>('canvas')!
const renderer = new Render25d({ center: { x: 9, y: 4 } }); renderer.mount(view); renderer.setTiles(source)
const setLight = () => {
  torch.life = { motion: 'flame', lights: (document.getElementById('light') as HTMLInputElement).checked ? [fire] : [] }
  scene.revision++; renderer.setScene(scene)
}
setLight()
const stage = document.getElementById('stage')!
const numbers = document.getElementById('numbers')!, popupView = document.createElement('canvas')
popupView.style.width = '100%'; popupView.style.height = '150px'
Object.defineProperties(popupView, { clientWidth: { get: () => numbers.clientWidth }, clientHeight: { get: () => 150 } })
const popups = new CombatPopups(); numbers.prepend(popups.root)
const tones: PopupTone[] = ['physical', 'fire', 'cold', 'poison', 'acid', 'electric', 'magic']
document.getElementById('labels')!.replaceChildren(...tones.map(tone => Object.assign(document.createElement('span'), { textContent: tone })))
const anchors = { project: (x: number) => ({ x: (x + 0.5) * numbers.clientWidth / tones.length, y: 100 }) } as unknown as MapRenderer
let born = -Infinity, fixed = false
const add = (now: number) => { popups.clear(); popups.add(tones.map((tone, x) => ({ kind: 'hit' as const, tone, x, y: 0, text: x % 2 ? '24' : '12', heavy: x % 2 === 1 })), now); born = now }
const still = document.getElementById('still') as HTMLInputElement
still.addEventListener('change', () => { fixed = still.checked; renderer.setOptions({ animate: !fixed }); add(performance.now()) })
document.getElementById('light')!.addEventListener('change', setLight)
new ResizeObserver(() => renderer.resize(stage.clientWidth, stage.clientHeight, devicePixelRatio)).observe(stage)
function frame(now: number) {
  renderer.render(now / 1000)
  if (!fixed && now - born > 1450) add(now)
  popups.render(fixed ? born + 150 : now, anchors, emptyScene(), popupView, fixed)
  requestAnimationFrame(frame)
}
add(performance.now()); requestAnimationFrame(frame)
const result = document.createElement('pre'); result.id = 'result'; result.style.margin = '16px 24px'
result.textContent = JSON.stringify(await surfaceLightChecks(), null, 2); document.body.append(result)
