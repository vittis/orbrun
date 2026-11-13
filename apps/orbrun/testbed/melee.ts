import { cellKey, emptyScene, meleeTiming, type DamageType, type HitIntensity, type MeleeAttack } from '@orbrun/scene'
import { DungeonEffects } from '../../../packages/render-2.5d/src/effects'
import { drawMelee } from '../../../packages/render-2.5d/src/melee-draw'
import { groundDepth, project, type Projection } from '../../../packages/render-2.5d/src/projection'
import { meleeFrame, meleePath } from '../../../packages/render-2.5d/src/melee-path'
import { loadRoomTiles } from '../src/room/tiles'
import { Render25d } from '@orbrun/render-2.5d'

const tiles = await loadRoomTiles()
const styles: MeleeAttack['style'][] = ['slash', 'stab', 'thrust', 'cleave', 'reap', 'crush', 'lash', 'staff', 'unarmed']
const names = { stab: 'Straight jab', reap: 'Hooking sweep', lash: 'Snap', staff: 'Baton sweep', slash: 'Forehand', thrust: 'Centre line', cleave: 'Broad sweep', crush: 'Overhead', unarmed: 'Jab' }
const labels: Record<MeleeAttack['style'], string> = { slash: 'Long blades', stab: 'Short blades', thrust: 'Spears & tridents', cleave: 'Axes', reap: 'Bladed polearms', crush: 'Maces & clubs', lash: 'Whips', staff: 'Staves', unarmed: 'Unarmed' }
const select = (id: string) => document.getElementById(id) as HTMLSelectElement
const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked
const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'melee-preview' }
for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), {
  x, y, visibility: 'visible', kind: 'floor', floorTile: 4, occluder: false,
  flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
})
const previews = styles.map(style => {
  const figure = document.createElement('figure'), caption = document.createElement('figcaption'), canvas = document.createElement('canvas')
  caption.append(document.createTextNode(labels[style]), Object.assign(document.createElement('span'), { textContent: names[style] }))
  canvas.width = 360; canvas.height = 266
  canvas.setAttribute('aria-label', `${style} ${names[style]}`)
  figure.append(caption, canvas); document.getElementById('gestures')!.append(figure)
  return { style, caption, canvas, ctx: canvas.getContext('2d')!, fx: new DungeonEffects(), born: -Infinity, count: 0 }
})
const live = new Render25d()
live.mount(document.querySelector<HTMLCanvasElement>('#live-view')!)
live.resize(1200, 700, 1); live.setTiles(tiles)
function reset() {
  for (const p of previews) { p.fx.clear(); p.born = -Infinity; p.count = 0 }
  live.setOptions({ animate: false }); live.setOptions({ animate: true })
}
document.querySelectorAll('select, input').forEach(input => input.addEventListener('change', reset))
document.getElementById('restart')!.addEventListener('click', reset)
const timeline = document.getElementById('timeline') as HTMLInputElement
let frozenPhase = 0.35
select('frame').addEventListener('change', () => {
  if (select('frame').value !== 'custom') frozenPhase = Number(select('frame').value)
  timeline.value = String(frozenPhase)
})
timeline.addEventListener('input', () => {
  frozenPhase = Number(timeline.value)
  select('frame').value = 'custom'; select('playback').value = 'freeze'
  reset()
})
function sprite(ctx: CanvasRenderingContext2D, tile: number, p: Projection, point: { x: number; y: number }) {
  const art = tiles.tile(tile), atlas = art && tiles.atlas(art.atlas)
  if (!art || !(atlas instanceof HTMLImageElement)) return
  const q = project(p, point.x, point.y + 0.3)
  ctx.drawImage(atlas, art.sx, art.sy, art.w, art.h, q.x - p.scale / 2, q.y - p.scale, p.scale, p.scale)
}
function frame(ms: number) {
  const now = ms / 1000, [dx, dy] = select('direction').value.split(',').map(Number), reach = Number(select('reach').value)
  const target = { x: dx * reach, y: dy * reach }, hit = checked('hit')
  const from = { x: 0, y: 0 }, to = target
  const freeze = select('playback').value === 'freeze'
  live.setOptions({ tilt: Number(select('tilt').value), center: { x: target.x / 2, y: target.y / 2 },
    meleeWeight: Number(select('weight').value), meleeTrail: Number(select('trail').value), meleeMotion: Number(select('motion').value),
    hitBumpStrength: Number(select('bump').value), hitBumpSnap: Number(select('snap').value) })
  for (const preview of previews) {
    const { ctx, fx, style } = preview
    if (now - preview.born >= (freeze ? Infinity : Number(select('playback').value) / 1000) || !Number.isFinite(preview.born)) {
      fx.melee(scene, { from, to, style, hit, fromId: 'player', toId: 'id:enemy',
        tone: select('tone').value as DamageType, intensity: select('strength').value as HitIntensity }, now)
      preview.born = now; preview.count++
      if (style === select('live-weapon').value) {
        live.setScene({ ...scene, revision: preview.count, billboards: [
          { x: 0, y: 0, kind: 'player', tile: 4519, height: 1 },
          { ...target, id: 'enemy', kind: 'monster', tile: 7189, height: 1 },
        ] }, now)
        live.melee({ from, to, style, hit, fromId: 'player', toId: 'id:enemy',
          tone: select('tone').value as DamageType, intensity: select('strength').value as HitIntensity }, now)
      }
    }
    const time = freeze ? preview.born + frozenPhase * meleeTiming(style).duration : now
    if (style === select('live-weapon').value) live.render(time)
    fx.tick(scene, time)
    const p: Projection = { x: target.x / 2, y: target.y / 2 - 0.15, width: 360, height: 266, scale: reach === 2 ? 64 : 82, tilt: Number(select('tilt').value) * Math.PI / 180 }
    ctx.clearRect(0, 0, 360, 266); ctx.imageSmoothingEnabled = false
    for (const cell of scene.cells.values()) {
      const q = project(p, cell.x - 0.5, cell.y - 0.5), depth = groundDepth(p.tilt) * p.scale
      ctx.fillStyle = (cell.x + cell.y) % 2 ? '#202327' : '#25282c'
      ctx.fillRect(q.x, q.y, p.scale - 1, depth - 1)
    }
    const player = { x: 0, y: 0, kind: 'player' as const, tile: 4519, height: 1 }
    const enemy = { ...target, id: 'enemy', kind: 'monster' as const, tile: 7189, height: 1 }
    const offset = (actor: typeof player | typeof enemy) => {
      const q = fx.offset(actor, time, Number(select('motion').value), Number(select('bump').value), Number(select('snap').value))
      return { x: actor.x + q.x, y: actor.y + q.y }
    }
    const a = offset(player), b = offset(enemy)
    for (const [actor, position] of [[player, a], [enemy, b]] as const) sprite(ctx, actor.tile, p, position)
    const anchors = { from: a, to: b }
    const cross = project(p, anchors.to.x, anchors.to.y + 0.3)
    ctx.fillStyle = '#58615e'; ctx.fillRect(cross.x - 3, cross.y - p.scale * 0.42, 7, 1); ctx.fillRect(cross.x, cross.y - p.scale * 0.42 - 3, 1, 7)
    if (checked('guides')) {
      const origin = project(p, anchors.from.x, anchors.from.y + 0.3)
      const end = project(p, anchors.to.x, anchors.to.y + 0.3)
      const basis = meleeFrame(to.x - from.x, (to.y - from.y) * groundDepth(p.tilt))
      const { path } = meleePath(style, (end.x - origin.x) / p.scale, (end.y - origin.y) / p.scale, hit, basis)
      ctx.save(); ctx.translate(origin.x, origin.y - p.scale * 0.42)
      ctx.strokeStyle = '#b88a54'; ctx.setLineDash([2, 4]); ctx.beginPath()
      for (let i = 0; i <= 40; i++) { const q = path(i / 40); ctx.lineTo(q.x * p.scale, q.y * p.scale) }
      ctx.stroke(); ctx.setLineDash([])
      const guard = path(0)
      ctx.fillStyle = '#e9aa65'; ctx.fillRect(guard.x * p.scale - 2, guard.y * p.scale - 2, 5, 5)
      ctx.restore()
    }
    for (const stroke of fx.strokes) drawMelee(ctx, p, { ...stroke, ...anchors }, time, { weight: Number(select('weight').value), trail: Number(select('trail').value) })
    preview.canvas.dataset.swings = String(preview.count)
  }
  document.getElementById('status')!.textContent = `9 previews · ${freeze ? `Frozen at ${Math.round(frozenPhase * 100)}%` : `${previews[0].count} swings per preview`} · Contact stays at 42% for every gesture. Dungeon preview: /testbed/dungeon.html`
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
