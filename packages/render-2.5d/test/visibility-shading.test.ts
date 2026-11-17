import { afterEach, expect, it, vi } from 'vitest'
import { VisibilityShading } from '../src/visibility-shading.js'
import { MEMORY_DARKNESS } from '../src/visibility.js'

class Canvas {
  pixels: Uint8ClampedArray | undefined
  constructor(public width: number, public height: number) {}
  getContext() {
    return {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      putImageData: (image: ImageData) => { this.pixels = image.data.slice() },
    }
  }
}
afterEach(() => vi.unstubAllGlobals())

it('reuses fading buffers without overwriting settled masks or the other exposure channel', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const shading = new VisibilityShading()
  const settled = [0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS]
  const stable = shading.mask(settled) as unknown as Canvas
  const original = stable.pixels!.slice()
  const field = (value: number) => [0, 0, value, 0, value, value, 0, 0, value]
  const darkness = shading.mask(field(0.1)), exposure = shading.mask(field(0.1), true)
  expect(exposure).not.toBe(darkness)
  for (let i = 1; i < 25; i++) {
    expect(shading.mask(field(i / 100))).toBe(darkness)
    expect(shading.mask(field(i / 100), true)).toBe(exposure)
  }
  expect(shading.mask([...settled])).toBe(stable)
  expect(stable.pixels).toEqual(original)
  shading.clear()
  expect(shading.mask(field(0.1))).not.toBe(darkness)
  expect(shading.mask(settled)).not.toBe(stable)
})
