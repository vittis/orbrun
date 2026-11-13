import { loadGamedata } from '@orbrun/gamedata'
import { initialState, reduce, MapFeature } from '@orbrun/webtiles'
import { buildScene } from '@orbrun/scene-webtiles'
import { Render25d } from '@orbrun/render-2.5d'
import { type TileSource, type Scene } from '@orbrun/scene'
import { captures, equalPixels, fixtureStart, fixtureComplete, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('spell-terrain-checks')
// Pinned server tables, with no public-server/network dependency in the gate.
const modules = import.meta.glob('../../../packages/scene-webtiles/test/fixtures/gamedata/*/*.js', { query: '?raw', import: 'default', eager: true })
const files = new Map(Object.entries(modules).map(([path, text]) => [path.split('/').pop()!, text as string]))
const gd = await loadGamedata({ base: 'fixture://terrain', version: 'pinned', skipImages: true, io: {
  fetchText: async url => { const text = files.get(url.split('/').pop()!); if (!text) throw new Error(url); return text },
  loadImage: async () => { throw new Error('No image IO') },
} })
const floor = gd.dngn.id('FLOOR_GREY_DIRT')!, wall = gd.dngn.id('WALL_NORMAL') ?? gd.ranges.floorMax
const transparent = gd.dngn.id('DNGN_TRANSPARENT_WALL')!, vault = gd.dngn.id('STONE_SMOOTH_WALL_BEOGH')!
const atlas = document.createElement('canvas'); atlas.width = 96; atlas.height = 32
const ink = atlas.getContext('2d')!
ink.fillStyle = '#494541'; ink.fillRect(0, 0, 32, 32)
ink.fillStyle = '#635d55'; ink.fillRect(1, 1, 14, 14); ink.fillRect(17, 17, 14, 14)
ink.fillStyle = '#53634a'; ink.fillRect(32, 0, 32, 32)
ink.fillStyle = '#81916e'; ink.fillRect(33, 1, 14, 13); ink.fillRect(49, 16, 14, 13)
ink.fillStyle = '#ffbf58'; ink.fillRect(76, 5, 8, 22); ink.fillRect(69, 12, 22, 8)
const source: TileSource = {
  tile: id => ({ atlas: 'test', sx: id >= gd.ranges.featMax ? 64 : id === floor ? 0 : 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
  atlas: () => atlas, atlasNames: () => ['test'],
}
const failures: string[] = []; let checks = 0
for (const [width, height, dpr] of [[960, 600, 1], [390, 600, 2]]) for (const animate of [true, false]) {
  for (const name of ['BOLT_DEFAULT_RED', 'BOLT_DEFAULT_MAGENTA', 'BOLT_FIRE_STORM', 'BOLT_ICEBLAST', 'CLOUD_BLASTMOTES', 'CLOUD_COLD']) {
    await fixtureYield(`${name} ${width} ${animate}`)
    const state = initialState()
    reduce(state, { msg: 'player', pos: { x: 0, y: 0 }, place: 'Dungeon', depth: 1 })
    const cells = Array.from({ length: 9 }, (_, iy) => Array.from({ length: 9 }, (_, ix) => {
      const x = ix - 4, y = iy - 4, solid = y === -2 || x === -3 && y > 0
      const bg = solid ? x === 0 ? transparent : x === 1 ? vault : wall : floor
      return { x, y, mf: solid ? MapFeature.WALL : MapFeature.FLOOR, g: solid ? '#' : '.', t: { bg, flv: { f: floor } } }
    })).flat()
    reduce(state, { msg: 'map', clear: true, player_on_level: true, cells })
    const baseline = buildScene(state, gd)
    const canvases = [document.createElement('canvas'), document.createElement('canvas')]
    const [actual, expected] = canvases.map(c => { const r = new Render25d({ animate, zoom: 1.6 }); r.mount(c); r.resize(width, height, dpr); r.setTiles(source); r.setScene(baseline, 0); return r })
    const positions = cells.filter(c => Math.abs(c.x) <= 2 && Math.abs(c.y) <= 2)
    const tile = gd.main.id(name)!, cloud = name.startsWith('CLOUD_')
    if (!tile) throw new Error(name)
    const art = cloud ? { cloud: tile } : { ov: [tile] }
    const clear = cloud ? { cloud: 0 } : { ov: [] }
    let previous: Scene = baseline
    // Include the glyph-only frame the earlier Scene-only tests missed, then
    // native art, art removal with '#' still present, and glyph restoration.
    for (const [step, patch] of [{ g: '#' }, { t: art }, { t: clear }, { g: '*' }, { g: '.' }].entries()) {
      reduce(state, { msg: 'map', cells: positions.map(p => ({ x: p.x, y: p.y, ...patch })) })
      const scene = buildScene(state, gd, { previous, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
      previous = scene; state.dirtyCells.clear(); state.mapCleared = false
      const now = 1 + step * 0.3
      actual.setScene(scene, now)
      // Independent terrain oracle: original server terrain, current effects.
      // Restored glow, particles and native art are identical in both views.
      expected.setScene({ ...scene, cells: baseline.cells }, now)
      for (const time of [now + 0.01, now + 0.14]) {
        actual.render(time); expected.render(time)
        const pixels = canvases.map(c => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data)
        if (captures && width === 960 && animate && name === 'BOLT_DEFAULT_RED' && step < 2 && time === now + 0.14) {
          const figure = document.createElement('figure'), caption = document.createElement('figcaption'), copy = document.createElement('canvas')
          copy.width = canvases[0].width; copy.height = canvases[0].height
          copy.getContext('2d')!.drawImage(canvases[0], 0, 0)
          caption.textContent = step === 0 ? 'Explosion glyph before artwork — terrain stays fixed' : 'Artwork with restored lighting — same terrain'
          figure.append(caption, copy); document.body.append(figure)
        }
        checks++
        if (!equalPixels(pixels[0], pixels[1])) failures.push(`${name} ${width} animate=${animate} step=${step} time=${time}`)
      }
    }
    for (const r of [actual, expected]) r.destroy()
    for (const c of canvases) releaseCanvas(c)
  }
}
fixtureComplete({ checks, failures })
