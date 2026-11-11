import { describe, expect, it, vi } from 'vitest'
import { CONNECTION_LIMITS, RemoteConnection } from '../src/connection.js'

class FakeSocket {
  static last: FakeSocket | null = null
  binaryType = ''
  readyState = 0
  bufferedAmount = 0
  sent: string[] = []
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send(s: string) {
    this.sent.push(s)
  }
  close(code = 1000, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason, wasClean: code === 1000 })
  }
  opens() {
    this.readyState = 1
    this.onopen?.({})
  }
}

const make = (onDiagnostic?: (t: string, d?: unknown) => void) =>
  new RemoteConnection({ url: 'ws://x', gamedataBase: 'http://x', WebSocket: FakeSocket as never, onDiagnostic })

describe('RemoteConnection.send', () => {
  it('holds what is sent while connecting and lets it out, in order, once the socket opens', () => {
    const c = make()
    c.send({ msg: 'pong' })
    c.send({ msg: 'go_lobby' })
    const ws = FakeSocket.last!
    expect(ws.sent).toEqual([])
    ws.opens()
    expect(ws.sent.map((s) => JSON.parse(s).msg)).toEqual(['pong', 'go_lobby'])
    c.send({ msg: 'pong' })
    expect(ws.sent).toHaveLength(3)
  })

  it('keeps nothing once the socket has closed: there is no socket left for it to go out on', () => {
    const diag = vi.fn()
    const c = make(diag)
    const ws = FakeSocket.last!
    ws.opens()
    // one in flight when the socket goes: held, then let go with the close
    ws.readyState = 0
    c.send({ msg: 'pong' })
    ws.close()
    expect(c.closed).toBe(true)
    expect((c as unknown as { queue: string[] }).queue).toEqual([])
    c.send({ msg: 'go_lobby' })
    c.send({ msg: 'go_lobby' })
    expect((c as unknown as { queue: string[] }).queue).toEqual([])
    expect(ws.sent).toEqual([])
    expect(diag).toHaveBeenCalledWith('message dropped: the connection is closed', 'go_lobby')
  })
})

describe('RemoteConnection.reopen', () => {
  it('makes another socket for the same handlers, and stops listening to the old one', () => {
    const c = make()
    const opened = vi.fn()
    const closed = vi.fn()
    const msgs: string[] = []
    c.onOpen(opened)
    c.onClose(closed)
    c.onMessage((m) => msgs.push(m.msg))
    const first = FakeSocket.last!
    first.opens()
    first.close()
    expect(closed).toHaveBeenCalledTimes(1)

    c.reopen()
    expect(c.closed).toBe(false)
    const second = FakeSocket.last!
    expect(second).not.toBe(first)
    // sent while it connects, out once it is up, as on the first socket
    c.send({ msg: 'go_lobby' })
    second.opens()
    expect(opened).toHaveBeenCalledTimes(2)
    expect(second.sent.map((s) => JSON.parse(s).msg)).toEqual(['go_lobby'])
    second.onmessage?.({ data: '{"msg":"ping"}' })
    expect(second.sent.map((s) => JSON.parse(s).msg)).toEqual(['go_lobby', 'pong'])

    // the socket left behind: whatever it says now is nobody's
    first.onmessage?.({ data: '{"msg":"go_lobby"}' })
    first.close()
    expect(msgs).toEqual([])
    expect(closed).toHaveBeenCalledTimes(1)
    expect(c.open).toBe(true)
  })

  it('does nothing while a socket is up or on its way', () => {
    const c = make()
    const first = FakeSocket.last!
    c.reopen()
    expect(FakeSocket.last).toBe(first)
    first.opens()
    c.reopen()
    expect(FakeSocket.last).toBe(first)
  })
})


