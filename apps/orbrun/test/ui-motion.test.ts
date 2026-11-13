// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowTransitions } from '../src/ui-motion'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  delete document.documentElement.dataset.uiMotion
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300 } as DOMRect)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

function setup() {
  const root = document.createElement('div')
  document.body.append(root)
  const windows = new WindowTransitions(root)
  const show = (key: unknown) => {
    const el = document.createElement('div')
    root.append(el)
    windows.show(key, el)
    return el
  }
  return { root, windows, show }
}

describe('window presentation lifecycle', () => {
  it('keeps the entrance clock across rebuilds and leaves settled content updates static', () => {
    const { root, windows, show } = setup()
    const key = {}
    const first = show(key)
    first.getAnimations()[0].currentTime = 65
    first.remove()
    const rebuilt = show(key)
    expect(rebuilt.getAnimations()[0].currentTime).toBe(65)
    rebuilt.getAnimations()[0].finish()
    rebuilt.remove()
    const settled = show(key)
    expect(settled.getAnimations()).toHaveLength(0)
    expect(root.children).toHaveLength(1)
    windows.destroy()
  })

  it('removes closed windows from the live stack immediately and cleans up a rapid reopen safely', () => {
    const { root, windows, show } = setup()
    const old = show('inventory')
    windows.retain([])
    const exit = old.parentElement!
    expect(exit.className).toBe('ui-exit')
    expect(exit.inert).toBe(true)
    expect(exit.getAttribute('aria-hidden')).toBe('true')
    const reopened = show('inventory')
    expect(old.isConnected).toBe(false)
    vi.advanceTimersByTime(200)
    expect(reopened.parentElement).toBe(root)
    expect(root.children).toHaveLength(1)
    windows.destroy()
  })

  it('settles pending motion and removes retiring windows on preference changes and destruction', () => {
    const { root, windows, show } = setup()
    show('spells')
    windows.close('spells')
    const inventory = show('inventory')
    windows.settle()
    expect(root.querySelector('.ui-exit')).toBeNull()
    expect(inventory.getAnimations()).toHaveLength(0)
    inventory.remove()
    expect(show('inventory').getAnimations()).toHaveLength(0)
    windows.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens and closes immediately with Still, reduced motion, or no laid-out surface', () => {
    const { root, windows, show } = setup()
    root.dataset.uiMotion = 'still'
    expect(show('still').getAnimations()).toHaveLength(0)
    windows.close('still')
    delete root.dataset.uiMotion
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(show('reduced').getAnimations()).toHaveLength(0)
    windows.close('reduced')
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList)
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect)
    show('hidden')
    windows.close('hidden')
    expect(root.children).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    windows.destroy()
  })
})
