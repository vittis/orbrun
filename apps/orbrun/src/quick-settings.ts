import { h } from './dom'
import type { PadEvent } from './gamepad'
import { getSettings } from './settings'
import { adjustSetting, chooseSetting, groupAtDefaults, resetGroup, rowHint, rowOff, settingGroups, settingValue, type SettingRow } from './settings-rows'

/** A non-modal tuning panel. It owns input only while one of its controls has focus. */
export class QuickSettings {
  readonly root = h('aside', { class: 'quick-settings', 'aria-label': 'Quick settings' })
  private toggle = h('button', { class: 'quick-settings-toggle', type: 'button', 'aria-label': 'Open quick settings', 'aria-expanded': 'false', 'aria-controls': 'quick-settings-panel' },
    h('span', { 'aria-hidden': 'true' }, '☷'), h('span', null, 'Tune'))
  private panel = h('div', { id: 'quick-settings-panel', class: 'quick-settings-panel', hidden: true })
  private group: 'View' | 'Combat' = 'View'
  private tabs = new Map<string, HTMLButtonElement>()
  private pages = new Map<string, HTMLElement>()
  private draws: (() => void)[] = []
  private adjustments = new Map<HTMLElement, (direction: number) => void>()

  constructor(private onchange: () => void, private onclose: () => void) {
    this.root.append(this.toggle, this.panel)
    this.toggle.addEventListener('click', () => this.open ? this.close() : this.show())
    const close = h('button', { type: 'button', 'aria-label': 'Close quick settings', onclick: () => this.close() }, '×')
    this.panel.append(h('header', null, h('strong', null, 'Quick settings'), close))
    const tabs = h('div', { class: 'quick-settings-tabs', role: 'tablist', 'aria-label': 'Quick settings category' })
    this.panel.append(tabs)
    for (const group of settingGroups().filter(g => g.group === 'View' || g.group === 'Combat')) {
      const name = group.group as 'View' | 'Combat'
      const id = `quick-settings-${name.toLowerCase()}`
      const tab = h('button', { type: 'button', role: 'tab', id: `${id}-tab`, 'aria-controls': id }, name)
      tab.addEventListener('click', () => this.showGroup(name))
      tab.addEventListener('keydown', ev => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return
        ev.preventDefault()
        const next = ev.key === 'Home' ? 'View' : ev.key === 'End' ? 'Combat' : this.group === 'View' ? 'Combat' : 'View'
        this.showGroup(next)
        this.tabs.get(next)!.focus()
      })
      this.tabs.set(name, tab)
      tabs.append(tab)
      const page = h('div', { class: 'quick-settings-page', role: 'tabpanel', id, 'aria-labelledby': `${id}-tab` })
      this.pages.set(name, page)
      for (const row of group.rows) page.append(this.control(row))
      const reset = h('button', { type: 'button', class: 'quick-settings-reset', onclick: () => {
        resetGroup(name, this.onchange)
        this.refresh()
      } }, `Reset ${name.toLowerCase()}`)
      this.draws.push(() => { reset.disabled = groupAtDefaults(name) })
      page.append(reset)
      this.panel.append(page)
    }
    this.root.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); this.close() }
      ev.stopPropagation()
    })
    this.showGroup(this.group)
  }

  get open() { return !this.panel.hidden }
  owns(target: EventTarget | null): boolean { return target instanceof Node && this.root.contains(target) }

  private show() {
    this.panel.hidden = false
    this.toggle.setAttribute('aria-expanded', 'true')
    this.toggle.setAttribute('aria-label', 'Close quick settings')
    this.refresh()
    this.tabs.get(this.group)!.focus()
  }

  close() {
    const focused = this.owns(document.activeElement)
    this.panel.hidden = true
    this.toggle.setAttribute('aria-expanded', 'false')
    this.toggle.setAttribute('aria-label', 'Open quick settings')
    if (focused) this.onclose()
  }

  refresh() {
    const active = document.activeElement, owned = this.owns(active)
    this.draws.forEach(draw => draw())
    // Chromium platforms differ on whether disabling a focused button blurs it.
    // Keep the next key in the controls after reset, a bound, or a disabled dependency.
    if (owned && this.open && (!this.owns(document.activeElement) || active?.matches(':disabled'))) {
      this.tabs.get(this.group)!.focus()
    }
  }

  private showGroup(group: 'View' | 'Combat') {
    this.group = group
    for (const [name, tab] of this.tabs) {
      tab.setAttribute('aria-selected', String(name === group))
      tab.tabIndex = name === group ? 0 : -1
      this.pages.get(name)!.hidden = name !== group
    }
    this.refresh()
  }

  private control(row: SettingRow): HTMLElement {
    const id = `quick-${row.key}`
    const value = h('output', { for: id })
    const hint = h('span', { id: `${id}-hint`, class: 'quick-settings-hint' })
    const field = h('div', { class: 'quick-setting', dataset: { setting: row.key } },
      h('div', { class: 'quick-setting-label' }, h('label', { for: id }, row.label), value), hint)
    const numeric = row.values.every(v => typeof v === 'number')
    const atLimit = (direction: number) => numeric && (direction < 0
      ? Number(getSettings()[row.key]) <= Number(row.values[0])
      : Number(getSettings()[row.key]) >= Number(row.values.at(-1)))
    const adjust = (direction: number) => {
      if (atLimit(direction)) return
      adjustSetting(row, direction, this.onchange); this.refresh()
    }
    const input = numeric
      ? h('input', { type: 'range', min: 0, max: row.values.length - 1, step: 1 })
      : h('select', null, ...row.values.map((v, i) => h('option', { value: i }, row.fmt(v))))
    input.id = id
    input.setAttribute('aria-describedby', `${id}-hint`)
    input.addEventListener(numeric ? 'input' : 'change', () => {
      chooseSetting(row, row.values[Number(input.value)], this.onchange)
      this.refresh()
    })
    this.adjustments.set(input, adjust)
    const buttons: HTMLButtonElement[] = []
    if (numeric) {
      const step = (direction: number, text: string) => {
        const button = h('button', { type: 'button', 'aria-label': `${row.label} ${direction < 0 ? 'decrease' : 'increase'}`, onclick: () => adjust(direction) }, text)
        this.adjustments.set(button, adjust)
        buttons.push(button)
        return button
      }
      field.append(h('div', { class: 'quick-setting-range' }, step(-1, '−'), input, step(1, '+')))
    } else field.append(input)
    this.draws.push(() => {
      const settings = getSettings(), current = settings[row.key], off = rowOff(row, settings)
      value.textContent = settingValue(row, settings)
      hint.textContent = rowHint(row, settings)
      field.title = hint.textContent
      field.classList.toggle('off', off)
      input.disabled = off
      buttons.forEach((button, i) => { button.disabled = off || atLimit(i === 0 ? -1 : 1) })
      let index = row.values.indexOf(current)
      // Preserve custom saved values until a gesture chooses an offered stop.
      if (index < 0 && numeric) index = (row.values as readonly number[]).reduce((best, v, i, values) =>
        Math.abs(v - (current as number)) < Math.abs(values[best] - (current as number)) ? i : best, 0)
      input.value = String(index)
      if (numeric) input.setAttribute('aria-valuetext', value.textContent)
    })
    return field
  }

  /** Route controller input within focused controls without leaking moves into the game. */
  pad(event: PadEvent): boolean {
    if (!this.owns(document.activeElement)) return false
    const active = document.activeElement as HTMLElement
    if (event.type === 'press') {
      if (event.button === 'B' || event.button === 'START' || event.button === 'SELECT') this.close()
      else if (event.button === 'LB' || event.button === 'RB') {
        const group = this.group === 'View' ? 'Combat' : 'View'
        this.showGroup(group); this.tabs.get(group)!.focus()
      } else if (event.button === 'A') {
        const adjust = this.adjustments.get(active)
        if (adjust && !(active instanceof HTMLButtonElement)) adjust(1)
        else active.click()
      }
    } else if (event.type === 'dir' || event.type === 'dirRepeat') {
      if (event.dir === 2 || event.dir === 6) {
        const direction = event.dir === 2 ? 1 : -1
        const adjust = this.adjustments.get(active)
        if (adjust) adjust(direction)
        else if (active.getAttribute('role') === 'tab') {
          this.showGroup(this.group === 'View' ? 'Combat' : 'View'); this.tabs.get(this.group)!.focus()
        }
      } else if (event.dir === 0 || event.dir === 4) {
        const controls = Array.from(this.root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'))
          .filter(el => !el.closest('[hidden]') && el.tabIndex >= 0)
        const i = controls.indexOf(active), step = event.dir === 0 ? -1 : 1
        controls[(i + step + controls.length) % controls.length]?.focus()
      }
    }
    return true
  }
}
