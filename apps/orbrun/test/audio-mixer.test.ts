import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SoundMixer } from '../src/audio/mixer'

beforeEach(() => vi.useFakeTimers({ toFake: ['performance'] }))
afterEach(() => vi.useRealTimers())
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function harness() {
  const starts: number[] = [], stops: number[] = [], gains: number[] = []
  const buffer = { length: 100, numberOfChannels: 1, duration: 0.1 } as AudioBuffer
  const decode = vi.fn(async () => buffer)
  const ctx = {
    state: 'suspended', currentTime: 0, destination: {},
    resume: vi.fn(async () => { ctx.state = 'running' }), suspend: vi.fn(async () => { ctx.state = 'suspended' }), close: vi.fn(async () => {}),
    createGain: () => ({ connect() {}, gain: { setValueAtTime(v: number) { gains.push(v) } } }),
    decodeAudioData: decode,
    createBufferSource: () => { const id = starts.length; return { connect() {}, disconnect() {}, start() { starts.push(id) }, stop() { stops.push(id) } } },
  }
  const mixer = new SoundMixer(() => ctx as unknown as AudioContext)
  const load = vi.fn(async () => new ArrayBuffer(2))
  return { mixer, ctx, load, starts, stops, gains, decode, buffer }
}

it('requires unlock, caches decoded effects, bounds voices and applies volume to active playback', async () => {
  const h = harness()
  h.mixer.play('hit', h.load, 0)
  expect(h.load).not.toHaveBeenCalled()
  await h.mixer.unlock()
  h.mixer.configure(0.4, 0.5, false)
  await Promise.all(Array.from({ length: 10 }, () => h.mixer.play('hit', h.load, 0)))
  expect(h.starts).toHaveLength(10)
  expect(h.load).toHaveBeenCalledTimes(1)
  expect(h.stops).toHaveLength(2)
  expect(h.gains.slice(-2)).toEqual([0.4, 0.5])
  h.mixer.configure(0, 1, false)
  expect(h.stops).toHaveLength(10)
})

it('drops stale decoding and all queued effects when a session ends or tab hides', async () => {
  const h = harness()
  await h.mixer.unlock()
  let finish!: (buffer: AudioBuffer) => void
  h.decode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  h.mixer.play('old', h.load, 0)
  h.mixer.play('also-old', h.load, 0)
  await flush()
  h.mixer.suspend()
  finish(h.buffer)
  await flush()
  expect(h.starts).toEqual([])
  expect(h.load).toHaveBeenCalledTimes(1)
  await h.mixer.unlock()
  h.mixer.play('late', h.load, -1000)
  await flush()
  expect(h.starts).toEqual([])
  h.mixer.play('fresh', h.load, performance.now())
  await flush()
  expect(h.starts).toHaveLength(1)
})

it('preserves arrival order across decoding and replaces effects in single-channel mode', async () => {
  const h = harness()
  await h.mixer.unlock()
  let finish!: (buffer: AudioBuffer) => void
  h.decode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  h.mixer.play('first', h.load, 0)
  h.mixer.play('second', h.load, 0)
  await flush()
  expect(h.load).toHaveBeenCalledTimes(1)
  finish(h.buffer); await flush()
  expect(h.starts).toEqual([0, 1])
  expect(h.stops).toEqual([0])
})
