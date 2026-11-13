// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defaultSettings, getSettings, saveSettings } from '../src/settings'
import { settingsPanel } from '../src/settings-panel'
import { adjustSetting, ALL_SETTING_ROWS, groupAtDefaults, resetGroup, settingGroups, MESSAGE_LINES_AUTO, MINIMAP_AUTO, rowHint, rowOff, SETTING_ROWS, settingValue, messageLinesOf, setAutoMessageLines, setAutoMinimap, exploreOptions, setExploreGame } from '../src/settings-rows'

// happy-dom's localStorage has no working methods; give settings.ts a plain one
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
})

/** Any row, offered or not; `SETTING_ROWS` is what the player sees. */
const row = (label: string) => ALL_SETTING_ROWS.find((r) => r.label === label)!

describe('what is written down', () => {
  beforeEach(() => store.clear())

  it('round-trips every offered setting value without normalization changing it', () => {
    for (const row of ALL_SETTING_ROWS) {
      for (const value of row.values) {
        saveSettings({ ...defaultSettings, [row.key]: value })
        expect(getSettings()[row.key], `${row.key}=${value}`).toBe(value)
      }
    }
  })

})

describe('Dungeon presentation', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))

  it('persists movement options, gates them in still mode, and resets the View defaults', () => {
    saveSettings({ ...defaultSettings })
    expect(settingValue(row('Dungeon move duration'))).toBe('100 ms')
    expect(settingValue(row('Dungeon move easing'))).toBe('Snappy')
    adjustSetting(row('Dungeon move duration'), 1)
    adjustSetting(row('Dungeon move easing'), 1)
    expect(getSettings()).toMatchObject({ depthMovementDuration: 0.14, depthMovementEasing: 'smooth' })
    adjustSetting(row('Dungeon movement'), 1)
    expect(getSettings().depthMovement).toBe(false)
    expect(rowOff(row('Dungeon move duration'))).toBe(true)
    saveSettings({ ...getSettings(), depthMovement: true, depthAnimate: false })
    for (const label of ['Dungeon movement', 'Dungeon move duration', 'Dungeon move easing']) expect(rowOff(row(label))).toBe(true)
    resetGroup('View')
    expect(getSettings()).toMatchObject({ depthMovement: true, depthMovementDuration: 0.1, depthMovementEasing: 'ease-out' })
  })
})

describe('Hints', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))

  it('is one row for gamepad and keyboard, adaptive by default, then contextual, then off', () => {
    const hints = row('Hints')
    expect(defaultSettings.hints).toBe('adaptive')
    expect(SETTING_ROWS).toContain(hints)
    expect(hints.group).toBe('Controls')
    expect(settingValue(hints)).toBe('Adaptive')
    expect(rowOff(hints)).toBe(false)
    expect(adjustSetting(hints, 1)).toBe('Contextual only')
    expect(getSettings().hints).toBe('contextual')
    expect(adjustSetting(hints, 1)).toBe('Off')
    expect(getSettings().hints).toBe('off')
    expect(adjustSetting(hints, 1)).toBe('Adaptive')
  })
})

describe('Minimap size', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))

  it('is Auto by default, and any other stop reads as a tile count', () => {
    const size = row('Minimap size')
    expect(defaultSettings.minimapTiles).toBe(MINIMAP_AUTO)
    expect(settingValue(size)).toBe('Auto (19 tiles)')
    saveSettings({ ...defaultSettings, minimapTiles: 19 })
    expect(settingValue(size)).toBe('19 tiles')
    expect(rowOff(size)).toBe(false)
    expect(rowHint(size)).toMatch(/tiles across/)
  })

  it('right from Auto is the fewest tiles, left the most; then right is two tiles more, left two fewer', () => {
    const size = row('Minimap size')
    expect(adjustSetting(size, 1)).toBe('15 tiles')
    expect(adjustSetting(size, -1)).toBe('Auto (19 tiles)')
    expect(adjustSetting(size, -1)).toBe('61 tiles')
    saveSettings({ ...defaultSettings, minimapTiles: 19 })
    expect(adjustSetting(size, 1)).toBe('21 tiles')
    expect(getSettings().minimapTiles).toBe(21)
    expect(adjustSetting(size, -1)).toBe('19 tiles')
    expect(adjustSetting(size, -1)).toBe('17 tiles')
    expect(getSettings().minimapTiles).toBe(17)
  })
})

