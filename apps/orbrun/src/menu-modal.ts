import { h } from './dom'
import type { PadEvent } from './gamepad'

/** Shared document dialog. The home DOM survives; native inert isolates all background input. */
export class MenuModal {
  readonly el: HTMLDialogElement
  private body: HTMLElement
  private previous = document.activeElement as HTMLElement | null
  private background: HTMLElement[]
  private disposed = false

  constructor(host: HTMLElement, title: string, content: HTMLElement, private close: () => void) {
    const heading = h('h2', { id: 'menu-modal-title' }, title)
    const button = h('button', { type: 'button', 'aria-label': 'Close ' + title, onclick: close }, '×')
    this.body = h('div', { class: 'menu-modal-body', tabindex: 0, 'aria-label': title + ' content' }, content)
    this.el = h('dialog', { class: 'menu-modal', 'aria-labelledby': heading.id }, h('header', null, heading, button), this.body)
    this.background = Array.from(host.children) as HTMLElement[]
    this.background.forEach(el => { el.inert = true })
    host.append(this.el)
    this.el.addEventListener('cancel', this.cancel)
    this.el.showModal()
    button.focus()
  }

  private cancel = (event: Event) => { event.preventDefault(); this.close() }

  key(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return true }
    const targets = this.targets()
    if (event.key === 'Tab') {
      const i = targets.indexOf(document.activeElement as HTMLElement)
      targets[(i + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus()
      event.preventDefault()
    }
    return true
  }

  private targets(): HTMLElement[] { return Array.from(this.el.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')) }

  pad(event: PadEvent) {
    if (event.type === 'pan') this.body.scrollTop += event.dy * 16
    else if (event.type === 'press') {
      if (event.button === 'B' || event.button === 'SELECT') this.close()
      else if (event.button === 'A' || event.button === 'START') (document.activeElement as HTMLElement)?.click()
    } else if ((event.type === 'dir' || event.type === 'dirRepeat') && event.dir !== null) {
      const forward = event.dir >= 2 && event.dir <= 5
      if (document.activeElement === this.body && (event.dir === 0 || event.dir === 4)) this.body.scrollTop += forward ? 100 : -100
      else {
        const targets = this.targets(), i = targets.indexOf(document.activeElement as HTMLElement)
        targets[(i + (forward ? 1 : -1) + targets.length) % targets.length]?.focus()
      }
    }
  }

  destroy(restore = true) {
    if (this.disposed) return
    this.disposed = true
    this.el.removeEventListener('cancel', this.cancel)
    this.el.close()
    this.el.remove()
    this.background.forEach(el => { el.inert = false })
    if (restore && this.previous?.isConnected) this.previous.focus({ preventScroll: true })
  }
}
