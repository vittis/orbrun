/** Existing Dungeon renderer with the authored menu vault and supporting flat overview. */
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { parseDes, vaultCenter, vaultScene } from '@orbrun/vault'
import desText from '../src/room/antechamber.des?raw'
import { loadRoomTiles } from '../src/room/tiles'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const poster = new URLSearchParams(location.search).has('poster')
if (poster) document.body.classList.add('poster')
const view = $('view'), canvas = document.createElement('canvas')
canvas.className = 'room in'
view.prepend(canvas)
const dungeon = new Render25d({ animate: false, tilt: 50, zoom: 1.2 })
const flat = new Render2d({ cellSize: 12, follow: false })
dungeon.mount(canvas)
flat.mount($<HTMLCanvasElement>('map2d'))
const tiles = await loadRoomTiles()
dungeon.setTiles(tiles)
flat.setTiles(tiles)
const des = $<HTMLTextAreaElement>('des')
des.value = desText
let vault = parseDes(des.value)
function compile() {
  try {
    vault = parseDes(des.value)
    const scene = vaultScene(vault, tiles)
    dungeon.setScene(scene)
    dungeon.setOptions({ center: vaultCenter(vault) })
    flat.setScene(scene)
    $('err').textContent = ''
    fit()
  } catch (e) { $('err').textContent = String(e) }
}
function draw() {
  dungeon.setOptions({ tilt: Number($<HTMLInputElement>('tilt').value), zoom: Number($<HTMLInputElement>('zoom').value) })
  dungeon.render(0)
  flat.render(0)
  document.title = poster ? 'poster ready' : 'Dungeon scenery fixture'
  ;(window as unknown as { __poster: boolean }).__poster = true
}
function fit() {
  dungeon.resize(view.clientWidth || 1, view.clientHeight || 1, devicePixelRatio || 1)
  const cell = Math.max(4, Math.floor(Math.min(360 / vault.width, 240 / vault.height)))
  flat.setOptions({ cellSize: cell })
  flat.resize(cell * vault.width, cell * vault.height, 1)
  draw()
}
for (const id of ['tilt', 'zoom']) $(id).addEventListener('input', draw)
$('menu').addEventListener('change', () => $('overlay').classList.toggle('off', !$<HTMLInputElement>('menu').checked))
$('apply').addEventListener('click', compile)
if (poster) $('overlay').classList.add('off')
window.addEventListener('resize', fit)
window.addEventListener('pagehide', () => { dungeon.destroy(); flat.destroy() }, { once: true })
compile()
