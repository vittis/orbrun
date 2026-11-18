import { DUNGEON_ZOOM, DUNGEON_TILT } from '@orbrun/render-2.5d/projection'
import { h } from './dom'
import { getSettings, saveSettings } from './settings'
import type { MenuDemo } from './menu-demo'
import { ReplayPlaylist } from './menu-replay'
import manifest from '../data/menu-replays.json'

/** Silent menu scenes with a lightweight dungeon entrance while loading. */
export class MenuBackdrop {
  readonly el = h('div', { class: 'menu-backdrop' })
  readonly canvas = h('canvas', { hidden: true, 'aria-hidden': 'true' })
  private tilt = h('input', { type: 'range', ...DUNGEON_TILT, step: 1, 'aria-label': 'Dungeon tilt' })
  private tiltValue = h('span', { class: 'menu-replay-value', 'aria-hidden': 'true' })
  private zoom = h('input', { type: 'range', min: DUNGEON_ZOOM.min * 100, max: DUNGEON_ZOOM.max * 100, step: 5, 'aria-label': 'Dungeon zoom' })
  private zoomValue = h('span', { class: 'menu-replay-value', 'aria-hidden': 'true' })
  private recording = h('select', { 'aria-label': 'Choose scene' },
    h('option', { value: '' }, 'Shuffle all'),
    ...manifest.clips.map(clip => h('option', { value: clip.file }, clip.title)))
  private sceneTitle = h('span', { class: 'menu-replay-title', 'aria-hidden': 'true' })
  private controls = h('div', { class: 'menu-replay-controls', role: 'group', 'aria-label': 'Dungeon replay', hidden: true },
    h('div', { class: 'menu-replay-scenes' },
      this.sceneArrow(-1),
      h('label', { class: 'menu-replay-picker', title: 'Choose scene or shuffle all' }, this.sceneTitle, this.recording),
      this.sceneArrow(1)),
    h('div', { class: 'menu-replay-camera' },
      h('label', { class: 'menu-replay-slider' }, 'Tilt', this.tilt, this.tiltValue),
      h('label', { class: 'menu-replay-slider' }, 'Zoom', this.zoom, this.zoomValue)))
  private status = h('span', { role: 'status' })
  private retry = h('button', { type: 'button', hidden: true }, 'Retry replay')
  private entrance = h('div', { class: 'menu-entrance' },
    h('div', { class: 'menu-orb-shrine', 'aria-hidden': 'true' },
      h('div', { class: 'menu-orb-relic' }, h('img', { src: '/orb.png', width: 32, height: 32, alt: '' })),
      h('pre', { class: 'menu-orb-altar' }, [
        '        ╱─────◇─────╲        ',
        '       ╱_____________╲       ',
        '       ╲══════╤══════╱       ',
        '          ░│  │  │░          ',
        '          ▒│  ◊  │▒          ',
        '       ┌───┴─────┴───┐       ',
        '    ───┴─────────────┴───    ',
      ].join('\n'))),
    h('div', { class: 'menu-replay-status' }, this.status, this.retry))
  private playlist = new ReplayPlaylist(manifest.clips.length)
  private entry = manifest.clips[this.playlist.next()]
  private covered = false
  private destroyed = false
  private failure = ''
  private hasPlayed = false
  private demo: MenuDemo | null = null
  private loading: AbortController | null = null
  private deadline: ReturnType<typeof setTimeout> | undefined

  constructor(private host: HTMLElement) {
    this.el.append(this.canvas, this.entrance, this.controls)
    this.retry.addEventListener('click', () => {
      this.switchTo(this.recording.value ? this.entry : manifest.clips[this.playlist.next()])
    })
    this.tilt.addEventListener('input', () => {
      saveSettings({ ...getSettings(), depthTilt: this.tilt.valueAsNumber })
    })
    this.zoom.addEventListener('input', () => {
      saveSettings({ ...getSettings(), depthZoom: this.zoom.valueAsNumber / 100 })
    })
    this.recording.addEventListener('change', () => {
      const chosen = manifest.clips.find(clip => clip.file === this.recording.value)
      this.switchTo(chosen ?? manifest.clips[this.playlist.next(manifest.clips.indexOf(this.entry))])
    })
    host.prepend(this.el)
    document.addEventListener('visibilitychange', this.applySettings)
    window.addEventListener('orbrun-settings', this.applySettings)
    // Release immutable downloads left by the retired menu engine, never offline saves.
    if (typeof caches !== 'undefined') void caches.keys().then(names => Promise.all(
      names.filter(name => name.startsWith('orbrun-menu-assets-v1-')).map(name => caches.delete(name)),
    )).catch(() => {})
    this.applySettings()
  }

