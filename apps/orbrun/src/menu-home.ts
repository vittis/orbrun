import { h } from './dom'
import type { Focusable } from './focus'
import type { ServerInfo } from './servers'
import type { GameLink } from '@orbrun/webtiles'

export interface HomeRow {
  id: string; label: string; sub?: string | null; marker?: string; off?: boolean; fn?: () => void
  also?: { id: string; label: string; title?: string; fn?: () => void; href?: string }[]
}

/** WebTiles variant IDs follow mode[-web]-version, independently of save text. */
export function homeGame(game: GameLink): boolean {
  return !/(?:^|[-_])descent(?:[-_]|$)/i.test(game.id) && !/^Descent(?:\s|$)/i.test(game.label)
}

interface HomeActions {
  server(id: string): void
  accounts(): void
  login(user: string, password: string): void
  logout(): void
  register(): void
  about(): void
  news(): void
}

/** Persistent header/form and keyed command rows. Lobby updates never replace a focused node. */
export class HomeView {
  readonly el = h('div', { class: 'polished-home' })
  private select = h('select', { 'aria-label': 'Server', dataset: { focus: 'server' } })
  readonly user = h('input', { name: 'username', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', required: true, dataset: { focus: 'username' } })
  private pass = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, dataset: { focus: 'password' } })
  private login = h('button', { type: 'submit', dataset: { focus: 'login' } }, 'Log in')
  private form: HTMLFormElement
  private identity = h('button', { type: 'button', dataset: { focus: 'account' }, title: 'Manage accounts' })
  private signedIn: HTMLElement
  private recovery = h('a', { target: '_blank', rel: 'noopener noreferrer', title: 'Open the server’s own account recovery page', dataset: { focus: 'recovery' } }, 'Forgot password')
  private authLinks: HTMLElement
  private status = h('div', { class: 'home-status', role: 'status' })
  private commands = h('nav', { class: 'menu polished-commands', 'aria-label': 'Main menu' })
  private footer: HTMLElement
  private news: HTMLButtonElement
  private keyed = new Map<string, { el: HTMLElement; button: HTMLButtonElement; label: HTMLElement; sub: HTMLElement; row: HomeRow; also: HTMLElement }>()
  private serverId = ''
  private serverShape = ''

  constructor(private actions: HomeActions) {
    this.select.onchange = () => actions.server(this.select.value)
    this.identity.onclick = actions.accounts
    this.form = h('form', { class: 'inline-login', onsubmit: (e: Event) => { e.preventDefault(); actions.login(this.user.value.trim(), this.pass.value); this.pass.value = '' } },
      h('label', null, 'User', this.user), h('label', null, 'Pass', this.pass), this.login)
    this.signedIn = h('div', { class: 'signed-in' }, this.identity, h('button', { type: 'button', dataset: { focus: 'logout' }, onclick: actions.logout }, 'Log out'))
    this.authLinks = h('div', { class: 'auth-links' }, h('button', { type: 'button', dataset: { focus: 'register' }, onclick: actions.register }, 'Register'), this.recovery,
      h('button', { type: 'button', dataset: { focus: 'accounts' }, onclick: actions.accounts }, 'Accounts'))
    this.news = h('button', { type: 'button', dataset: { focus: 'news' }, onclick: actions.news }, 'What’s new')
    this.footer = h('footer', { class: 'polished-footer' }, h('button', { type: 'button', dataset: { focus: 'about' }, onclick: actions.about }, 'About & credits'), this.news)
    this.el.append(h('header', { class: 'account-bar' }, h('label', { class: 'server-picker' }, 'Server:', this.select), h('div', { class: 'account-controls' }, this.form, this.signedIn, this.authLinks)),
      h('main', { class: 'polished-main' }, h('h1', { class: 'polished-title', 'aria-label': 'Polished Crawl' }, h('span', { class: 'polished-eyebrow', 'aria-hidden': 'true' }, 'POLISHED'), h('span', { class: 'crawl-title', 'aria-hidden': 'true', 'data-text': 'CRAWL' }, 'CRAWL')),
        h('p', { class: 'polished-subtitle' }, 'Classic Crawl, with a 2.5D perspective and enhanced visual effects.'), this.status, this.commands), this.footer)
  }

