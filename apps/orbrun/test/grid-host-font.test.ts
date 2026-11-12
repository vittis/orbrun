// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GridHost, PHONE_COLS } from '../src/grid/host'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function measuredGrid(width: number, metrics: (px: number) => number) {
  const probes: number[] = []
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (!this.classList.contains('grid-probe')) return original.call(this)
    const px = parseFloat(this.style.fontSize)
    probes.push(px)
    return { width: metrics(px) * 50, height: px, x: 0, y: 0, left: 0, top: 0, right: metrics(px) * 50, bottom: px, toJSON() {} }
  })
  const host = document.createElement('div')
  Object.defineProperty(host, 'clientWidth', { value: width })
  Object.defineProperty(host, 'clientHeight', { value: 844 })
  document.body.append(host)
  const grid = new GridHost(host, 16)
  cleanup.push(() => { grid.destroy(); host.remove() })
  return { grid, host, probes }
}

describe('grid font measurements at the displayed size', () => {
  it('fits nonlinear hinted small glyphs instead of scaling a 100px measurement', () => {
    // CI Linux: a 100px glyph is 60px wide, but an 11px glyph is 7px,
    // so a 58-cell row would occupy406px despite an estimated382.8px box.
    const { grid, host, probes } = measuredGrid(390, px => Math.round(px * 0.6))
    grid.setLeast(true)
    expect(grid.grid.cw).toBe(6)
    expect(host.style.getPropertyValue('--fs')).toBe('10px')
    expect(grid.grid.cols).toBeGreaterThanOrEqual(PHONE_COLS)
    expect(grid.grid.cols * grid.grid.cw).toBeLessThanOrEqual(390)
    expect(probes).toContain(11)
    expect(probes).not.toContain(100)
  })

  it('caches each size across fits and measures a newly selected UI scale', () => {
    const { grid, probes } = measuredGrid(1600, px => Math.round(px * 0.6))
    grid.setLeast(false)
    expect(probes).toEqual([16])
    grid.fit(); grid.fit()
    expect(probes).toEqual([16])
    grid.setTextSize(18)
    expect(probes).toEqual([16, 18])
    expect(grid.grid.cw).toBe(11)
    grid.setTextSize(16)
    expect(probes).toEqual([16, 18])
    expect(grid.grid.cw).toBe(10)
  })

  it.each(['font load', 'font change'])('invalidates all size measurements after %s', reason => {
    const fonts = new EventTarget()
    const descriptor = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    cleanup.push(() => { if (descriptor) Object.defineProperty(document, 'fonts', descriptor); else delete (document as unknown as { fonts?: EventTarget }).fonts })
    let loaded = false
    const { grid, probes } = measuredGrid(390, px => loaded ? Math.round(px * 0.6) : px * 0.6)
    grid.setLeast(true)
    expect(grid.grid.cw).toBeCloseTo(6.6)
    const before = probes.length
    loaded = true
    if (reason === 'font load') fonts.dispatchEvent(new Event('loadingdone'))
    else grid.refont()
    expect(probes.length).toBeGreaterThan(before)
    expect(grid.grid.cw).toBe(6)
    expect(grid.shrink).toBe(10 / 16)
    const after = probes.length
    grid.fit()
    expect(probes).toHaveLength(after)
  })
})
