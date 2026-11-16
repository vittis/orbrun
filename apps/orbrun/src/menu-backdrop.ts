import { h } from './dom'
import { getSettings } from './settings'

/** One silent recording, with no renderer, sound pack, or presentation clock. */
export class MenuBackdrop {
  readonly el = h('div', { class: 'menu-backdrop', 'aria-hidden': 'true' })
  readonly video = h('video', { muted: true, loop: true, playsinline: true, preload: 'none', poster: '/menu/poster.jpg', tabindex: -1 })
  private media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  private observer: MutationObserver
  private covered = false
  private destroyed = false
  private failed = false
  private generation = 0

  constructor(private host: HTMLElement) {
    this.video.muted = true
    this.el.append(this.video)
    host.prepend(this.el)
    this.video.addEventListener('error', this.fail)
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
    this.host.dataset.menuMotion = active ? 'on' : 'off'
    this.video.hidden = still || this.failed
    const generation = ++this.generation
    if (!active || this.failed) { this.video.pause(); return }
    if (!this.video.getAttribute('src')) this.video.src = '/menu/crawl.webm'
    // A rejected autoplay never prevents interaction; a later visibility/preference change may retry.
    void this.video.play()?.then(() => {
      if (this.destroyed || generation !== this.generation && this.host.dataset.menuMotion !== 'on') this.video.pause()
    }).catch(() => { if (generation === this.generation) this.video.hidden = true })
  }

  private fail = () => { this.failed = true; this.video.hidden = true; this.video.pause() }

  destroy() {
    this.destroyed = true
    this.generation++
    this.observer.disconnect()
    this.media?.removeEventListener?.('change', this.applySettings)
    document.removeEventListener('visibilitychange', this.applySettings)
    this.video.removeEventListener('error', this.fail)
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.el.remove()
  }
}
