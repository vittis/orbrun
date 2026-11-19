import { isAndroid } from './back'
import { h } from './dom'
import { fullscreenGlyph } from './glyphs'

export function installFullscreenButton(host: HTMLElement, signal: AbortSignal) {
  const root = document.documentElement
  if (!isAndroid() || !document.fullscreenEnabled || !root.requestFullscreen) return

  let pending = false
  const label = 'Enter fullscreen'
  const button = h('button', { type: 'button', class: 'fullscreen-control', 'aria-label': label, title: label }, fullscreenGlyph())
  const update = () => { button.hidden = !!document.fullscreenElement }
  button.addEventListener('click', async event => {
    if (pending || button.hidden) return
    if (event.detail) button.blur()
    pending = true
    try {
      await root.requestFullscreen({ navigationUI: 'hide' })
      button.title = label
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
