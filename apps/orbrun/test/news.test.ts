// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { changelog, newer, newsDoc, newsSeen } from '../src/news'

const MD = ['# What’s new', '', 'Notable changes to Polished Crawl, newest first.', '', '## 0.2.10 — 2026-10-02', '', '- Ten.', '', '## 0.2.9 — 2026-10-01', '', '- Nine.', '', '## 0.2.8 — 2026-09-30', '', '- Eight.'].join('\n')

describe('What’s new', () => {
  it('marks only the new release as fresh for someone who read the previous numbering', () => {
    localStorage.setItem('orbrun.newsSeen', '0.3.160')
    try {
      const doc = newsDoc(changelog, newsSeen())
      expect(doc.querySelectorAll('.release.fresh')).toHaveLength(1)
      expect(doc.querySelector('.release.latest')).toBe(doc.querySelector('.release.fresh'))
    } finally {
      localStorage.removeItem('orbrun.newsSeen')
    }
  })

  it('orders releases by number, not by spelling', () => {
    expect(newer('0.2.10', '0.2.9')).toBe(true)
    expect(newer('0.3', '0.2.9')).toBe(true)
    expect(newer('0.2.9', '0.2.9')).toBe(false)
    expect(newer('0.2.8', '0.2.9')).toBe(false)
  })

  it('draws a card a release, the newest Latest and the ones since the last read New', () => {
    const doc = newsDoc(MD, '0.2.8')
    const parts = Array.from(doc.querySelectorAll('.release'))
    expect(parts.map((p) => p.querySelector('.ver')?.textContent)).toEqual(['0.2.10', '0.2.9', '0.2.8'])
    expect(parts.map((p) => p.querySelector('.when')?.textContent)).toEqual(['2026-10-02', '2026-10-01', '2026-09-30'])
    expect(parts.map((p) => p.querySelector('.tag')?.textContent ?? null)).toEqual(['Latest', 'New', null])
    expect(parts.map((p) => p.classList.contains('fresh'))).toEqual([true, true, false])
    expect(parts[1].querySelector('li')?.textContent).toBe('Nine.')
    expect(doc.querySelector(':scope > p')).toBeNull()
  })

  it('marks nothing New on a device that never read it: all of it is new', () => {
    const doc = newsDoc(MD, null)
    expect(doc.querySelectorAll('.tag.new')).toHaveLength(0)
    expect(doc.querySelector('.release.latest .tag')?.textContent).toBe('Latest')
  })
})
