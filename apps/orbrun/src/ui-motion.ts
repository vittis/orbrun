/** UI motion always respects the OS preference, including with Dungeon animation On. */
export function uiMotionEnabled(el: HTMLElement): boolean {
  return !el.closest('[data-ui-motion="still"]') && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function canAnimate(el: HTMLElement): boolean {
  if (!el.isConnected || !uiMotionEnabled(el) || typeof el.animate !== 'function') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

type WindowEntry = { el: HTMLElement; animation?: Animation }

/** Presentation only: live windows take input immediately; retiring windows are inert. */
export class WindowTransitions {
  private windows = new Map<unknown, WindowEntry>()
  private exits = new Map<unknown, () => void>()

  constructor(private root: HTMLElement) {}

  /** Call before rebuilding a server stack. State object identity survives content updates. */
  retain(keys: unknown[]) {
    const keep = new Set(keys)
    for (const key of this.windows.keys()) if (!keep.has(key)) this.close(key)
  }

  show(key: unknown, el: HTMLElement) {
    this.exits.get(key)?.()
    const previous = this.windows.get(key)
    const time = previous?.animation?.currentTime
    const continuing = previous?.animation?.playState === 'running'
    previous?.animation?.cancel()
    const entry: WindowEntry = { el }
    this.windows.set(key, entry)
    if ((!previous || continuing) && canAnimate(el)) {
      // Opacity alone keeps canvas tiles at their native pixel size and positions.
      entry.animation = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, easing: 'cubic-bezier(.2,.7,.2,1)' })
      void entry.animation.finished.catch(() => {}) // cancellation is normal during a rebuild
      if (continuing && time != null) entry.animation.currentTime = time
    }
  }

  close(key: unknown) {
    const entry = this.windows.get(key)
    if (!entry) return
    this.windows.delete(key)
    const { el, animation } = entry
    const enabled = canAnimate(el)
    const opacity = enabled ? getComputedStyle(el).opacity : '1'
    animation?.cancel()
    if (!enabled) { el.remove(); return }
    // Keep the original canvases and scroll positions. A separate inert layer cannot
    // enter the live focus/scroll sets or darken another popup via stack selectors.
    const layer = document.createElement('div')
    layer.className = 'ui-exit'
    layer.inert = true
    layer.setAttribute('aria-hidden', 'true')
    for (const node of [el, ...el.querySelectorAll('[id]')]) node.removeAttribute('id')
    this.root.append(layer)
    layer.append(el)
    const exit = el.animate([{ opacity }, { opacity: 0 }], { duration: 90, easing: 'ease-out', fill: 'forwards' })
    void exit.finished.catch(() => {})
    const clean = () => {
      clearTimeout(timer)
      exit.onfinish = exit.oncancel = null
      exit.cancel()
      layer.remove()
      this.exits.delete(key)
    }
    const timer = setTimeout(clean, 150)
    exit.onfinish = exit.oncancel = clean
    this.exits.set(key, clean)
    // Rapid changes never accumulate an unbounded trail of retired windows.
    if (this.exits.size > 4) this.exits.values().next().value?.()
  }

  settle() {
    for (const entry of this.windows.values()) entry.animation?.cancel()
    for (const clean of this.exits.values()) clean()
  }

  destroy() {
    this.settle()
    this.windows.clear()
  }
}
