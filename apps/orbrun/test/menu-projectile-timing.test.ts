// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as gamedata from '@orbrun/gamedata'
import { Render25d } from '@orbrun/render-2.5d'
import manifest from '../data/menu-replays.json'
import { loadMenuDemo } from '../src/menu-demo'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

async function prepareReplay() {
  const root = join(import.meta.dirname, '../public/menu')
  const entry = manifest.clips.find(e => e.title.startsWith('Crossfire in the Snake Pit'))!
  const data = await gamedata.loadGamedata({ base: 'fixture://menu', version: entry.version, skipImages: true,
    io: { fetchText: async url => readFileSync(join(root, url.replace('fixture://menu/', '')), 'utf8'),
      loadImage: async () => { throw Error('unexpected atlas') } } })
  vi.spyOn(gamedata, 'loadGamedata').mockResolvedValue(data)
  vi.stubGlobal('fetch', async () => new Response(readFileSync(join(root, entry.file), 'utf8')))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.spyOn(Render25d.prototype, 'mount').mockImplementation(() => {})
  return loadMenuDemo(document.createElement('canvas'), new AbortController().signal, entry,
    { progress() {}, finished() {}, failed(error) { throw error } })
}

it('delivers the six-cell Snake Pit shot at its recorded cadence between canvas paints', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  const scenes = vi.spyOn(Render25d.prototype, 'setScene')
  const demo = await prepareReplay()
  try {
    demo.setActive(true)
    await vi.advanceTimersByTimeAsync(2000)
    const overlays = scenes.mock.calls.flatMap(([scene, time]) => scene.turn === 33
      ? scene.billboards.filter(b => b.kind === 'projectile')
        .map(b => ({ x: b.x, y: b.y, ms: Math.round(time! * 1000) })) : [])
    const shot = overlays.filter((p, i) => overlays.findIndex(other => other.x === p.x && other.y === p.y) === i)
    expect(shot.map(p => [p.x, p.y])).toEqual([[1, -1], [1, -2], [2, -3], [2, -4], [3, -5], [3, -6]])
    // Elapsed milliseconds from the first slug overlay in the Crawl capture.
    expect(shot.map(p => p.ms - shot[0].ms)).toEqual([0, 17, 35, 52, 69, 86])
  } finally { demo.destroy() }
})

it('paints at the menu cadence across fractional display ticks and skips missed paints after a stall', async () => {
  let frame: FrameRequestCallback
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.spyOn(Render25d.prototype, 'animating', 'get').mockReturnValue(true)
  const render = vi.spyOn(Render25d.prototype, 'render').mockImplementation(() => {})
  const demo = await prepareReplay()
  try {
    demo.setActive(true)
    // 120 Hz display with timestamps rounded to tenths of a millisecond.
    for (let tick = 0; tick < 120; tick++) frame!(Math.round(tick * 10000 / 120) / 10)
    expect(render).toHaveBeenCalledTimes(30)
    frame!(2000)
    frame!(2008.3)
    expect(render).toHaveBeenCalledTimes(31)
  } finally { demo.destroy() }
})
