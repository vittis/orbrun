import { isAndroid } from './back'
import { h } from './dom'
import { fullscreenGlyph } from './glyphs'

export function installFullscreenButton(host: HTMLElement, signal: AbortSignal) {
  const root = document.documentElement
  if (!isAndroid() || !document.fullscreenEnabled || !root.requestFullscreen) return

  let pending = false
  const button = h('button', { type: 'button', class: 'fullscreen-control' })
  const update = () => {
    const active = document.fullscreenElement === root
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen'
    button.setAttribute('aria-label', label)
    button.title = label
    button.replaceChildren(fullscreenGlyph(active))
  }
  button.addEventListener('click', async event => {
    if (pending) return
    if (event.detail) button.blur()
    pending = true
    try {
      if (document.fullscreenElement === root) await document.exitFullscreen()
      else await root.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      button.title = 'Fullscreen is unavailable. Tap to retry.'
    } finally {
      pending = false
    }
  })
  document.addEventListener('fullscreenchange', update, { signal })
  update()
  host.append(button)
  return button
}
