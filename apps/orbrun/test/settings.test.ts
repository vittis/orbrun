import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, getSettings, saveSettings, type Settings } from '../src/settings'

const key = 'orbrun.settings'
let store: Map<string, string>
beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('settings storage boundary', () => {
  it.each(['{', 'null', '[]', '42', 'true', '"settings"'])('ignores malformed or non-object storage: %s', raw => {
    store.set(key, raw)
    expect(getSettings()).toEqual(defaultSettings)
    expect(store.get(key)).toBe(raw)
  })

  it('handles unavailable storage and returns independent defaults', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('full') },
    })
    const settings = getSettings()
    settings.depthTilt = 65
    expect(getSettings()).toEqual(defaultSettings)
    expect(() => saveSettings(settings)).not.toThrow()
  })

  it('migrates only settings, preserves other storage bytes, and writes only supported overrides', () => {
    for (const name of ['accounts', 'account', 'tokens', 'games', 'servers', 'last', 'accountUsed', 'save', 'rc']) {
      store.set('orbrun.' + name, ' untouched bytes ' + name)
    }
    const unrelated = new Map(store)
    const raw = JSON.stringify({ renderer: '3d', combatPopups: false, fov: 100, viewmodel: true, keyHints: false, gamepadHints: 'contextual', depthTilt: 42, uiScale: 1.12 })
    store.set(key, raw)
    const s = getSettings()
    expect(s.hints).toBe('contextual')
    expect(store.get(key)).toBe(raw)
    saveSettings(s)
    expect(JSON.parse(store.get(key)!)).toEqual({ depthTilt: 42, uiScale: 1.12, hints: 'contextual' })
    for (const [name, bytes] of unrelated) expect(store.get(name)).toBe(bytes)
    expect(store.size).toBe(unrelated.size + 1)
    saveSettings({ ...defaultSettings })
    expect(store.get(key)).toBe('{}')
  })

  it.each([
    [{ hints: 'off', gamepadHints: 'contextual', keyHints: true }, 'off'],
    [{ hints: 'invalid', gamepadHints: 'contextual', keyHints: false }, 'contextual'],
    [{ gamepadHints: 'invalid', keyHints: false }, 'off'],
    [{ hints: 7, keyHints: true }, 'adaptive'],
  ])('retains hint migration precedence for %j', (saved, hints) => {
    store.set(key, JSON.stringify(saved))
    expect(getSettings().hints).toBe(hints)
  })

  it('validates booleans and unions on both read and write', () => {
    const invalid = { depthAnimate: 'yes', depthMovement: 'false', confirmStairs: 1, depthMovementEasing: 'bounce' }
    store.set(key, JSON.stringify(invalid))
    expect(getSettings()).toEqual(defaultSettings)
    saveSettings({ ...defaultSettings, ...invalid } as unknown as Settings)
    expect(store.get(key)).toBe('{}')
    for (const depthAnimate of [true, false, 'auto'] as const) {
      saveSettings({ ...defaultSettings, depthAnimate, depthMovement: false, confirmStairs: true, depthMovementEasing: 'linear' })
      expect(getSettings()).toMatchObject({ depthAnimate, depthMovement: false, confirmStairs: true, depthMovementEasing: 'linear' })
    }
  })
})

const numericKeys = ['depthTilt', 'depthZoom', 'depthMovementDuration', 'uiScale', 'minimapTiles', 'minimapCell', 'messageLines', 'exploreDelay'] as const
describe('numeric preference validation', () => {
  it.each(numericKeys)('rejects invalid %s values on read and write', name => {
    for (const value of [null, true, '12', {}, [], NaN, Infinity, -Infinity]) {
      store.set(key, JSON.stringify({ [name]: value }))
      expect(getSettings()[name]).toBe(defaultSettings[name])
      saveSettings({ ...defaultSettings, [name]: value } as Settings)
      expect(store.get(key)).toBe('{}')
    }
    // JSON permits exponents that overflow while parsing.
    store.set(key, `{"${name}":1e999}`)
    expect(getSettings()[name]).toBe(defaultSettings[name])
  })

  it.each([
    ['depthTilt', -10, 35], ['depthTilt', 100, 65],
    ['depthZoom', 0, 0.8], ['depthZoom', 2, 1.4],
    ['depthMovementDuration', 0, 0.04], ['depthMovementDuration', 1, 0.25],
    ['uiScale', 0, 0.85], ['uiScale', 9, 1.5],
    ['minimapTiles', -10, 0], ['minimapTiles', 2, 15], ['minimapTiles', 130, 61], ['minimapTiles', 18.6, 19],
    ['minimapCell', -1, 0], ['minimapCell', 1, 8], ['minimapCell', 64, 32],
    ['messageLines', -2, 0], ['messageLines', 1, 2], ['messageLines', 99, 20], ['messageLines', 4.6, 5],
    ['exploreDelay', -2, -1], ['exploreDelay', 900, 200], ['exploreDelay', 75.6, 76],
  ] as const)('normalizes %s=%s to %s consistently', (name, value, expected) => {
    store.set(key, JSON.stringify({ [name]: value }))
    expect(getSettings()[name]).toBe(expected)
    saveSettings({ ...defaultSettings, [name]: value })
    expect(getSettings()[name]).toBe(expected)
    expect(JSON.parse(store.get(key)!)[name] ?? defaultSettings[name]).toBe(expected)
  })

  it('preserves non-stop custom values and all Auto/Instant semantics', () => {
    const custom = { ...defaultSettings, depthTilt: 42.5, depthZoom: 1.1, depthMovementDuration: 0.123, uiScale: 1.12, minimapTiles: 18, minimapCell: 18.5, messageLines: 7, exploreDelay: 75 }
    saveSettings(custom)
    expect(getSettings()).toEqual(custom)
    saveSettings({ ...custom, minimapTiles: 0, minimapCell: 0, messageLines: 0, exploreDelay: -1 })
    expect(getSettings()).toMatchObject({ minimapTiles: 0, minimapCell: 0, messageLines: 0, exploreDelay: -1 })
    saveSettings({ ...defaultSettings, exploreDelay: 0 })
    expect(getSettings().exploreDelay).toBe(0)
  })
})