describe('Minimap tile size', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))

  it('is Auto by default, and any other stop reads in px', () => {
    const cell = row('Minimap tile size')
    expect(defaultSettings.minimapCell).toBe(MINIMAP_AUTO)
    expect(settingValue(cell)).toBe('Auto (20px)')
    saveSettings({ ...defaultSettings, minimapCell: 20 })
    expect(settingValue(cell)).toBe('20px')
    expect(rowOff(cell)).toBe(false)
  })

  it('right is the next cell up, left the one down, and the tile count is left alone', () => {
    const cell = row('Minimap tile size')
    expect(adjustSetting(cell, 1)).toBe('8px')
    expect(adjustSetting(cell, -1)).toBe('Auto (20px)')
    saveSettings({ ...defaultSettings, minimapCell: 20 })
    expect(adjustSetting(cell, 1)).toBe('24px')
    expect(getSettings().minimapCell).toBe(24)
    expect(adjustSetting(cell, -1)).toBe('20px')
    expect(adjustSetting(cell, -1)).toBe('16px')
    expect(getSettings().minimapCell).toBe(16)
    expect(getSettings().minimapTiles).toBe(defaultSettings.minimapTiles)
  })
})

describe('Message lines', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))

  it('is an Interface row, Auto by default (the server\'s layout), any other stop reading as lines', () => {
    const lines = row('Message lines')
    expect(SETTING_ROWS).toContain(lines)
    expect(lines.group).toBe('Interface')
    expect(defaultSettings.messageLines).toBe(MESSAGE_LINES_AUTO)
    expect(settingValue(lines)).toBe('Auto (6 lines)')
    saveSettings({ ...defaultSettings, messageLines: 4 })
    expect(settingValue(lines)).toBe('4 lines')
    expect(rowOff(lines)).toBe(false)
    expect(rowHint(lines)).toMatch(/msg_webtiles_height/)
  })

  it('right from Auto is the fewest lines, left the most; then a line a step', () => {
    const lines = row('Message lines')
    expect(adjustSetting(lines, 1)).toBe('2 lines')
    expect(adjustSetting(lines, -1)).toBe('Auto (6 lines)')
    expect(adjustSetting(lines, -1)).toBe('20 lines')
    saveSettings({ ...defaultSettings, messageLines: 6 })
    expect(adjustSetting(lines, 1)).toBe('7 lines')
    expect(adjustSetting(lines, -1)).toBe('6 lines')
    expect(adjustSetting(lines, -1)).toBe('5 lines')
    expect(getSettings().messageLines).toBe(5)
  })

  it('reads Auto with what the game\'s server asks for, and crawl\'s 6 again once the game is gone', () => {
    const lines = row('Message lines')
    setAutoMessageLines(9)
    expect(settingValue(lines)).toBe('Auto (9 lines)')
    setAutoMessageLines(null)
    expect(settingValue(lines)).toBe('Auto (6 lines)')
  })
})

