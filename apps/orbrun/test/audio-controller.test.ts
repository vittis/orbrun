// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { AudioController } from '../src/audio/controller'
import { defaultSettings, getSettings, saveSettings } from '../src/settings'
import type { PackStore, StoredPack } from '../src/audio/store'
import type { SoundMixer } from '../src/audio/mixer'
import type { PackWorker } from '../src/audio/worker-client'
import type { Session, SessionEvent } from '../src/session'

const controllers: AudioController[] = []
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
beforeEach(() => { localStorage.clear(); vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { controllers.splice(0).forEach(c => c.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function harness() {
  let cached: StoredPack | undefined
  const store = { read: vi.fn(async () => cached), write: vi.fn(async (p: StoredPack) => { cached = p }), clear: vi.fn(async () => { cached = undefined }) }
  const playback: string[] = []
  const mixer = { running: true, unlock: vi.fn(async () => {}), configure() {}, suspend() {}, stop() {}, clear() {}, close() {}, play: (key: string) => { playback.push(key) } }
  const worker = { load: vi.fn(async () => ({ name: 'Test pack', rules: 1, sounds: 1, warnings: 0, details: [] })), match: vi.fn(async (messages: unknown[]) => messages.map(() => 'hit.wav' as string | null)), asset: vi.fn(async () => new ArrayBuffer(1)), close() {} }
  const create = () => {
    const c = new AudioController(store as unknown as PackStore, mixer as unknown as SoundMixer, () => worker as unknown as PackWorker)
    controllers.push(c); return c
  }
  const controller = create()
  const state = initialState()
  const listeners = new Set<(event: SessionEvent) => void>()
  const session = { state, on: (fn: (event: SessionEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } } as Session
  const send = (msg: ServerMessage) => { reduce(state, msg); listeners.forEach(fn => fn({ type: 'state', msg })) }
  const file = () => new File([new Uint8Array([1, 2, 3])], 'osp.zip')
  return { store, mixer, worker, controller, playback, session, send, create, file }
}

it('keeps history, disabled messages and old-session matches silent while accepting new live events', async () => {
  const h = harness()
  await h.controller.importZip(h.file())
  const detach = h.controller.attach(h.session)
  h.controller.configure({ ...defaultSettings, audioEnabled: true })
  h.send({ msg: 'player', hp: 10, hp_max: 10 })
  h.send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })
  await flush()
  expect(h.playback).toEqual([])
  h.send({ msg: 'msgs', messages: [{ text: 'You hit.' }, { text: 'You hit.' }] })
  await flush()
  expect(h.playback).toHaveLength(2)
  let finish!: (paths: (string | null)[]) => void
  h.worker.match.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  h.send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })
  detach(); finish(['hit.wav']); await flush()
  expect(h.playback).toHaveLength(2)
  const detachAgain = h.controller.attach(h.session)
  h.controller.configure(defaultSettings)
  h.send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })
  h.controller.configure({ ...defaultSettings, audioEnabled: true })
  h.send({ msg: 'msgs', messages: [{ text: 'You miss.' }] })
  await flush()
  expect(h.playback).toHaveLength(3)
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  h.send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  h.send({ msg: 'msgs', messages: [{ text: 'You miss.' }] })
  await flush()
  expect(h.playback).toHaveLength(4)
  detachAgain()
})

it('does not install/cache a pack whose worker finishes after removal', async () => {
  const h = harness()
  let finish!: (info: Awaited<ReturnType<typeof h.worker.load>>) => void
  const started = new Promise<void>(resolve => h.worker.load.mockImplementationOnce(() => {
    resolve(); return new Promise(r => { finish = r })
  }))
  const loading = h.controller.importZip(h.file())
  await started
  await h.controller.remove()
  finish({ name: 'Old', rules: 1, sounds: 1, warnings: 0, details: [] })
  await loading
  expect(h.controller.snapshot().message).toContain('removed')
  expect(h.store.write).not.toHaveBeenCalled()
})

it('restores the selected content identity and stays playable if persistent storage is unavailable', async () => {
  const h = harness()
  await h.controller.importZip(h.file())
  const hash = h.controller.snapshot().hash
  const next = h.create()
  await next.restore()
  expect(next.snapshot()).toMatchObject({ hash, info: { rules: 1 } })
  h.store.write.mockRejectedValueOnce(new Error('Quota exceeded'))
  await next.importZip(h.file())
  expect(next.snapshot()).toMatchObject({ hash, info: { rules: 1 } })
  expect(next.snapshot().message).toContain('Cache unavailable')
})

it('persists bounded independent audio settings without changing motion or account data', () => {
  localStorage.setItem('orbrun.tokens', 'untouched')
  saveSettings({ ...defaultSettings, audioEnabled: true, masterVolume: -4, effectsVolume: 3, singleSoundChannel: false, depthAnimate: false })
  expect(getSettings()).toMatchObject({ audioEnabled: true, masterVolume: 0, effectsVolume: 1, singleSoundChannel: false, depthAnimate: false })
  expect(localStorage.getItem('orbrun.tokens')).toBe('untouched')
})