describe('RemoteConnection trust boundaries', () => {
  it.each(['null', '[]', 'true', '{}', '{"msgs":null}', '{"msgs":{}}', '{"msgs":[null]}', '{"msgs":[1]}', '{"msgs":[[]]}', '{"msg":3}', '{"msg":""}', '{broken'])('closes malformed input %s without throwing or dispatching', (data) => {
    const diagnostic = vi.fn()
    const c = make(diagnostic)
    const ws = FakeSocket.last!
    const message = vi.fn()
    const closed = vi.fn()
    c.onMessage(message)
    c.onClose(closed)
    ws.opens()
    expect(() => ws.onmessage?.({ data })).not.toThrow()
    expect(c.closed).toBe(true)
    expect(c.open).toBe(false)
    expect(message).not.toHaveBeenCalled()
    expect(diagnostic).toHaveBeenCalled()
    expect(closed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: 4002, clean: false }))
  })

  it('validates a whole batch before applying any authoritative deltas', () => {
    const c = make()
    const handler = vi.fn()
    c.onMessage(handler)
    FakeSocket.last!.onmessage?.({ data: '{"msgs":[{"msg":"map","cells":[]},null,{"msg":"player"}]}' })
    expect(handler).not.toHaveBeenCalled()
    expect(c.closed).toBe(true)
  })

  it('preserves large valid maps, whitespace, message order, and future message names', () => {
    const c = make()
    const ws = FakeSocket.last!
    const received: string[] = []
    c.onMessage((m) => received.push(m.msg))
    ws.opens()
    const map = { msg: 'map', cells: Array.from({ length: 40_000 }, (_, i) => ({ x: i % 200, y: Math.floor(i / 200), t: { fg: 12345, bg: 1234 } })) }
    const frame = JSON.stringify({ msgs: [map, { msg: 'future_extension' }, { msg: 'player' }] })
    expect(frame.length).toBeGreaterThan(1024 * 1024)
    ws.onmessage?.({ data: '  ' + frame + '\n' })
    expect(received).toEqual(['map', 'future_extension', 'player'])
    expect(c.open).toBe(true)
  })

  it('closes an oversized UTF-8 frame even when its character count is below the limit', () => {
    const c = make()
    const ws = FakeSocket.last!
    const closed = vi.fn()
    c.onClose(closed)
    ws.onmessage?.({ data: JSON.stringify({ msg: 'map', text: '界'.repeat(Math.floor(CONNECTION_LIMITS.frameBytes / 3) + 1) }) })
    expect(closed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: 4000, reason: 'incoming frame exceeds byte limit' }))
    expect(c.closed).toBe(true)
  })

  it('rejects oversized binary frames before decoding and ignores late callbacks', () => {
    const c = make()
    const ws = FakeSocket.last!
    const closed = vi.fn()
    const opened = vi.fn()
    const messages = vi.fn()
    c.onClose(closed)
    c.onOpen(opened)
    c.onMessage(messages)
    ws.onmessage?.({ data: new ArrayBuffer(CONNECTION_LIMITS.frameBytes + 1) })
    ws.opens()
    ws.onmessage?.({ data: '{"msg":"map"}' })
    ws.close()
    expect(closed).toHaveBeenCalledTimes(1)
    expect(opened).not.toHaveBeenCalled()
    expect(messages).not.toHaveBeenCalled()
    expect(c.closed).toBe(true)
  })

  it('bounds batch message count before dispatch', () => {
    const c = make()
    const message = vi.fn()
    c.onMessage(message)
    FakeSocket.last!.onmessage?.({ data: JSON.stringify({ msgs: Array.from({ length: CONNECTION_LIMITS.batchMessages + 1 }, () => ({ msg: 'player' })) }) })
    expect(c.closed).toBe(true)
    expect(message).not.toHaveBeenCalled()
  })

  it('closes a connecting queue that exceeds its count and never replays it on reopen', () => {
    const diagnostic = vi.fn()
    const c = make(diagnostic)
    const ws = FakeSocket.last!
    for (let i = 0; i <= CONNECTION_LIMITS.queuedMessages; i++) c.send({ msg: 'pong' })
    expect(c.closed).toBe(true)
    expect(diagnostic).toHaveBeenCalledWith('outgoing connection queue exceeds limit')
    ws.opens()
    expect(ws.sent).toEqual([])
    c.reopen()
    const reopened = FakeSocket.last!
    c.send({ msg: 'go_lobby' })
    reopened.opens()
    expect(reopened.sent).toEqual(['{"msg":"go_lobby"}'])
  })

  it('bounds queued bytes independently of message count', () => {
    const c = make()
    const text = 'x'.repeat(CONNECTION_LIMITS.outboundMessageBytes - 100)
    c.send({ msg: 'set_rc', text })
    c.send({ msg: 'set_rc', text })
    expect(c.closed).toBe(false)
    c.send({ msg: 'set_rc', text })
    expect(c.closed).toBe(true)
  })

  it('limits one outgoing message and a slow open socket buffer explicitly', () => {
    const c = make()
    const ws = FakeSocket.last!
    ws.opens()
    c.send({ msg: 'set_rc', text: 'x'.repeat(CONNECTION_LIMITS.outboundMessageBytes) })
    expect(c.closed).toBe(true)
    expect(ws.sent).toEqual([])
    const slow = make()
    const slowWs = FakeSocket.last!
    slowWs.opens()
    slowWs.bufferedAmount = CONNECTION_LIMITS.queuedBytes
    slow.send({ msg: 'pong' })
    expect(slow.closed).toBe(true)
    expect(slowWs.sent).toEqual([])
  })

  it('clears byte accounting after a queued flush and normal close', () => {
    const c = make()
    const ws = FakeSocket.last!
    const large = { msg: 'set_rc', text: 'x'.repeat(CONNECTION_LIMITS.outboundMessageBytes - 100) }
    c.send(large)
    c.send(large)
    ws.opens()
    expect(ws.sent).toHaveLength(2)
    ws.readyState = 0
    c.send(large)
    expect(c.closed).toBe(false)
    ws.close()
    c.reopen()
    c.send(large)
    c.send(large)
    expect(c.closed).toBe(false)
  })
})