describe('Responsive supporting views', () => {
  beforeEach(() => saveSettings({ ...defaultSettings }))
  afterEach(() => vi.unstubAllGlobals())

  /** a phone to grid/host.ts `isPhone`: a finger for a pointer, a short side under 600px */
  const phone = (held: 'upright' | 'sideways') => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
    vi.stubGlobal('screen', { width: 390, height: 844 })
    vi.stubGlobal('innerWidth', held === 'upright' ? 390 : 844)
    vi.stubGlobal('innerHeight', held === 'upright' ? 844 : 390)
  }

  it('the minimap\'s Auto reads what a game drew it as, and where Auto starts again once the game is gone', () => {
    setAutoMinimap({ tiles: 17, cell: 16 })
    expect(settingValue(row('Minimap size'))).toBe('Auto (17 tiles)')
    expect(settingValue(row('Minimap tile size'))).toBe('Auto (16px)')
    saveSettings({ ...defaultSettings, minimapTiles: 25 })
    expect(settingValue(row('Minimap size'))).toBe('25 tiles')
    setAutoMinimap(null)
    expect(settingValue(row('Minimap tile size'))).toBe('Auto (20px)')
  })

  it('Message lines on Auto is 4 on a phone, whatever the server asks; a chosen count anywhere', () => {
    expect(messageLinesOf(defaultSettings, 9, true)).toBe(4)
    expect(messageLinesOf(defaultSettings, 9, false)).toBe(9)
    expect(messageLinesOf({ ...defaultSettings, messageLines: 8 }, 9, true)).toBe(8)
    setAutoMessageLines(9)
    phone('sideways')
    expect(settingValue(row('Message lines'))).toBe('Auto (4 lines)')
    setAutoMessageLines(null)
  })

  it('upright, the minimap\'s Auto reads the band\'s 15 tiles, as on its side', () => {
    phone('upright')
    expect(settingValue(row('Minimap size'))).toBe('Auto (15 tiles)')
  })
})

describe('what left and right do', () => {
  beforeEach(() => {
    store.clear()
    saveSettings({ ...defaultSettings })
  })

  /**
   * One group to a page (settings-panel.ts): the settings screen and the pause
   * menu both list the groups as rows, so every offered row has to sit in one
   * of them, and every group has to have a line to print under its name.
   */
  it('lays every offered row out in one of the groups, each with its own line', () => {
    const groups = settingGroups()
    expect(groups.map((g) => g.group)).toEqual(['View', 'Combat', 'Controls', 'Interface'])
    for (const g of groups) {
      expect(g.hint.length).toBeGreaterThan(0)
      expect(g.rows.length).toBeGreaterThan(0)
    }
    expect(groups.flatMap((g) => g.rows)).toEqual([...SETTING_ROWS])
  })
})

describe('settings: reset a page to its defaults', () => {
  beforeEach(() => store.clear())

  it("puts back only the page's own settings, and leaves the rest as they were", () => {
    saveSettings({ ...defaultSettings, depthTilt: 35, depthZoom: 1.4, uiScale: 1.3, messageLines: 8 })
    expect(groupAtDefaults('View')).toBe(false)
    resetGroup('View')
    const s = getSettings()
    expect(s.depthTilt).toBe(defaultSettings.depthTilt)
    expect(s.depthZoom).toBe(defaultSettings.depthZoom)
    expect(groupAtDefaults('View')).toBe(true)
    expect(s.uiScale).toBe(1.3)
    expect(s.messageLines).toBe(8)
    resetGroup('Interface')
    expect(getSettings().uiScale).toBe(defaultSettings.uiScale)
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe(String(defaultSettings.uiScale))
  })

  it("is a row of each page, above Back, dark while there is nothing to put back", () => {
    const onchange = () => void changes++
    let changes = 0
    for (const { group } of settingGroups()) {
      const panel = settingsPanel(group, { onchange, back: () => {} })
      const ids = panel.rows.map((r) => r.dataset.focus)
      expect(ids.slice(-2)).toEqual(['settings-reset', 'settings-back'])
      const reset = panel.rows[ids.indexOf('settings-reset')]
      expect(reset.classList.contains('off')).toBe(true)
      reset.click()
      expect(changes).toBe(0)
    }
    saveSettings({ ...defaultSettings, hints: 'off' })
    const panel = settingsPanel('Controls', { onchange })
    const reset = panel.rows.find((r) => r.dataset.focus === 'settings-reset')!
    expect(reset.classList.contains('off')).toBe(false)
    reset.click()
    expect(getSettings().hints).toBe('adaptive')
    expect(changes).toBe(1)
    expect(reset.classList.contains('off')).toBe(true)
  })
})

