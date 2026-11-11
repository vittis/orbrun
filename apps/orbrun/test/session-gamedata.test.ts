import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ServerMessage } from '@orbrun/webtiles'

/**
 * The gamedata load's lifetime is the session's, and the latest load's: one
 * that a newer version superseded, or whose session closed while it fetched,
 * publishes nothing and touches neither the gamedata nor the queue the newer
 * load holds. Every fetch here resolves by hand.
 */
type Resolvers = { resolve: (gd: unknown) => void; reject: (e: unknown) => void; version: string; signal: AbortSignal; progress: (done: number, total: number, what: string) => void }
const loads: Resolvers[] = []
vi.mock('@orbrun/gamedata', () => ({
  browserIo: () => ({}),
  loadGamedata: (opts: { version: string; signal: AbortSignal; onProgress: Resolvers['progress'] }) =>
    new Promise((resolve, reject) => loads.push({ resolve, reject, version: opts.version, signal: opts.signal, progress: opts.onProgress })),
}))

class FakeSocket {
  static last: FakeSocket | null = null
  binaryType = ''
  readyState = 0
  onopen: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  onmessage: unknown = null
  onerror: unknown = null
  constructor() {
    FakeSocket.last = this
  }
  send() {}
  close() {
    this.onclose?.({ code: 1000, reason: '' })
  }
}

const gd = (version: string) => ({ version, dispose: vi.fn() })

