import { describe, expect, it, vi } from 'vitest'
import { FrameScheduler } from '../src/frames'

function harness() {
  let id = 0
  const native = new Map<number, FrameRequestCallback>()
  const cancel = vi.fn((id: number) => { native.delete(id) })
  const frames = new FrameScheduler((fn) => { native.set(++id, fn); return id }, cancel)
  const tick = (now: number) => {
    for (const [id, fn] of [...native]) {
      if (!native.delete(id)) continue
      fn(now)
    }
  }
  return { frames, native, cancel, tick }
}

describe('input before presentation', () => {
  it.each([60, 120])('uses fresh input in the current frame at %i Hz, regardless of registration order', (hz) => {
    const h = harness()
    let command = 0
    const drawn: number[] = []
    const render = () => {
      drawn.push(command)
      h.frames.requestRender(render)
    }
    const input = () => {
      command++
      h.frames.requestInput(input)
    }
    h.frames.requestRender(render) // previously this could run before polling
    h.frames.requestInput(input)
    for (let i = 1; i <= 4; i++) h.tick(i * 1000 / hz)
    expect(drawn).toEqual([1, 2, 3, 4])
    expect(h.native.size).toBe(1)
  })

  it('renders a sleeping screen in the same frame its input wakes it', () => {
    const h = harness()
    const render = vi.fn()
    h.frames.requestInput(() => h.frames.requestRender(render))
    h.tick(1000)
    expect(render).toHaveBeenCalledExactlyOnceWith(1000)
    expect(h.native.size).toBe(0)
  })

  it('keeps repeats to one poll per display frame', () => {
    const h = harness()
    const input = vi.fn(() => h.frames.requestInput(input))
    h.frames.requestInput(input)
    h.frames.requestRender(() => h.frames.requestRender(() => {}))
    h.tick(10)
    expect(input).toHaveBeenCalledTimes(1)
    h.tick(20)
    expect(input).toHaveBeenCalledTimes(2)
  })

  it('can cancel a destroyed screen from input without cancelling the next poll', () => {
    const h = harness()
    const render = vi.fn()
    const id = h.frames.requestRender(render)
    h.frames.requestInput(() => {
      h.frames.cancelFrame(id)
      h.frames.requestInput(() => {})
    })
    h.tick(10)
    expect(render).not.toHaveBeenCalled()
    expect(h.native.size).toBe(1)
  })

  it('parks the native frame when all work is cancelled and can wake again', () => {
    const h = harness()
    const id = h.frames.requestRender(() => {})
    h.frames.cancelFrame(id)
    expect(h.cancel).toHaveBeenCalledOnce()
    expect(h.native.size).toBe(0)
    const render = vi.fn()
    h.frames.requestRender(render)
    h.tick(20)
    expect(render).toHaveBeenCalledExactlyOnceWith(20)
  })
})
