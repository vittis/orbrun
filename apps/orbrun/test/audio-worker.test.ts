import { afterEach, expect, it, vi } from 'vitest'
import { PackWorker } from '../src/audio/worker-client'
import { downloadOSP } from '../src/audio/store'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('terminates a stuck matcher and rejects pending and subsequent work', async () => {
  vi.useFakeTimers()
  const terminate = vi.fn()
  vi.stubGlobal('Worker', class { postMessage() {}; terminate = terminate })
  const worker = new PackWorker()
  const match = expect(worker.match([{ text: 'a'.repeat(100), freshFrom: 0 }])).rejects.toThrow('took too long')
  const asset = expect(worker.asset('hit.wav')).rejects.toThrow('took too long')
  await vi.advanceTimersByTimeAsync(1000)
  await Promise.all([match, asset])
  expect(terminate).toHaveBeenCalledOnce()
  await expect(worker.match([])).rejects.toThrow('unavailable')
})

it('accepts chunked downloads without Content-Length and rejects oversized headers before reading', async () => {
  const progress: number[] = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
  expect((await downloadOSP(new AbortController().signal, n => progress.push(n))).size).toBe(3)
  expect(progress).toEqual([3])
  const cancel = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-length': String(65 * 1024 * 1024) } })))
  await expect(downloadOSP(new AbortController().signal, () => {})).rejects.toThrow('64 MB')
  expect(cancel).toHaveBeenCalledOnce()
})
