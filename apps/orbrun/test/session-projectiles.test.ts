// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadGamedata, type Gamedata } from '@orbrun/gamedata'
import { type Connection, type ServerMessage } from '@orbrun/webtiles'
import { Render25d } from '@orbrun/render-2.5d'
import { TileCache } from '../../../packages/render-2.5d/src/tiles'
import { Session } from '../src/session'
import type { ServerInfo } from '../src/servers'

let gd: Gamedata
beforeAll(async () => {
  const root = resolve('packages/scene-webtiles/test/fixtures/gamedata')
  const version = readdirSync(root)[0]
  gd = await loadGamedata({ base: 'fixture://x', version, skipImages: true, io: {
    fetchText: async url => readFileSync(join(root, version, url.split('/').pop()!), 'utf8'),
    loadImage: async () => { throw new Error('no image IO') },
  } })
})

function harness(animate = true) {
  let deliver: (message: ServerMessage) => void = () => {}
  const connection: Connection = { kind: 'remote', gamedataBase: '', open: true, send() {}, close() {},
    onMessage(fn) { deliver = fn; return () => {} }, onOpen: () => () => {}, onClose: () => () => {} }
  const session = new Session({ id: 'fixture' } as ServerInfo, null, connection)
  session.gamedata = gd
  deliver({ msg: 'player', pos: { x: 0, y: 0 }, place: 'Dungeon', depth: 1 })
  const bg = gd.dngn.id('FLOOR_GREY_DIRT')!
  deliver({ msg: 'map', clear: true, player_on_level: true, cells: [0, 1, 2, 3].map(x => ({ x, y: 0, f: 33, mf: 1, g: '.', t: { bg } })) })
  session.flushScene()
  const gradient = { addColorStop: vi.fn() }
  const ctx = new Proxy({ createRadialGradient: () => gradient, createLinearGradient: () => gradient } as Record<string, unknown>, {
    get(target, key: string) { return target[key] ??= vi.fn() },
  })
  const renderer = new Render25d({ animate })
  renderer.mount({ getContext: () => ctx } as unknown as HTMLCanvasElement)
  renderer.resize(900, 700, 1)
  renderer.setTiles(gd)
  renderer.setScene(session.scene, 1)
  const frames: number[][] = []
  session.on(event => {
    if (event.type !== 'scene') return
    frames.push(event.scene.billboards.filter(b => b.kind === 'projectile').map(b => b.tile))
    renderer.setScene(event.scene, 1)
  })
  return { session, deliver, renderer, frames }
}

describe('projectile receipt before the next animation frame', () => {
  it.each(['BOLT_SANDBLAST', 'BOLT_STONE_ARROW', 'BOLT_IRON_SHOT', 'BOLT_MAGIC_DART', 'BOLT_FROST', 'MI_ARROW'])('preserves a complete %s flight in one synchronous message burst', name => {
    const { session, deliver, renderer, frames } = harness()
    const tile = gd.main.id(name)!
    const draws: { tile: number; thin: boolean | undefined }[] = []
    const draw = vi.spyOn(TileCache.prototype, 'drawPlane').mockImplementation((_ctx, layers, _rect, _light, _memory, _flash, _lighting, _sample, thin) => { draws.push({ tile: layers[0].tile, thin }); return true })
    try {
      deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [tile] } }] })
      deliver({ msg: 'delay', t: 10 })
      deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [] } }, { x: 2, y: 0, t: { ov: [tile] } }] })
      deliver({ msg: 'delay', t: 10 })
      deliver({ msg: 'map', cells: [{ x: 2, y: 0, t: { ov: [] } }] })
      session.flushScene()
      expect(frames).toEqual([[tile], [tile], []])
      expect(session.scene.billboards.some(b => b.kind === 'projectile')).toBe(false)
      renderer.render(1.016)
      const retained = draws.filter(d => d.tile === tile)
      expect(retained).toHaveLength(1)
      expect(retained.every(d => d.thin === false)).toBe(true)
      draws.length = 0
      renderer.render(1.3)
      expect(draws.some(d => d.tile === tile)).toBe(false)
      expect(renderer.animating).toBe(true) // impact/traces outlive the short projectile
      renderer.render(4)
      expect(renderer.animating).toBe(false)
    } finally { draw.mockRestore(); renderer.destroy(); session.close() }
  })

  it('keeps ordinary movement/terrain updates batched and never replays projectile art in Still mode', () => {
    const { session, deliver, renderer, frames } = harness(false)
    try {
      deliver({ msg: 'map', cells: [{ x: 1, y: 0, g: '.' }] })
      expect(frames).toHaveLength(0)
      const tile = gd.main.id('BOLT_SANDBLAST')!
      deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [tile] } }] })
      deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [] } }] })
      session.flushScene()
      renderer.render(1.016)
      expect(renderer.animating).toBe(false)
    } finally { renderer.destroy(); session.close() }
  })
})