  update(opts: { servers: ServerInfo[]; server: ServerInfo; username: string | null; remembered: string; busy: boolean; rows: HomeRow[]; notices: HTMLElement[]; unread: boolean }): Focusable[] {
    const shape = JSON.stringify(opts.servers.map(s => [s.id, s.name, s.location]))
    if (shape !== this.serverShape) {
      this.select.replaceChildren(...opts.servers.map(s => h('option', { value: s.id }, [s.name, s.location].filter(Boolean).join(' · '))))
      this.serverShape = shape
    }
    if (this.serverId !== opts.server.id) { this.user.value = opts.remembered; this.pass.value = ''; this.serverId = opts.server.id }
    this.select.value = opts.server.id
    this.form.hidden = !!opts.username || !!opts.server.offline
    this.signedIn.hidden = !opts.username
    this.authLinks.hidden = !!opts.username || !!opts.server.offline
    this.identity.textContent = opts.username ?? ''
    this.login.disabled = opts.busy
    // Recovery belongs to WebTiles, whose supported flows differ by server. Link to its existing lobby.
    this.recovery.href = opts.server.http + '/'
    this.news.classList.toggle('unread', opts.unread)
    this.news.setAttribute('aria-label', 'What’s new' + (opts.unread ? ' (unread)' : ''))
    if (this.status.textContent !== opts.notices.map(n => n.textContent).join('')) this.status.replaceChildren(...opts.notices)
    const ids = new Set(opts.rows.map(r => r.id))
    for (const [id, entry] of this.keyed) if (!ids.has(id)) { entry.el.remove(); this.keyed.delete(id) }
    const items: Focusable[] = []
    for (const [i, row] of opts.rows.entries()) {
      let entry = this.keyed.get(row.id)
      if (!entry) {
        const label = h('span', { class: 'label' }), sub = h('span', { class: 'sub' })
        const button = h('button', { type: 'button', class: 'item', dataset: { focus: row.id } }, h('span', { class: 'command-marker', 'aria-hidden': 'true' }, row.marker ?? ''), h('span', { class: 'command-copy' }, label, sub))
        const also = h('span', { class: 'command-also' })
        entry = { el: h('div', { class: 'command-line' }, button, also), button, label, sub, row, also }
        const current = entry
        button.onclick = () => current.row.fn?.()
        this.keyed.set(row.id, entry)
      }
      entry.row = row; entry.label.textContent = row.label; entry.sub.textContent = row.sub ?? ''; entry.sub.hidden = !row.sub
      entry.button.disabled = !!row.off
      // Insert only when ordering changes, because moving a focused DOM node blurs it.
      if (this.commands.children[i] !== entry.el) this.commands.insertBefore(entry.el, this.commands.children[i] ?? null)
      items.push({ id: row.id, label: row.label, el: entry.button, row: i, col: 0, activate: () => row.fn?.() })
      for (const child of Array.from(entry.also.children)) if (!row.also?.some(a => a.id === (child as HTMLElement).dataset.focus)) child.remove()
      for (const [j, action] of (row.also ?? []).entries()) {
        let button = Array.from(entry.also.children).find(c => (c as HTMLElement).dataset.focus === action.id) as HTMLButtonElement | undefined
        if (!button) { button = h('button', { type: 'button', dataset: { focus: action.id } }); entry.also.append(button) }
        button.textContent = action.label; button.title = action.title ?? ''; button.onclick = () => action.fn?.()
        items.push({ id: action.id, label: action.label, el: button, row: i, col: j + 1, activate: () => action.fn?.() })
      }
    }
    const controls = Array.from(this.el.querySelectorAll<HTMLElement>('.account-bar [data-focus], .polished-footer button')).filter(el => !el.closest('[hidden]'))
    for (const [i, el] of controls.entries()) items.push({ id: el.dataset.focus, label: el.getAttribute('aria-label') ?? el.textContent ?? el.dataset.focus!, el, row: el.closest('footer') ? 200 : -2, col: i, activate: () => {
      if (el === this.select) {
        this.select.selectedIndex = (this.select.selectedIndex + 1) % this.select.options.length
        this.select.dispatchEvent(new Event('change'))
      } else el.click()
    } })
    return items
  }
}
