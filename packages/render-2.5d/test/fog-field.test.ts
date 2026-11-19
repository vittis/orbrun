import { expect, it } from 'vitest'
import { blurFog, fogDistances } from '../src/fog-field.js'

// Direct convolution is an independent oracle for the three separable box passes.
function referenceBlur(input: Float32Array, width: number, height: number, radius: number) {
  let field = input.slice()
  for (let pass = 0; pass < 3; pass++) for (const horizontal of [true, false]) {
    const next = new Float32Array(field.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.max(0, Math.min(width - 1, x + (horizontal ? k : 0)))
        const yy = Math.max(0, Math.min(height - 1, y + (horizontal ? 0 : k)))
        sum += field[yy * width + xx]
      }
      next[y * width + x] = sum / (radius * 2 + 1)
    }
    field = next
  }
  return field
}

it('preserves the full feather through camera shifts, clipped edges, holes and buffer reuse', () => {
  for (const [width, height, radius] of [[47, 31, 1], [13, 37, 2], [1, 9, 1], [7, 1, 3]]) {
    const field = new Float32Array(width * height), scratch = field.slice(), sums = new Float64Array(width)
    for (const shift of [-20, -5, 0, 3, 20, 100]) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        field[y * width + x] = (x >= 7 + shift && x <= 19 + shift && y >= 4 && y < 22
          || x === 10 + shift || y === 8 && x < 25 + shift) && !(x === 12 + shift && y === 10) ? 1 : 0
      }
      const expected = referenceBlur(field, width, height, radius)
      blurFog(field, scratch, width, height, radius, sums)
      expect(field).toEqual(expected)
    }
    field.fill(1)
    blurFog(field, scratch, width, height, radius, sums)
    expect([...field].every(v => v === 1)).toBe(true)
    field.fill(0)
    blurFog(field, scratch, width, height, radius, sums)
    expect([...field].every(v => v === 0)).toBe(true)
  }
})

it('retains eight-neighbour clearance around explored cells, including viewport borders', () => {
  const width = 19, height = 13
  const sources = [[0, 0], [7, 3], [8, 3], [7, 4], [18, 11]]
  const field = new Float32Array(width * height).fill(1e6)
  for (const [x, y] of sources) field[y * width + x] = 0
  fogDistances(field, width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const expected = Math.min(...sources.map(([sx, sy]) => {
      const dx = Math.abs(x - sx), dy = Math.abs(y - sy)
      return Math.min(dx, dy) * Math.SQRT2 + Math.abs(dx - dy)
    }))
    expect(field[y * width + x]).toBeCloseTo(expected, 5)
  }
  field.fill(1e6); fogDistances(field, width, height)
  expect([...field].every(v => v === 1e6)).toBe(true)
})
