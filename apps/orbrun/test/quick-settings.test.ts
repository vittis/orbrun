// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickSettings } from '../src/quick-settings'
import { defaultSettings, getSettings, saveSettings } from '../src/settings'
import { chooseSetting, SETTING_ROWS, setExploreGame } from '../src/settings-rows'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) })
  document.body.replaceChildren()
  setExploreGame({ online: true })
})

function setup() {
  const changed = vi.fn(), closed = vi.fn()
  const panel = new QuickSettings(changed, closed)
  document.body.append(panel.root)
  panel.root.querySelector<HTMLButtonElement>('.quick-settings-toggle')!.click()
  const control = (key: string) => panel.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#quick-${key}`)!
  return { panel, control, changed, closed }
}

describe('quick View and Combat settings', () => {
  it('offers every shared row, applies slider/selector changes once, and preserves unrelated preferences on reset', () => {
    saveSettings({ ...defaultSettings, uiScale: 1.15, depthTilt: 42.5, hitGore: 1.5 })
    const { panel, control, changed } = setup()
    expect(panel.root.querySelectorAll('.quick-setting')).toHaveLength(SETTING_ROWS.filter(r => r.group === 'View' || r.group === 'Combat').length)
    expect(control('depthTilt').getAttribute('aria-valuetext')).toBe('42.5°')
    expect(getSettings().depthTilt).toBe(42.5)
    control('depthTilt').value = '12'
    control('depthTilt').dispatchEvent(new Event('input', { bubbles: true }))
    expect(getSettings().depthTilt).toBe(85)
    expect(changed).toHaveBeenCalledTimes(1)
    const increase = panel.root.querySelector<HTMLButtonElement>('[aria-label="Dungeon tilt increase"]')!
    expect(increase.disabled).toBe(true)
    increase.click()
    expect(getSettings().depthTilt).toBe(85)
    expect(changed).toHaveBeenCalledTimes(1)
    const still = SETTING_ROWS.find(r => r.key === 'depthAnimate')!.values.indexOf(false)
    control('depthAnimate').value = String(still)
    control('depthAnimate').dispatchEvent(new Event('change', { bubbles: true }))
    expect(getSettings().depthAnimate).toBe(false)
    expect(control('depthMovement').disabled).toBe(true)
    expect(control('meleeBumpSpeed').disabled).toBe(true)
    expect(control('exploreDelay').disabled).toBe(true)
    const reset = panel.root.querySelector<HTMLButtonElement>('#quick-settings-view .quick-settings-reset')!
    reset.click()
    expect(getSettings()).toMatchObject({ depthTilt: 50, depthAnimate: 'auto', hitGore: 1.5, uiScale: 1.15 })
    expect(control('meleeBumpSpeed').disabled).toBe(false)
    expect(reset.disabled).toBe(true)
  })

  it('rejects invalid or disabled direct values and refreshes after the full settings screen changes', () => {
    const { panel, control, changed } = setup()
    chooseSetting(SETTING_ROWS.find(r => r.key === 'depthZoom')!, 999, changed)
    chooseSetting(SETTING_ROWS.find(r => r.key === 'exploreDelay')!, 50, changed)
    expect(changed).not.toHaveBeenCalled()
    expect(getSettings()).toEqual(defaultSettings)
    saveSettings({ ...defaultSettings, deathGore: 1.75 })
    panel.refresh()
    expect(control('deathGore').getAttribute('aria-valuetext')).toBe('175%')
  })

  it('keeps keyboard and controller interaction in focused controls, and closes with Escape', () => {
    const { panel, control, closed } = setup()
    const leaked = vi.fn()
    document.body.addEventListener('keydown', leaked)
    control('depthZoom').focus()
    expect(panel.pad({ type: 'dir', source: 'dpad', dir: 2 })).toBe(true)
    expect(getSettings().depthZoom).toBe(1.05)
    panel.pad({ type: 'press', button: 'RB', t: 0 })
    expect(panel.root.querySelector('[aria-selected="true"]')!.textContent).toBe('Combat')
    const active = document.activeElement!
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(panel.open).toBe(false)
    expect(closed).toHaveBeenCalledOnce()
    expect(leaked).not.toHaveBeenCalled()
    const outside = document.createElement('button')
    document.body.append(outside); outside.focus()
    expect(panel.pad({ type: 'press', button: 'A', t: 1 })).toBe(false)
    document.body.removeEventListener('keydown', leaked)
  })
})
