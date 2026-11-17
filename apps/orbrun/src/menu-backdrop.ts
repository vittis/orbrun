import { h } from './dom'
import { getSettings, saveSettings } from './settings'
import type { MenuDemo } from './menu-demo'
import manifest from '../data/menu-replays.json'

/** Silent recorded gameplay with an immediate, lightweight dungeon entrance while loading. */
export class MenuBackdrop {
  readonly el = h('div', { class: 'menu-backdrop' })
  readonly canvas = h('canvas', { hidden: true, 'aria-hidden': 'true' })
  private tilt = h('input', { type: 'range', min: 25, max: 85, step: 1, 'aria-label': 'Dungeon tilt' })
  private tiltValue = h('span', { class: 'menu-replay-angle', 'aria-hidden': 'true' })
  private recording = h('select', { 'aria-label': 'Choose recording' },
    h('option', { value: '' }, 'Shuffle all'),
    ...manifest.clips.map(clip => h('option', { value: clip.file }, clip.title)))
  private controls = h('div', { class: 'menu-replay-controls', hidden: true },
    h('label', { class: 'menu-replay-picker' }, h('span', {}, 'Choose recording'), this.recording),
    h('label', { class: 'menu-replay-tilt' }, h('span', {}, 'Dungeon tilt'), this.tiltValue, this.tilt))
  private media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  private observer: MutationObserver
  private covered = false
  private destroyed = false
  private failed = false
  private demo: MenuDemo | null = null
  private loading: AbortController | null = null
  private deadline: ReturnType<typeof setTimeout> | undefined

  constructor(private host: HTMLElement) {
    this.el.append(this.canvas, h('div', { class: 'menu-entrance', 'aria-hidden': 'true' },
      h('div', { class: 'menu-entrance-door' }, h('span', {}, '@')),
      h('p', { class: 'menu-loading' }, 'Loading dungeon scenes…')), this.controls)
    this.tilt.addEventListener('input', () => {
      saveSettings({ ...getSettings(), depthTilt: this.tilt.valueAsNumber })
    })
    this.recording.addEventListener('change', () => this.demo?.chooseRecording(this.recording.value || null))
    host.prepend(this.el)
    this.media?.addEventListener?.('change', this.applySettings)
    document.addEventListener('visibilitychange', this.applySettings)
    window.addEventListener('orbrun-settings', this.applySettings)
    this.observer = new MutationObserver(this.applySettings)
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-motion'] })
    // Release immutable downloads left by the retired menu engine, never offline saves.
    if (typeof caches !== 'undefined') void caches.keys().then(names => Promise.all(
      names.filter(name => name.startsWith('orbrun-menu-assets-v1-')).map(name => caches.delete(name)),
    )).catch(() => {})
    this.applySettings()
  }

  cover(on: boolean) { this.covered = on; this.applySettings() }

  applySettings = () => {
    const settings = getSettings()
    this.tilt.value = String(settings.depthTilt)
    this.tiltValue.textContent = `${settings.depthTilt}°`
    this.tilt.setAttribute('aria-valuetext', `${settings.depthTilt} degrees`)
    const still = settings.depthAnimate === false || !!this.media?.matches
    const active = !this.destroyed && !this.covered && !document.hidden && !still
    this.controls.hidden = !active || !this.demo || this.failed
    this.el.dataset.loading = active && !this.failed ? 'true' : 'false'
    this.host.dataset.menuMotion = active ? 'on' : 'off'
    this.demo?.setActive(active)
    if (active) this.demo?.refresh()
    if (!active) {
      clearTimeout(this.deadline)
      this.loading?.abort(); this.loading = null
      if (still) { this.demo?.destroy(); this.demo = null; this.canvas.hidden = true }
      return
    }
    if (this.demo || this.loading || this.failed) return
    void this.start()
  }

  private async start() {
    const controller = this.loading = new AbortController()
    this.deadline = setTimeout(() => { this.failed = true; this.el.dataset.loading = 'false'; controller.abort() }, 60_000)
    try {
      const { loadMenuDemo } = await import('./menu-demo')
      if (controller.signal.aborted) return
      const demo = await loadMenuDemo(this.canvas, controller.signal, () => {
        this.failed = true; this.demo = null; this.el.dataset.loading = 'false'
        this.controls.hidden = true
      })
      if (controller.signal.aborted || this.destroyed) { demo.destroy(); return }
      this.demo = demo
      if (this.recording.value) demo.chooseRecording(this.recording.value)
      if (this.demo !== demo) return
      demo.setActive(true)
      this.controls.hidden = false
    } catch {
      if (!controller.signal.aborted) {
        this.failed = true
        this.el.dataset.loading = 'false'
        this.demo?.destroy(); this.demo = null
        this.canvas.hidden = true
        this.controls.hidden = true
      }
    } finally {
      if (this.loading === controller) { clearTimeout(this.deadline); this.loading = null }
    }
  }

  destroy() {
    this.destroyed = true
    this.applySettings()
    this.demo?.destroy(); this.demo = null
    this.observer.disconnect()
    this.media?.removeEventListener?.('change', this.applySettings)
    document.removeEventListener('visibilitychange', this.applySettings)
    window.removeEventListener('orbrun-settings', this.applySettings)
    this.el.remove()
  }
}
