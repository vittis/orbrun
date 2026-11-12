// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadGamedata, type Gamedata } from '@orbrun/gamedata'
import { type Connection, type ServerMessage } from '@orbrun/webtiles'
import { Render25d } from '@orbrun/render-2.5d'
import { ImpactArt } from '../../../packages/render-2.5d/src/impact-draw'
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
  return { session, deliver, renderer, frames, ctx }
}

const recorded = JSON.parse(readFileSync(resolve('apps/orbrun/test/fixtures/magic-dart-batched.json'), 'utf8')) as {
  cycle: number; shots: { receivedMs: number; clearAfterMs: number; points: { x: number; y: number; phase: number }[] }[]
}

describe('native projectile paths before the next animation frame', () => {
  it.each(['BOLT_SANDBLAST', 'BOLT_STONE_ARROW', 'BOLT_IRON_SHOT', 'BOLT_MAGIC_DART', 'BOLT_FROST', 'MI_ARROW', 'MI_ARROW2', 'BOLT_STONE_ARROW_2'])('preserves a complete %s flight in one synchronous message burst', name => {
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
      expect(retained).toHaveLength(2)
      expect(retained.every(d => d.thin === false)).toBe(true)
      draws.length = 0
      renderer.render(1.3)
      expect(draws.some(d => d.tile === tile)).toBe(false)
      expect(renderer.animating).toBe(false) // overlays alone do not invent impacts
      renderer.render(4)
      expect(renderer.animating).toBe(false)
    } finally { draw.mockRestore(); renderer.destroy(); session.close() }
  })

  it.each(recorded.shots)('preserves recorded batched Magic Dart at $receivedMs ms as native path tiles and one confirmed impact', shot => {
    const { session, deliver, renderer } = harness()
    const tile = (phase: number) => gd.main.id(phase ? `BOLT_MAGIC_DART_${phase}` : 'BOLT_MAGIC_DART')!
    const tiles = new Set(shot.points.map(p => tile(p.phase)))
    const draws: { tile: number; x: number; y: number }[] = []
    const draw = vi.spyOn(TileCache.prototype, 'drawPlane').mockImplementation((_ctx, layers, rect) => {
      if (tiles.has(layers[0].tile)) draws.push({ tile: layers[0].tile, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
      return true
    })
    const impact = vi.spyOn(ImpactArt.prototype, 'draw').mockImplementation(() => {})
    try {
      const bg = gd.dngn.id('FLOOR_GREY_DIRT')!
      const cells = Array.from({ length: 17 }, (_, y) => Array.from({ length: 17 }, (_, x) => ({ x: x - 8, y: y - 8, f: 33, mf: 1, g: '.', t: { bg } }))).flat()
      deliver({ msg: 'map', cells }); session.flushScene()
      deliver({ msg: 'map', cells: shot.points.map(p => ({ x: p.x, y: p.y, t: { ov: [tile(p.phase)] } })) })
      deliver({ msg: 'delay', t: 30 })
      deliver({ msg: 'map', cells: shot.points.map(p => ({ x: p.x, y: p.y, t: { ov: [] } })) })
      // No RAF/flush between addition and removal: the receipt pipeline owns both.
      const end = [...shot.points].sort((a, b) => Math.max(Math.abs(b.x), Math.abs(b.y)) - Math.max(Math.abs(a.x), Math.abs(a.y)))[0]
      renderer.spell({ x: end.x, y: end.y, kind: 'magic' }, 1.03)
      renderer.impact(end.x, end.y, 0.6, 1.03)
      renderer.render(1.002)
      expect(draws).toHaveLength(shot.points.length)
      for (const point of shot.points) {
        const q = renderer.project(point.x, point.y, 0.28)
        expect(draws.some(d => Math.abs(d.x - q.x) <= 0.5 && Math.abs(d.y - q.y) <= 0.5)).toBe(true)
      }
      // A scheduled impact draws only when its confirmed contact time arrives.
      expect(impact.mock.calls.filter(c => c[10] !== true && c[2] >= 0)).toHaveLength(0)
      impact.mockClear(); draws.length = 0
      renderer.render(1.2)
      expect(draws).toHaveLength(0)
      const bursts = impact.mock.calls.filter(c => c[10] !== true)
      expect(bursts).toHaveLength(1)
      expect(bursts[0][1]).toBe('magic')
      const q = renderer.project(end.x, end.y + 0.22)
      expect(bursts[0][5]).toBeCloseTo(q.x)
      expect(bursts[0][6]).toBeCloseTo(q.y - (renderer.project(1, 0).x - renderer.project(0, 0).x) * 0.4)
      impact.mockClear()
      renderer.render(1.7)
      expect(impact.mock.calls.filter(c => c[10] !== true)).toHaveLength(0) // no delayed generic second hit
    } finally { impact.mockRestore(); draw.mockRestore(); renderer.destroy(); session.close() }
  })

  it('publishes clear frames between consecutive identical casts without waiting for a RAF', () => {
    const { session, deliver, renderer, frames } = harness()
    const tile = gd.main.id('BOLT_MAGIC_DART')!
    try {
      for (let i = 0; i < 2; i++) {
        deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [tile] } }] })
        deliver({ msg: 'map', cells: [{ x: 1, y: 0, t: { ov: [] } }] })
      }
      expect(frames).toEqual([[tile], [], [tile], []])
    } finally { renderer.destroy(); session.close() }
  })

  it('keeps the server artwork heading and repeats it at each path cell', () => {
    const { session, deliver, renderer } = harness()
    const tile = gd.main.id('BOLT_STONE_ARROW')!
    const draw = vi.spyOn(TileCache.prototype, 'drawPlane').mockReturnValue(true)
    try {
      deliver({ msg: 'map', cells: [1, 2, 3].map(x => ({ x, y: 0, t: { ov: [tile] } })) })
      deliver({ msg: 'map', cells: [1, 2, 3].map(x => ({ x, y: 0, t: { ov: [] } })) })
      renderer.render(1.016)
      expect(draw.mock.calls.filter(c => c[1][0].tile === tile)).toHaveLength(3)
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

  it('does not play a character impact when batched auto-explore movement is flushed', () => {
    const { session, deliver, renderer } = harness()
    const impact = vi.spyOn(ImpactArt.prototype, 'draw').mockImplementation(() => {})
    try {
      // Several confirmed steps arrive before the next scene flush/RAF.
      for (const x of [1, 2, 3]) deliver({ msg: 'player', pos: { x, y: 0 } })
      session.flushScene()
      expect(session.scene.player.x).toBe(3)
      renderer.render(1.016)
      expect(impact).not.toHaveBeenCalled()
      // Confirmed teleport feedback still owns its effect.
      renderer.spell({ x: 3, y: 0, kind: 'teleport' }, 1.02)
      renderer.render(1.04)
      expect(impact.mock.calls.some(c => c[1] === 'teleport')).toBe(true)
    } finally { impact.mockRestore(); renderer.destroy(); session.close() }
  })
})
