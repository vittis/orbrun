import { loadGamedata } from '@orbrun/gamedata'
import { initialState, reduce, MapFeature } from '@orbrun/webtiles'
import { buildScene } from '@orbrun/scene-webtiles'
import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, type TileSource } from '@orbrun/scene'
import { captures, equalPixels, fixtureStart, fixtureComplete, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('scenery-terrain-checks')
const modules = import.meta.glob('../../../packages/scene-webtiles/test/fixtures/gamedata/*/*.js', { query: '?raw', import: 'default', eager: true })
const files = new Map(Object.entries(modules).map(([path, text]) => [path.split('/').pop()!, text as string]))
const gd = await loadGamedata({ base: 'fixture://scenery', version: 'pinned', skipImages: true, io: {
  fetchText: async url => { const text = files.get(url.split('/').pop()!); if (!text) throw new Error(url); return text },
  loadImage: async () => { throw new Error('No image IO') },
} })
const floor = gd.dngn.id('FLOOR_GREY_DIRT')!, wall = gd.dngn.id('WALL_NORMAL')!
const atlas = document.createElement('canvas'); atlas.width = 96; atlas.height = 32
const ink = atlas.getContext('2d')!
ink.fillStyle = '#b49c61'; ink.fillRect(0, 0, 32, 32)
// A narrow column with a broken top and scattered rubble. Its transparent
// corners must show the receiving floor, never an extruded rectangular base.
ink.fillStyle = '#ddd9cb'; ink.fillRect(44, 5, 7, 23); ink.fillRect(42, 26, 12, 4)
ink.fillRect(40, 28, 3, 3); ink.fillRect(54, 27, 4, 3)
ink.fillStyle = '#625b52'; ink.fillRect(64, 0, 32, 32)
const source: TileSource = {
  tile: id => ({ atlas: 'test', sx: id === floor ? 0 : id === wall ? 64 : 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
  atlas: () => atlas, atlasNames: () => ['test'],
}
const names = ['DNGN_CRUMBLED_COLUMN', 'DNGN_CRUMBLED_COLUMN_5', 'DEPTHS_COLUMN', 'DEPTHS_CRUMBLED_COLUMN',
  'DNGN_GRANITE_STATUE', 'DNGN_ORCISH_IDOL', 'DNGN_GRAVESTONE', 'DNGN_ZONGULDROK_SHRINE']
const failures: unknown[] = []; let checks = 0
for (const [width, height, dpr] of [[960, 600, 1], [390, 600, 2]]) for (const tilt of [35, 65]) for (const animate of [false, true]) {
  for (const name of names) {
    await fixtureYield(`${name} ${width} ${tilt} ${animate}`)
    const state = initialState(), art = gd.dngn.id(name)!
    reduce(state, { msg: 'player', pos: { x: 0, y: 0 }, place: 'Dungeon', depth: 1 })
    reduce(state, { msg: 'map', clear: true, player_on_level: true, cells:
      Array.from({ length: 9 }, (_, iy) => Array.from({ length: 9 }, (_, ix) => {
        const x = ix - 4, y = iy - 4, solid = y === -3
        return { x, y, mf: solid || x === 0 && y === 0 ? MapFeature.WALL : MapFeature.FLOOR,
          g: solid || x === 0 && y === 0 ? '#' : '.', t: { bg: solid ? wall : x === 0 && y === 0 ? art : floor, flv: { f: floor } } }
      })).flat(),
    })
    const actualScene = buildScene(state, gd)
    // Independent oracle: explicitly place a floor-supported sprite, regardless
    // of how the builder classified the server's wall-category prop.
    const expectedCells = new Map(actualScene.cells), prop = expectedCells.get(cellKey(0, 0))!
    expectedCells.set(cellKey(0, 0), { ...prop, kind: 'feature', occluder: false, floorTile: floor,
      wallTile: undefined, wallStyle: undefined, featureTile: art, stance: 'upright', freestanding: true })
    const canvases = [document.createElement('canvas'), document.createElement('canvas')]
    const renderers = canvases.map((canvas, i) => {
      const r = new Render25d({ animate, tilt, zoom: 1.8 }); r.mount(canvas); r.resize(width, height, dpr); r.setTiles(source)
      r.setScene(i ? { ...actualScene, cells: expectedCells } : actualScene, 0); r.render(1)
      return r
    })
    const pixels = canvases.map(c => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data)
    const head = renderers[1].project(0, 0.3)
    const scale = renderers[1].project(1, 0).x - renderers[1].project(0, 0).x
    checks++
    if (!equalPixels(pixels[0], pixels[1]) || renderers[0].pick(head.x, head.y - scale * 0.6) !== cellKey(0, 0)) {
      failures.push({ name, width, tilt, animate })
    }
    if (captures && width === 960 && tilt === 65 && !animate && name === names[0]) document.body.append(canvases[0])
    renderers.forEach(r => r.destroy())
    canvases.filter(c => !c.isConnected).forEach(releaseCanvas)
  }
}
fixtureComplete({ checks, failures })
