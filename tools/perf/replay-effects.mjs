// Start Vite on strict loopback port 5396. This uses the menu's normal recording,
// artwork, playback clock and renderer, without connecting to a Crawl server.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const server = new URL(process.argv[2] ?? 'http://127.0.0.1:5396')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname)) throw new Error('Use a local fixture server')
const origin = server.origin
const clips = JSON.parse(readFileSync(new URL('../../apps/orbrun/data/menu-replays.json', import.meta.url))).clips
const entry = clips.find(c => c.title === (process.env.REPLAY_SCENE ?? 'Polar Vortex in Gehenna'))
if (!entry) throw new Error('Unknown replay scene')
const narrow = process.env.REPLAY_NARROW === '1'
const viewport = narrow ? { width: 390, height: 844 } : { width: 1280, height: 720 }
const rate = Number(process.env.REPLAY_CPU ?? 1)
const duration = Number(process.env.REPLAY_MS ?? 15000)
const clip = JSON.parse(readFileSync(new URL('../../apps/orbrun/public/menu/' + entry.file, import.meta.url)))
let elapsed = 0, target = 0
for (const frame of clip.frames) {
  elapsed += frame.after
  if (elapsed > duration) break
  target++
}
if (!target) throw new Error('Choose a duration that includes a replay update')
const headless = process.env.REPLAY_HEADLESS === '1'
const browser = await chromium.launch({ channel: process.env.REPLAY_BROWSER || (headless ? undefined : 'chrome'), headless })
try {
  const page = await browser.newPage({ viewport })
  await page.route(origin + '/replay-perf', route => route.fulfill({ contentType: 'text/html', body:
    '<style>*{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>' }))
  await page.goto(origin + '/replay-perf')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  const profile = process.env.PROFILE_CPU === '1'
  const frames = !!process.env.REPLAY_CAPTURE
  if (frames) {
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 3000))
    // Fix the monotonic origin as well as the wall clock across runs.
    await page.evaluate(() => {
      const start = performance.now(), now = performance.now.bind(performance)
      performance.now = () => now() - start
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = cb => raf(t => cb(t - start))
    })
  }
  await page.evaluate(async ({ entry, target }) => {
    const { loadMenuDemo } = await import('/src/menu-demo.ts')
    const source = await (await fetch('/src/menu-demo.ts')).text()
    const match = /import \{ Render25d \} from "([^"]+)"/.exec(source)
    if (!match) throw new Error('Cannot instrument the replay renderer in this Vite build')
    const { Render25d } = await import(match[1])
    const render = Render25d.prototype.render
    const setScene = Render25d.prototype.setScene
    let updates = -1 // Initial snapshot precedes timed updates.
    Render25d.prototype.setScene = function (...args) {
      updates++
      return setScene.apply(this, args)
    }
    window.draws = []
    window.completed = new Promise(resolve => { window.complete = resolve })
    Render25d.prototype.render = function (time) {
      const start = performance.now()
      if (window.captureFrame) window.paintAt = t => render.call(this, t)
      render.call(this, time)
      window.draws.push({ start, ms: performance.now() - start })
      if (updates >= target) window.complete()
    }
    window.demo = await loadMenuDemo(document.querySelector('canvas'), new AbortController().signal, entry,
      { progress() {}, finished() {}, failed(error) { window.failure = String(error); window.complete() } })
  }, { entry, target })
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  await page.evaluate(capture => { window.captureFrame = capture; window.demo.setActive(true) }, frames)
  if (frames) {
    for (const ms of [3000, 5000, 7000]) {
      await page.clock.runFor(ms === 3000 ? 3000 : 2000)
      await page.evaluate(() => window.paintAt(performance.now() / 1000))
      await page.screenshot({ path: process.env.REPLAY_CAPTURE + '-' + ms + '.png' })
    }
  } else await page.evaluate(() => Promise.race([window.completed, new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Replay did not reach the target update')), 180000))]))
  const samples = await page.evaluate(() => {
    window.demo.destroy()
    if (window.failure) throw new Error(window.failure)
    return window.draws
  })
  if (samples.length < 2) throw new Error('Recording did not render')
  if (frames) console.log('Saved fixed-time replay captures at 3, 5 and 7 seconds')
  else {
    const summary = xs => {
      xs.sort((a, b) => a - b)
      return Object.fromEntries([50, 95, 99].map(p => ['p' + p, +xs[Math.floor(p / 100 * xs.length)].toFixed(2)]))
    }
    const system = await browser.newBrowserCDPSession(), { gpu } = await system.send('SystemInfo.getInfo')
    console.log(JSON.stringify({ scene: entry.title, viewport, rate, timelineMs: duration, updates: target, browser: browser.version(),
      gpu: gpu.auxAttributes.glRenderer, canvas: gpu.featureStatus['2d_canvas'], draws: samples.length,
      renderMs: summary(samples.map(f => f.ms)), intervalMs: summary(samples.slice(1).map((f, i) => f.start - samples[i].start)) }))
  }
  if (profile) {
    const { profile } = await cdp.send('Profiler.stop')
    const totals = new Map(), parents = new Map()
    for (const node of profile.nodes) for (const id of node.children ?? []) parents.set(id, node)
    for (const [i, id] of profile.samples.entries()) totals.set(id, (totals.get(id) ?? 0) + profile.timeDeltas[i])
    console.log(profile.nodes.map(n => {
      const stack = []
      for (let node = n; node && stack.length < 4; node = parents.get(node.id)) stack.push(node.callFrame.functionName)
      return [Math.round((totals.get(n.id) ?? 0) / 1000), stack.join(' < ')]
    }).sort((a, b) => b[0] - a[0]).slice(0, 35))
  }
} finally { await browser.close() }