async function make() {
  ;(globalThis as { window?: unknown }).window = { WebSocket: FakeSocket, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } }
  ;(globalThis as { localStorage?: unknown }).localStorage = (globalThis as { window: { localStorage: unknown } }).window.localStorage
  const { Session } = await import('../src/session')
  const s = new Session({ id: 'x', name: 'x', host: 'x', ws: 'ws://x', http: 'http://x' } as never)
  const events: string[] = []
  s.on((e) => events.push(e.type === 'gamedata' ? `gamedata:${e.status}` : e.type))
  const handle = (m: ServerMessage) => (s as unknown as { handle(m: ServerMessage): void }).handle(m)
  return { s, events, handle }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('the gamedata load', () => {
  beforeEach(() => void loads.splice(0))
  afterEach(() => vi.useRealTimers())

  it('dates confirmed scene updates before notifying the view, without letting UI messages postpone motion', async () => {
    const { s, handle } = await make()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100)
    try {
      const arrived: number[] = []
      s.on((e) => { if (e.type === 'state') arrived.push(s.sceneChangedAt) })
      handle({ msg: 'player', pos: { x: 1, y: 2 } })
      clock.mockReturnValue(110)
      handle({ msg: 'msgs', messages: [] })
      expect(arrived).toEqual([100, 100])
      clock.mockReturnValue(120)
      handle({ msg: 'map', cells: [] })
      expect(s.sceneChangedAt).toBe(120)
    } finally {
      clock.mockRestore()
      s.close()
    }
  })

  it('closes a stalled load without applying queued messages with unavailable gamedata', async () => {
    vi.useFakeTimers()
    const { s, events, handle } = await make()
    const { Session } = await import('../src/session')
    handle({ msg: 'game_client', version: 'a' })
    handle({ msg: 'msgs', messages: [] })
    // bytes still arriving keep it alive, however long the whole takes
    await vi.advanceTimersByTimeAsync(Session.LOAD_STALL_MS - 1)
    loads[0].progress(1, 9, 'enums.js')
    await vi.advanceTimersByTimeAsync(Session.LOAD_STALL_MS - 1)
    expect(loads[0].signal.aborted).toBe(false)
    expect(s.loading).toBe(true)
    // and then nothing for the whole span: the load ends, queued deltas are discarded, and the connection closes
    await vi.advanceTimersByTimeAsync(2)
    expect(loads[0].signal.aborted).toBe(true)
    // a real fetch rejects with the abort's reason once the signal is pulled
    loads[0].reject(loads[0].signal.reason)
    await vi.advanceTimersByTimeAsync(0)
    expect(s.loading).toBe(false)
    expect((s as unknown as { queue: unknown[] }).queue).toEqual([])
    expect(events.filter((e) => e.startsWith('gamedata:')).at(-1)).toBe('gamedata:error')
    expect(events.filter((e) => e === 'state')).toHaveLength(1)
    expect(s.closed).toBe(true)
  })

  it('runs once per version: a second game on the version already loading starts no fetch', async () => {
    const { s, handle } = await make()
    handle({ msg: 'game_client', version: 'a' })
    handle({ msg: 'game_client', version: 'a' })
    expect(loads.map((l) => l.version)).toEqual(['a'])
    loads[0].resolve(gd('a'))
    await flush()
    expect(s.gamedata).toMatchObject({ version: 'a' })
    expect(s.loading).toBe(false)
  })

  it('lets the latest version win: a load a newer one superseded publishes nothing and drains no queue', async () => {
    const { s, events, handle } = await make()
    handle({ msg: 'game_client', version: 'a' })
    handle({ msg: 'game_client', version: 'b' })
    expect(loads.map((l) => l.version)).toEqual(['a', 'b'])
    handle({ msg: 'msgs', messages: [] })
    // the superseded load was told to stop; landing late anyway, its atlases are let go
    expect(loads[0].signal.aborted).toBe(true)
    expect(loads[1].signal.aborted).toBe(false)
    const late = gd('a')
    loads[0].resolve(late)
    await flush()
    expect(late.dispose).toHaveBeenCalledOnce()
    expect(s.gamedata).toBeNull()
    expect(s.loading).toBe(true)
    expect(events.filter((e) => e === 'gamedata:ready')).toEqual([])
    loads[1].resolve(gd('b'))
    await flush()
    expect(s.gamedata).toMatchObject({ version: 'b' })
    expect(s.loading).toBe(false)
    expect(events.filter((e) => e === 'gamedata:ready')).toEqual(['gamedata:ready'])
  })

  it('goes quiet with the session: a load that lands after the close neither errors nor readies', async () => {
    const { s, events, handle } = await make()
    handle({ msg: 'game_client', version: 'a' })
    handle({ msg: 'msgs', messages: [] })
    FakeSocket.last!.close()
    expect(s.closed).toBe(true)
    // the close stops the load and lets the messages it was holding go
    expect(loads[0].signal.aborted).toBe(true)
    expect(s.loading).toBe(false)
    expect((s as unknown as { queue: unknown[] }).queue).toEqual([])
    loads[0].reject(new Error('late'))
    await flush()
    expect(s.gamedata).toBeNull()
    expect(events.filter((e) => e.startsWith('gamedata:'))).toEqual(['gamedata:loading'])
  })

  it('closes and resets when progressive loading receives too many queued messages', async () => {
    const { s, events, handle } = await make()
    const { Session } = await import('../src/session')
    const closed: string[] = []
    s.on((e) => { if (e.type === 'closed') closed.push(e.reason) })
    handle({ msg: 'game_client', version: 'a' })
    for (let i = 0; i <= Session.LOAD_QUEUE_MESSAGES; i++) {
      if (i % 1000 === 0) loads[0].progress(1, 9, 'enums.js')
      handle({ msg: 'msgs', messages: [] })
    }
    expect(s.closed).toBe(true)
    expect(s.loading).toBe(false)
    expect(loads[0].signal.aborted).toBe(true)
    expect((s as unknown as { queue: unknown[] }).queue).toEqual([])
    expect(s.state.map.cells.size).toBe(0)
    expect(closed).toHaveLength(1)
    expect(closed[0]).toContain('queue exceeded its resource limit')
    expect(events).toContain('gamedata:error')
    const oldEvents = [...events]
    handle({ msg: 'player', name: 'must not apply' })
    expect(events).toEqual(oldEvents)
    // A superseded async load must never apply the discarded messages later.
    const late = gd('a')
    loads[0].resolve(late)
    await flush()
    expect(late.dispose).toHaveBeenCalledOnce()
    expect(s.gamedata).toBeNull()
  })

  it('bounds estimated bytes independently of message count, and reconnect starts fresh', async () => {
    const { s, handle } = await make()
    const { Session } = await import('../src/session')
    handle({ msg: 'game_client', version: 'a' })
    // Each 8 MiB string fits the connection frame limit but two exceed the
    // session's 32 MiB estimate after message/key/object overhead is included.
    const text = 'x'.repeat(Session.LOAD_QUEUE_BYTES / 4)
    handle({ msg: 'future_extension', text })
    expect(s.closed).toBe(false)
    handle({ msg: 'future_extension', text })
    expect(s.closed).toBe(true)
    expect(s.reconnect()).toBe(true)
    handle({ msg: 'game_client', version: 'b' })
    handle({ msg: 'msgs', messages: [] })
    expect(s.closed).toBe(false)
    loads[1].resolve(gd('b'))
    loads[0].reject(new Error('aborted'))
    await flush()
    expect(s.gamedata?.version).toBe('b')
    expect(s.loading).toBe(false)
    expect((s as unknown as { queueBytes: number }).queueBytes).toBe(0)
  })

  it('retains the recorded spectating map and state sequence within the load queue bounds', async () => {
    const { s, handle } = await make()
    const messages = readFileSync(new URL('../../../packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson', import.meta.url), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line).m as ServerMessage)
    for (const message of messages) handle(message)
    expect(loads).toHaveLength(1)
    expect(s.loading).toBe(true)
    expect(s.closed).toBe(false)
    // This test covers queue/reducer fidelity, not rendering or asset loading.
    vi.spyOn(s, 'flushScene').mockReturnValue(false)
    loads[0].resolve(gd(loads[0].version))
    await flush()
    expect(s.state.phase).toBe('watching')
    expect(s.state.player.name).toBe('Kai')
    expect(s.state.map.cells.size).toBeGreaterThan(500)
    expect(s.loading).toBe(false)
    expect((s as unknown as { queueBytes: number }).queueBytes).toBe(0)
  })


  it('disposes prior-version gamedata and clears presentation when a replacement load fails', async () => {
    const { s, events, handle } = await make()
    const previous = gd('previous')
    s.gamedata = previous as never
    handle({ msg: 'game_client', version: 'next' })
    handle({ msg: 'player', name: 'never apply with previous tiles' })
    loads[0].reject(new Error('unsupported next-version module'))
    await flush()
    expect(previous.dispose).toHaveBeenCalledOnce()
    expect(s.gamedata).toBeNull()
    expect(s.closed).toBe(true)
    expect(s.loading).toBe(false)
    expect(s.state.map.cells.size).toBe(0)
    expect(events.filter((e) => e === 'state')).toHaveLength(1)
    expect(events).toContain('gamedata:error')
    expect((s as unknown as { queue: unknown[] }).queue).toEqual([])
  })

})
