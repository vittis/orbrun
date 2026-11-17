import { version } from '../package.json'
import { h } from './dom'
import { renderMarkdown } from './markdown'

/** The repository's changelog is bundled with the app. */
export { default as changelog } from '../../../CHANGELOG.md?raw'

/**
 * What's new: CHANGELOG.md in the shared menu modal, a card per release,
 * and whether this device has read it since the current release came out.
 * The footer link wears a dot until it has.
 *
 * The compatible storage key records package.json's version when What's new
 * was last opened here; a device that never opened it has read nothing.
 */

const SEEN_KEY = 'orbrun.newsSeen'

/** the release this device last read What's new under, if ever */
export function newsSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/** whether there is something in What's new this device has not read: the dot on its row */
export function newsUnread(): boolean {
  return newsSeen() !== version
}

/** What's new was opened: what it says now is read */
export function markNewsSeen() {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // no storage (a private window): the dot comes back next time, which is all it costs
  }
}

/** `a` is a later release than `b` (`0.2.10` after `0.2.9`) */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** a release's heading: "0.2.6 — 2026-09-29" */
const RELEASE = /^(.+?) — (.+)$/

/**
 * Release sections for the shared modal: number, date and changes, with the
 * newest marked Latest and every release since `seen` marked New.
 */
export function newsDoc(md: string, seen: string | null): HTMLElement {
  const doc = renderMarkdown(md, { dropTitle: true })
  doc.classList.add('news')
  for (const p of Array.from(doc.children)) {
    if (p.tagName !== 'P') break
    p.remove()
  }
  let first = true
  // the reader sets a release a level under the document's title (h3); here the screen's name is the title, so it is h2, as on the site
  for (const h3 of Array.from(doc.querySelectorAll('h3'))) {
    const h2 = h('h2', null, ...Array.from(h3.childNodes))
    h2.className = 'label'
    const part = h('section', { class: 'release' + (first ? ' latest' : '') }, h2)
    h3.replaceWith(part)
    while (part.nextSibling && (part.nextSibling as Element).tagName !== 'H3') part.append(part.nextSibling)
    const m = RELEASE.exec(h2.textContent ?? '')
    if (m) {
      const fresh = !!seen && newer(m[1], seen)
      const tag = first ? h('span', { class: 'tag' }, 'Latest') : fresh ? h('span', { class: 'tag new' }, 'New') : null
      h2.replaceChildren(h('span', { class: 'ver' }, m[1]), h('span', { class: 'sep' }, ' — '), h('span', { class: 'when' }, m[2]), ...(tag ? [tag] : []))
      if (fresh) part.classList.add('fresh')
    }
    first = false
  }
  return doc
}
