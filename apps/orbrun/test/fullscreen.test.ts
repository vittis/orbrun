// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsPanel } from '../src/settings-panel'

const originalEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled')
const originalRequest = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen')

afterEach(() => {
  for (const [target, key, descriptor] of [
    [document, 'fullscreenEnabled', originalEnabled],
    [document.documentElement, 'requestFullscreen', originalRequest],
  ] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else Reflect.deleteProperty(target, key)
  }
})

function support(request: () => Promise<void>, enabled = true) {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled })
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request })
}

describe('fullscreen from the shared Interface settings', () => {
  it('requests fullscreen with system navigation hidden directly from the action', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    support(request)
    const panel = settingsPanel('Interface')
    const action = panel.rows.find((row) => row.dataset.focus === 'fullscreen')!
    expect(action.textContent).toContain('Go fullscreen')
    action.click()
    // The request happens synchronously in the click, before activation expires.
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' })
    await Promise.resolve()
    expect(panel.el.querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(true)
  })

  it('explains a rejected controller activation and allows a touch retry', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('User activation required')).mockResolvedValue(undefined)
    support(request)
    const panel = settingsPanel('Interface')
    const action = panel.rows.find((row) => row.dataset.focus === 'fullscreen')!
    const status = panel.el.querySelector<HTMLElement>('[role="status"]')!
    action.click()
    await Promise.resolve()
    expect(status.hidden).toBe(false)
    expect(status.textContent).toContain('Tap Go fullscreen')
    action.click()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(2)
    expect(status.hidden).toBe(true)
  })

  it('offers no action when the browser disallows fullscreen', () => {
    support(vi.fn(), false)
    expect(settingsPanel('Interface').rows.some((row) => row.dataset.focus === 'fullscreen')).toBe(false)
  })
})
