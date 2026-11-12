// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomView } from '../src/room/view'

const mock = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../src/room/room-25d', () => ({ Room25d: { create: mock.create } }))

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let resize: ResizeObserverCallback
let disconnect: ReturnType<typeof vi.fn>
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
let room: { show: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; applySettings: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
let view: RoomView | undefined

beforeEach(() => {
  frames = new Map(); nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  room = { show: vi.fn().mockResolvedValue({}), render: vi.fn().mockReturnValue(false), resize: vi.fn(), applySettings: vi.fn(), destroy: vi.fn() }
  mock.create.mockReturnValue(room)
})
afterEach(() => { view?.destroy(); view = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function create() {
  const host = document.createElement('div')
  document.body.append(host)
  view = new RoomView(host, 'lair-grove')
  return view
}
function frame(now = 1000) {
  const current = [...frames.values()]; frames.clear()
  current.forEach(callback => callback(now))
}
async function loaded() { await vi.waitFor(() => expect(room.resize).toHaveBeenCalled()) }

describe('2.5D menu scenery lifecycle', () => {
  it('parks pending work while loading and rests after a still frame', async () => {
    let finish!: () => void
    room.show.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    create(); frame()
    expect(frames.size).toBe(0)
    expect(room.render).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(room.show).toHaveBeenCalledWith('lair-grove'))
    finish(); await loaded(); frame(2500)
    expect(room.render).toHaveBeenCalledWith(2.5)
    expect(view!.el.classList.contains('in')).toBe(true)
    expect(frames.size).toBe(0)
  })

  it('pauses under a covering screen or hidden document, then redraws on return', async () => {
    const v = create(); await loaded()
    room.render.mockReturnValue(true)
    frame(); expect(frames.size).toBe(1)
    v.cover(true); expect(frames.size).toBe(0)
    v.applySettings(); expect(frames.size).toBe(0)
    v.cover(false); frame(); expect(frames.size).toBe(1)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(1)
  })

  it('applies resize and reduced-motion changes and removes observers and frames on destruction', async () => {
    const v = create(); await loaded(); frame()
    Object.defineProperty(v.el, 'clientWidth', { value: 360 }); Object.defineProperty(v.el, 'clientHeight', { value: 640 })
    resize([], {} as ResizeObserver)
    expect(room.resize).toHaveBeenLastCalledWith(360, 640, 1)
    media.matches = true
    media.addEventListener.mock.calls[0][1]()
    expect(room.applySettings).toHaveBeenLastCalledWith(expect.objectContaining({ depthTilt: 50 }), true)
    const element = v.el
    v.destroy(); view = undefined
    expect(room.destroy).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', media.addEventListener.mock.calls[0][1])
    expect(element.isConnected).toBe(false)
    expect(frames.size).toBe(0)
  })

  it('disposes a renderer that finishes loading after its screen was destroyed', async () => {
    let finish!: () => void
    room.show.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const v = create()
    await vi.waitFor(() => expect(room.show).toHaveBeenCalled())
    v.destroy(); view = undefined
    finish()
    await vi.waitFor(() => expect(room.destroy).toHaveBeenCalledOnce())
    expect(room.resize).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('disposes failed scenery and leaves the menu usable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    room.show.mockRejectedValue(new Error('missing atlas'))
    create()
    await vi.waitFor(() => expect(room.destroy).toHaveBeenCalledOnce())
    frame()
    expect(frames.size).toBe(0)
    expect(view!.el.classList.contains('in')).toBe(false)
  })
})
