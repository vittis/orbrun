import type { HintMode } from './gamepad-hints'

export interface Settings {
  depthTilt: number
  depthZoom: number
  depthAnimate: boolean | 'auto'
  depthMovement: boolean
  /** Seconds per confirmed move in Dungeon. */
  depthMovementDuration: number
  depthMovementEasing: 'ease-out' | 'smooth' | 'linear'
  uiScale: number
  confirmStairs: boolean
  /** Zero lets the layout choose a minimap size. */
  minimapTiles: number
  minimapCell: number
  messageLines: number
  hints: HintMode
  /** Local engine only; online servers use the player's rc file. */
  exploreDelay: number
}

const HINT_MODES: readonly string[] = ['adaptive', 'contextual', 'off']

/**
 * What a saved settings object says about hints, in the one field or in the
 * two it used to be split into: `gamepadHints` (adaptive/contextual/off) and
 * `keyHints` (a boolean), merged 2026-09-09. An old pad mode carries over; a
 * keyboard opt-out alone was the older global opt-out and still means off.
 */
function hintsFrom(saved: Record<string, unknown>): HintMode {
  for (const v of [saved.hints, saved.gamepadHints]) if (typeof v === 'string' && HINT_MODES.includes(v)) return v as HintMode
  if (saved.keyHints === false) return 'off'
  return 'adaptive'
}

const SETTINGS_KEY = 'orbrun.settings'
export const defaultSettings: Settings = {
  depthTilt: 50,
  depthZoom: 1,
  depthAnimate: 'auto',
  depthMovement: true,
  depthMovementDuration: 0.1,
  depthMovementEasing: 'ease-out',
  uiScale: 1,
  confirmStairs: false,
  minimapTiles: 0,
  minimapCell: 0,
  messageLines: 0,
  hints: 'adaptive',
  exploreDelay: 90,
}

/**
 * Supported preference domains match the settings UI, without snapping custom
 * values to its stops. Count and millisecond preferences use whole units.
 * Zero remains Auto for map/message sizes; -1 remains Instant for explore.
 * These bounds intentionally normalize unsupported values from older storage.
 */
type NumericSetting = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]
const numericDomains: Record<NumericSetting, { min: number; max: number; integer?: boolean; auto?: boolean }> = {
  depthTilt: { min: 35, max: 65 },
  depthZoom: { min: 0.8, max: 1.4 },
  depthMovementDuration: { min: 0.04, max: 0.25 },
  uiScale: { min: 0.85, max: 1.5 },
  minimapTiles: { min: 15, max: 61, integer: true, auto: true },
  minimapCell: { min: 8, max: 32, auto: true },
  messageLines: { min: 2, max: 20, integer: true, auto: true },
  exploreDelay: { min: -1, max: 200, integer: true },
}

function normalizeSettings(value: unknown): Settings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const s = { ...defaultSettings }
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const value = saved[key]
    const fallback = defaultSettings[key]
    if (typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value))) {
      (s as unknown as Record<string, unknown>)[key] = value
    }
  }
  s.hints = hintsFrom(saved)
  s.depthAnimate = saved.depthAnimate === true || saved.depthAnimate === false ? saved.depthAnimate : 'auto'
  for (const key of Object.keys(numericDomains) as NumericSetting[]) {
    const { min, max, integer, auto } = numericDomains[key]
    const value = s[key]
    s[key] = auto && value <= 0 ? 0 : Math.max(min, Math.min(max, integer ? Math.round(value) : value))
  }
  if (!['ease-out', 'smooth', 'linear'].includes(s.depthMovementEasing)) s.depthMovementEasing = defaultSettings.depthMovementEasing
  return s
}

/** Load supported preferences only; reading never changes stored data. */
export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return normalizeSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...defaultSettings }
  }
}

/** Persist normalized non-default preferences without touching accounts or saves. */
export function saveSettings(settings: Settings) {
  const s = normalizeSettings(settings)
  const out: Partial<Settings> = {}
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    if (s[key] !== defaultSettings[key]) (out as Record<string, unknown>)[key] = s[key]
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(out))
  } catch {
    // Storage can be disabled or full; preferences remain best-effort.
  }
}
