import { matrix, fixtureYield, releaseCanvas } from './fixture'
import { emptyScene } from '@orbrun/scene'
import { DungeonArrival } from '../../../packages/render-2.5d/src/arrival'

/** Real Canvas gradients: all compass directions, aspect ratios and DPRs. */
export async function arrivalChecks() {
  let checks = 0
  const failures: unknown[] = []
  for (const [width, height] of matrix([[640, 480], [390, 600]], [[390, 600]])) for (const dpr of [1, 2]) {
    for (const [dx, dy] of matrix([[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, 8], [8, -8], [-8, -8]], [[8, 0], [0, -8], [-8, 8], [8, -8]])) {
      const canvas = document.createElement('canvas')
      canvas.width = width * dpr; canvas.height = height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const arrival = new DungeonArrival(), scene = { ...emptyScene(), playerOnLevel: true }
      const p = { x: 0, y: 0, width, height, scale: 32, tilt: 50 * Math.PI / 180 }
      arrival.observe(scene, 0, true)
      scene.player = { x: dx, y: dy }; arrival.observe(scene, 1, true)
      const paint = (time: number) => {
        ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, width, height)
        return arrival.draw(ctx, p, time)
      }
      const sample = (sign: number) => ctx.getImageData(
        Math.floor((width / 2 + sign * Math.sign(dx) * width * 0.4) * dpr),
        Math.floor((height / 2 + sign * Math.sign(dy) * height * 0.4) * dpr), 1, 1).data[0]
      paint(1.16)
      const trailing = sample(-1), leading = sample(1)
      checks++
      if (trailing <= leading + 10) failures.push({ name: 'clears in travel direction', width, height, dpr, dx, dy, trailing, leading })
      const brightness = Array.from({ length: 9 }, (_, i) => { paint(1 + i * 0.04); return sample(0) })
      checks++
      if (brightness.some((v, i) => v < 171 || v > 200 || i > 0 && v < brightness[i - 1]) || brightness.at(-1) !== 200) {
        failures.push({ name: 'subtle monotone reveal with exact landing', width, height, dpr, dx, dy, brightness })
      }
      checks++
      if (paint(1.32)) failures.push({ name: 'sweep expires without keeping frames awake', width, height, dpr, dx, dy })
      releaseCanvas(canvas); await fixtureYield('arrival')
    }
  }
  return { checks, failures }
}
