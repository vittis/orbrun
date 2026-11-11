// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkConnection } from '../src/connection-check'

class Socket {
  static last: Socket
  readyState = 1
  bufferedAmount = 0
  binaryType = ''
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; reason: string; wasClean: boolean }) => void) | null = null
  onerror = null
  close = vi.fn()
  constructor(readonly url: string, readonly protocols: string[]) { Socket.last = this }
  send(text: string) { this.sent.push(text) }
  receive(msg: string) { this.onmessage?.({ data: JSON.stringify({ msgs: [{ msg }] }) }) }
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('anonymous connection check', () => {
  it('sends exactly eight spaced lobby requests on its own socket, ignores unrelated replies and closes', async () => {
    const progress = vi.fn()
    const result = checkConnection('wss://example.invalid/socket', new AbortController().signal, progress)
    const socket = Socket.last
    expect(socket.protocols).toEqual(['no-compression'])
    socket.onopen!()
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(300)
      expect(socket.sent).toHaveLength(i + 1)
      socket.receive('lobby_entry')
      expect(progress).toHaveBeenCalledTimes(i)
      socket.receive('go_lobby')
    }
    expect(await result).toHaveLength(8)
    expect(socket.sent.map((s) => JSON.parse(s))).toEqual(Array(8).fill({ msg: 'go_lobby' }))
    expect(progress).toHaveBeenCalledTimes(8)
    expect(socket.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['opening', 'spacing', 'reply'] as const)('cancels during %s and stops all traffic/timers', async (phase) => {
    const controller = new AbortController()
    const result = checkConnection('wss://example.invalid/socket', controller.signal, vi.fn())
    const rejected = expect(result).rejects.toThrow('Check cancelled')
    const socket = Socket.last
    if (phase !== 'opening') { socket.onopen!(); await vi.advanceTimersByTimeAsync(0) }
    if (phase === 'reply') await vi.advanceTimersByTimeAsync(300)
    controller.abort()
    await rejected
    const count = socket.sent.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(socket.sent).toHaveLength(count)
    expect(socket.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['opening', 'reply'] as const)('bounds an unanswered %s to five seconds', async (phase) => {
    const result = checkConnection('wss://example.invalid/socket', new AbortController().signal, vi.fn())
    const rejected = expect(result).rejects.toThrow('5 seconds')
    if (phase === 'reply') { Socket.last.onopen!(); await vi.advanceTimersByTimeAsync(300) }
    await vi.advanceTimersByTimeAsync(5000)
    await rejected
    expect(Socket.last.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports socket closure and disposes the pending request', async () => {
    const result = checkConnection('wss://example.invalid/socket', new AbortController().signal, vi.fn())
    const rejected = expect(result).rejects.toThrow('Connection closed')
    Socket.last.onopen!()
    await vi.advanceTimersByTimeAsync(300)
    Socket.last.onclose?.({ code: 1006, reason: 'lost', wasClean: false })
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
