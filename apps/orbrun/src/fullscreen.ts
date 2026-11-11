/** Fullscreen is the launch default; a browser may require the first tap/key. */
export function installFullscreen(): () => void {
  let pending = false
  let disposed = false
  let entered = !!document.fullscreenElement
  let exited = false

  const enter = () => {
    if (disposed || pending || exited || document.hidden || document.fullscreenElement ||
      !document.fullscreenEnabled || !document.documentElement.requestFullscreen) return
    pending = true
    try {
      // Keep this call synchronous in the gesture: awaiting first loses activation.
      void document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .catch(() => { /* Launch without activation: retry on the first tap/key. */ })
        .finally(() => { pending = false })
    } catch {
      pending = false
    }
  }
  const pointer = (ev: PointerEvent) => {
    // Touch/pen activate on pointerup; a mouse activates on pointerdown.
    if ((ev.type === 'pointerdown') === (ev.pointerType === 'mouse')) enter()
  }
  const key = (ev: KeyboardEvent) => {
    if (!ev.repeat && ev.key !== 'Escape' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) enter()
  }
  const changed = () => {
    if (document.fullscreenElement) entered = true
    else if (entered) {
      // Respect an explicit Escape/Back until the next app visit.
      entered = false
      exited = true
    }
  }
  const visible = () => {
    if (!document.hidden) {
      exited = false
      enter()
    }
  }
  window.addEventListener('pointerdown', pointer, true)
  window.addEventListener('pointerup', pointer, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('focus', enter)
  document.addEventListener('visibilitychange', visible)
  document.addEventListener('fullscreenchange', changed)
  enter()
  return () => {
    disposed = true
    window.removeEventListener('pointerdown', pointer, true)
    window.removeEventListener('pointerup', pointer, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('focus', enter)
    document.removeEventListener('visibilitychange', visible)
    document.removeEventListener('fullscreenchange', changed)
  }
}
