import { h } from './dom'
import { getSettings } from './settings'
import type { MenuDemo } from './menu-demo'

/** Silent live encounter with an immediate, lightweight dungeon entrance while loading. */
export class MenuBackdrop {
  readonly el = h('div', { class: 'menu-backdrop', 'aria-hidden': 'true' })
  readonly canvas = h('canvas', { hidden: true })
  private media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  private observer: MutationObserver
  private covered = false
  private destroyed = false
  private failed = false
  private demo: MenuDemo | null = null
  private loading: AbortController | null = null
  private deadline: ReturnType<typeof setTimeout> | undefined

  constructor(private host: HTMLElement) {
    this.el.append(this.canvas, h('div', { class: 'menu-entrance' },
      h('div', { class: 'menu-entrance-door' }, h('span', {}, '@')),
      h('p', { class: 'menu-loading' }, 'Preparing a live encounter…')))
    host.prepend(this.el)
    this.media?.addEventListener?.('change', this.applySettings)
    document.addEventListener('visibilitychange', this.applySettings)
    this.observer = new MutationObserver(this.applySettings)
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-motion'] })
    this.applySettings()
  }

  cover(on: boolean) { this.covered = on; this.applySettings() }

  applySettings = () => {
    const still = getSettings().depthAnimate === false || !!this.media?.matches
    const active = !this.destroyed && !this.covered && !document.hidden && !still
    const supported = typeof Worker !== 'undefined' && typeof (WebAssembly as { Suspending?: unknown }).Suspending === 'function'
    this.el.dataset.loading = active && supported && !this.failed ? 'true' : 'false'
    this.host.dataset.menuMotion = active ? 'on' : 'off'
    this.demo?.setActive(active)
    if (!active) {
      clearTimeout(this.deadline)
      this.loading?.abort(); this.loading = null
      if (still) { this.demo?.destroy(); this.demo = null; this.canvas.hidden = true }
      return
    }
    if (this.demo || this.loading || this.failed || !supported) return
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
      })
      if (controller.signal.aborted || this.destroyed) { demo.destroy(); return }
      this.demo = demo
      demo.setActive(true)
    } catch {
      if (!controller.signal.aborted) {
        this.failed = true
        this.el.dataset.loading = 'false'
        this.demo?.destroy(); this.demo = null
        this.canvas.hidden = true
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
    this.el.remove()
  }
}
