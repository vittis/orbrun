/** Browser-only fixture protocol. Full is exhaustive; smoke uses explicit representative cases. */
export const fixtureParams = new URLSearchParams(location.search)
export const fixtureProfile = fixtureParams.get('profile') === 'smoke' ? 'smoke' : 'full'
export const matrix = <T>(full: readonly T[], smoke: readonly T[]): readonly T[] => fixtureProfile === 'smoke' ? smoke : full
export const captures = fixtureParams.get('capture') === '1'
export interface FixtureResult { checks: number; failures: unknown[]; [key: string]: unknown }
interface FixtureState extends FixtureResult {
  schema: 1; fixture: string; profile: 'smoke' | 'full'; status: 'running' | 'complete' | 'error'
  passed: number; durationMs: number; progress: { cases: number; phase: string }; error?: string
}
declare global { interface Window { __orbrunFixture?: FixtureState } }
let started = 0
function publish() {
  const state = window.__orbrunFixture
  if (!state) return
  state.durationMs = Math.round(performance.now() - started)
  const output = document.querySelector('#result')
  if (output) output.textContent = JSON.stringify(state, null, 2)
}
export function fixtureStart(fixture: string) {
  started = performance.now()
  window.__orbrunFixture = { schema: 1, fixture, profile: fixtureProfile, status: 'running', checks: 0, passed: 0, failures: [], durationMs: 0, progress: { cases: 0, phase: 'starting' } }
  publish()
}
export function fixtureComplete(result: FixtureResult) {
  const state = window.__orbrunFixture!
  if (state.status === 'error') return // An asynchronous page error is terminal.
  Object.assign(state, result, { status: 'complete', passed: result.checks - result.failures.length })
  publish()
}
export function fixtureError(error: unknown) {
  if (!window.__orbrunFixture) return
  window.__orbrunFixture.status = 'error'
  window.__orbrunFixture.error = error instanceof Error ? error.stack ?? error.message : String(error)
  publish()
}
window.addEventListener('error', event => fixtureError(event.error ?? event.message))
window.addEventListener('unhandledrejection', event => fixtureError(event.reason))
export async function fixtureYield(phase?: string) {
  const state = window.__orbrunFixture
  if (state && phase) { state.progress = { cases: state.progress.cases + 1, phase }; publish() }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}
export function releaseCanvas(canvas: HTMLCanvasElement) { canvas.width = 0; canvas.height = 0 }
export function equalPixels(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
/** One readback per frame/region; repeated point assertions read ordinary CPU memory. */
export function pixelSampler(ctx: CanvasRenderingContext2D, dpr: number, bounds?: { x: number; y: number; width: number; height: number }) {
  const x = Math.floor((bounds?.x ?? 0) * dpr), y = Math.floor((bounds?.y ?? 0) * dpr)
  const width = Math.ceil((bounds?.width ?? ctx.canvas.width / dpr) * dpr), height = Math.ceil((bounds?.height ?? ctx.canvas.height / dpr) * dpr)
  const image = ctx.getImageData(x, y, width, height)
  return (px: number, py: number) => {
    const dx = Math.floor(px * dpr) - x, dy = Math.floor(py * dpr) - y
    if (dx < 0 || dy < 0 || dx >= width || dy >= height) throw new Error(`Fixture sample outside snapshot: ${px}, ${py}`)
    return Array.from(image.data.subarray((dy * width + dx) * 4, (dy * width + dx) * 4 + 4))
  }
}