  private sceneArrow(direction: -1 | 1) {
    const label = direction < 0 ? 'Previous scene' : 'Next scene'
    return h('button', { type: 'button', class: 'menu-replay-arrow', 'aria-label': label, title: label, onclick: () => {
      const clips = manifest.clips
      const next = clips[(clips.indexOf(this.entry) + direction + clips.length) % clips.length]
      this.recording.value = next.file
      this.switchTo(next)
    } }, h('span', { 'aria-hidden': 'true' }, direction < 0 ? '‹' : '›'))
  }

  cover(on: boolean) { this.covered = on; this.applySettings() }

  private switchTo(entry: typeof this.entry) {
    this.entry = entry
    this.failure = ''
    this.demo?.destroy(); this.demo = null
    this.loading?.abort(); this.loading = null
    clearTimeout(this.deadline)
    this.applySettings()
  }

  private applySettings = () => {
    const settings = getSettings()
    this.sceneTitle.textContent = this.entry.title
    this.recording.setAttribute('aria-description', 'Current scene: ' + this.entry.title)
    this.tilt.value = String(settings.depthTilt)
    this.tiltValue.textContent = `${settings.depthTilt}°`
    this.tilt.setAttribute('aria-valuetext', `${settings.depthTilt} degrees`)
    const zoomPercent = Math.round(settings.depthZoom * 100)
    this.zoom.value = String(zoomPercent)
    this.zoomValue.textContent = zoomPercent + '%'
    this.zoom.setAttribute('aria-valuetext', zoomPercent + '%')
    const active = !this.destroyed && !this.covered && !document.hidden
    this.controls.hidden = !active || !this.hasPlayed
    this.el.dataset.loading = String(active && !this.demo && !this.failure)
    this.entrance.hidden = this.destroyed || this.covered || document.hidden
    this.retry.hidden = !active || !this.failure
    const message = this.failure || 'Loading dungeon replay…'
    if (this.status.textContent !== message) this.status.textContent = message
    this.host.dataset.menuMotion = active ? 'on' : 'off'
    this.demo?.setActive(active)
    if (active) this.demo?.refresh()
    if (!active) {
      clearTimeout(this.deadline)
      this.loading?.abort(); this.loading = null
      return
    }
    if (this.demo || this.loading || this.failure) return
    void this.start()
  }

  private async start() {
    const controller = this.loading = new AbortController()
    const progress = () => {
      if (controller.signal.aborted) return
      clearTimeout(this.deadline)
      this.deadline = setTimeout(() => {
        this.reportFailure(new Error('No replay asset progress for 60 seconds'), 'Replay download timed out')
      }, 60_000)
    }
    progress()
    try {
      const { loadMenuDemo } = await import('./menu-demo')
      if (controller.signal.aborted) return
      const demo = await loadMenuDemo(this.canvas, controller.signal, this.entry, {
        progress, failed: this.reportFailure,
        finished: () => {
          if (!this.recording.value) this.switchTo(manifest.clips[this.playlist.next()])
        },
      })
      if (controller.signal.aborted || this.destroyed) { demo.destroy(); return }
      this.demo = demo
      demo.setActive(true)
      this.hasPlayed = true
      this.controls.hidden = false
      this.el.dataset.loading = 'false'
    } catch (error) {
      if (!controller.signal.aborted) this.reportFailure(error)
    } finally {
      if (this.loading === controller) { clearTimeout(this.deadline); this.loading = null }
    }
  }

  private reportFailure = (error: unknown, message = 'Replay could not load') => {
    console.warn('Menu replay unavailable', this.entry.file, error)
    clearTimeout(this.deadline)
    this.loading?.abort(); this.loading = null
    this.failure = message
    this.demo?.destroy(); this.demo = null
    this.canvas.hidden = true
    this.applySettings()
  }

  destroy() {
    this.destroyed = true
    this.applySettings()
    this.demo?.destroy(); this.demo = null
    document.removeEventListener('visibilitychange', this.applySettings)
    window.removeEventListener('orbrun-settings', this.applySettings)
    this.el.remove()
  }
}
