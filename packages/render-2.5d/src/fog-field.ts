/** Eight-neighbour distance transform over the shared silhouette. Padding keeps
 * the viewport edge from becoming a false exploration boundary. */
export function fogDistances(field: Float32Array, width: number, height: number) {
  const diagonal = Math.SQRT2
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    let d = field[i]
    if (d === 0) continue
    if (x) d = Math.min(d, field[i - 1] + 1)
    if (y) {
      d = Math.min(d, field[i - width] + 1)
      if (x) d = Math.min(d, field[i - width - 1] + diagonal)
      if (x + 1 < width) d = Math.min(d, field[i - width + 1] + diagonal)
    }
    field[i] = d
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x
    let d = field[i]
    if (d === 0) continue
    if (x + 1 < width) d = Math.min(d, field[i + 1] + 1)
    if (y + 1 < height) {
      d = Math.min(d, field[i + width] + 1)
      if (x) d = Math.min(d, field[i + width - 1] + diagonal)
      if (x + 1 < width) d = Math.min(d, field[i + width + 1] + diagonal)
    }
    field[i] = d
  }
}
/** Three box passes approximate a Gaussian over the union, rounding corners
 * and joining neighbouring tiles before the animated feather is applied. */
export function blurFog(field: Float32Array, scratch: Float32Array, width: number, height: number, radius: number, sums: Float64Array) {
  const count = radius * 2 + 1
  // Only the explored silhouette and the three-pass feather can be nonzero.
  // Keep the original padded grid and border clamping; trim arithmetic, not pixels.
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (field[y * width + x] === 0) continue
    left = Math.min(left, x); right = Math.max(right, x)
    top = Math.min(top, y); bottom = y
  }
  if (right < left) return
  for (let pass = 0; pass < 3; pass++) {
    left = Math.max(0, left - radius); right = Math.min(width - 1, right + radius)
    scratch.fill(0)
    for (let y = top; y <= bottom; y++) {
      const row = y * width
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += field[row + Math.max(0, Math.min(width - 1, left + k))]
      for (let x = left; x <= right; x++) {
        scratch[row + x] = sum / count
        sum += field[row + Math.min(width - 1, x + radius + 1)] - field[row + Math.max(0, x - radius)]
      }
    }
    top = Math.max(0, top - radius); bottom = Math.min(height - 1, bottom + radius)
    // Traverse rows contiguously instead of repeatedly walking a full column.
    // Float64 retains the original JS-number accumulation/rounding order.
    sums.fill(0)
    for (let k = -radius; k <= radius; k++) {
      const row = Math.max(0, Math.min(height - 1, top + k)) * width
      for (let x = left; x <= right; x++) sums[x] += scratch[row + x]
    }
    field.fill(0)
    for (let y = top; y <= bottom; y++) {
      const row = y * width
      const add = Math.min(height - 1, y + radius + 1) * width
      const remove = Math.max(0, y - radius) * width
      for (let x = left; x <= right; x++) {
        field[row + x] = sums[x] / count
        sums[x] += scratch[add + x] - scratch[remove + x]
      }
    }
  }
}