describe('Explore delay', () => {
  afterEach(() => setExploreGame(null))
  const at = (exploreDelay: number) => ({ ...defaultSettings, exploreDelay })

  it('gives a game on this device 90 ms a step by default, and nothing on Instant', () => {
    expect(defaultSettings.exploreDelay).toBe(90)
    expect(exploreOptions(at(90), '')).toEqual(['explore_delay=90'])
    expect(exploreOptions(at(-1), '')).toEqual([])
  })

  it('leaves it to an rc file that sets explore_delay or travel_delay, which an explore follows', () => {
    expect(exploreOptions(at(90), '# explore_delay = 10\nshow_more = false\n')).toEqual(['explore_delay=90'])
    expect(exploreOptions(at(90), 'Explore_Delay=10\n')).toEqual([])
    expect(exploreOptions(at(90), '  travel_delay = 20\n')).toEqual([])
  })

  it('is off in an online game and under an rc that paces explore, and says why', () => {
    const r = row('Explore delay (per step)')
    expect(rowOff(r)).toBe(false)
    setExploreGame({ online: false, rc: '' })
    expect(rowOff(r)).toBe(false)
    setExploreGame({ online: false, rc: 'explore_delay = 40\n' })
    expect(rowOff(r)).toBe(true)
    expect(rowHint(r)).toContain('explore_delay = 40')
    setExploreGame({ online: true })
    expect(rowOff(r)).toBe(true)
    expect(rowHint(r)).toContain('Online')
  })
})


describe('Dungeon-only settings migration', () => {
  beforeEach(() => store.clear())
  it('offers Dungeon settings immediately with no projection or first-person controls', () => {
    expect(getSettings()).toEqual(defaultSettings)
    for (const label of ['Projection', 'Hands', 'Field of view', 'Camera height', 'Camera angle', 'Nearby', 'Predictive movement', 'Keyboard left/right', 'Gamepad left/right', 'Swipe to turn', 'Look sensitivity', 'Invert look']) expect(SETTING_ROWS.some(r => r.label === label)).toBe(false)
    for (const label of ['Dungeon tilt', 'Dungeon zoom', 'Dungeon animation']) expect(rowOff(row(label))).toBe(false)
  })
})


describe('Hit bump preferences', () => {
  beforeEach(() => store.clear())
  it('persists bump tuning, honors Still/Off, and resets only combat', () => {
    saveSettings({ ...defaultSettings, meleeBumpStrength: 1.5, meleeBumpSnap: 0.5, depthZoom: 1.2 })
    expect(getSettings()).toMatchObject({ meleeBumpStrength: 1.5, meleeBumpSnap: 0.5 })
    expect(rowOff(row('Hit bump strength'), { ...defaultSettings, depthAnimate: false })).toBe(true)
    expect(rowOff(row('Hit bump snap'), { ...defaultSettings, meleeBumpStrength: 0 })).toBe(true)
    resetGroup('Combat')
    expect(getSettings()).toMatchObject({ meleeBumpStrength: 1, meleeBumpSnap: 1, depthZoom: 1.2 })
  })
  it('drops retired VFX settings without losing bump tuning or unrelated preferences', () => {
    store.set('orbrun.settings', JSON.stringify({ meleeEffects: false, meleeMotion: 0, meleeWeight: 1.5, meleeTrail: 0.4,
      meleeBumpStrength: 1.5, meleeBumpSnap: 0.5, depthZoom: 1.2 }))
    const s = getSettings()
    expect(s).toMatchObject({ meleeBumpStrength: 1.5, meleeBumpSnap: 0.5, depthZoom: 1.2 })
    expect(rowOff(row('Hit bump strength'), s)).toBe(false)
    for (const key of ['meleeEffects', 'meleeMotion', 'meleeWeight', 'meleeTrail']) expect(s).not.toHaveProperty(key)
    saveSettings(s)
    expect(JSON.parse(store.get('orbrun.settings')!)).toEqual({ meleeBumpStrength: 1.5, meleeBumpSnap: 0.5, depthZoom: 1.2 })
    expect(settingGroups().find(g => g.group === 'Combat')!.rows.map(r => r.key)).toEqual(['meleeBumpStrength', 'meleeBumpSnap'])
  })
  it('clamps malformed or out-of-range bump tuning', () => {
    store.set('orbrun.settings', JSON.stringify({ meleeBumpStrength: 99, meleeBumpSnap: -1 }))
    expect(getSettings()).toMatchObject({ meleeBumpStrength: 1.5, meleeBumpSnap: 0 })
  })
})
