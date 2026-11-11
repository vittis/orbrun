// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFullscreen } from '../src/fullscreen'

let dispose = () => {}
const originals = new Map([
  ['fullscreenEnabled', Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled')],
  ['fullscreenElement', Object.getOwnPropertyDescriptor(document, 'fullscreenElement')],
  ['hidden', Object.getOwnPropertyDescriptor(document, 'hidden')],
])
const originalRequest = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen')
const set = (key: string, value: unknown) => Object.defineProperty(document, key, { configurable: true, value })
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

afterEach(() => {
  dispose()
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(document, key, descriptor)
    else Reflect.deleteProperty(document, key)
  }
  if (originalRequest) Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequest)
  else Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
})

function setup(request = vi.fn().mockResolvedValue(undefined), enabled = true) {
  set('fullscreenEnabled', enabled)
  set('fullscreenElement', null)
  set('hidden', false)
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request })
  dispose = installFullscreen()
  return request
}

describe('automatic fullscreen', () => {
  it('requests hidden system navigation immediately on every launch', async () => {
    const request = setup()
    expect(request).toHaveBeenCalledExactlyOnceWith({ navigationUI: 'hide' })
    await settle()
    dispose()
    dispose = installFullscreen()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each(['touch', 'pen'])('retries a blocked launch synchronously on %s release without consuming the tap', async (pointerType) => {
    const request = setup(vi.fn().mockRejectedValueOnce(new Error('activation')).mockResolvedValue(undefined))
    await settle()
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType }))
    expect(request).toHaveBeenCalledTimes(1)
    const tap = new PointerEvent('pointerup', { pointerType, cancelable: true })
    window.dispatchEvent(tap)
    expect(request).toHaveBeenCalledTimes(2)
    expect(tap.defaultPrevented).toBe(false)
  })

  it('retries on mouse down and keyboard input but ignores Escape and repeats', async () => {
    const request = setup(vi.fn().mockRejectedValue(new Error('activation')))
    await settle()
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }))
    expect(request).toHaveBeenCalledTimes(2)
    await settle()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: true }))
    expect(request).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('does not duplicate pending requests or requests while fullscreen', async () => {
    const request = setup()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).toHaveBeenCalledTimes(1)
    await settle()
    set('fullscreenElement', document.documentElement)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('respects an exit until the app is visited again', async () => {
    const request = setup()
    await settle()
    set('fullscreenElement', document.documentElement)
    document.dispatchEvent(new Event('fullscreenchange'))
    set('fullscreenElement', null)
    document.dispatchEvent(new Event('fullscreenchange'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).toHaveBeenCalledTimes(1)
    set('hidden', true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(request).toHaveBeenCalledTimes(1)
    set('hidden', false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does nothing on unsupported browsers or after disposal', async () => {
    const request = setup(vi.fn(), false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).not.toHaveBeenCalled()
    dispose()
    set('fullscreenEnabled', true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(request).not.toHaveBeenCalled()
  })
})
