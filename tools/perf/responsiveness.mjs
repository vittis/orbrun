/** Local Chromium measurements; no public server and no timing assertions.
 * Start Vite on strict loopback port 5296, then run this file with Node.
 * Optional argument: another loopback Vite origin. PROFILE_CPU=1 adds samples.
 * Run sequentially, with no builds or test suites competing for the CPU. */
import { chromium } from 'playwright'

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:5296')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Use a local fixture server')
const browser = await chromium.launch({ headless: true })
try {
  const results = []
  for (const scenario of ['moving', 'moving-fog', 'combat-fog', 'still']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(new URL(`/testbed/live-animation.html?perf&motion=${scenario === 'still' ? 'still' : 'on'}${scenario.includes('fog') ? '&fog' : ''}`, origin).href)
    await page.waitForFunction(() => !!window.__orbrunLiveAnimation)
    await page.waitForTimeout(1500)
    const cdp = await page.context().newCDPSession(page)
    if (process.env.PROFILE_CPU) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
    await page.evaluate(scenario => {
      window.orbrunPerf.reset()
      window.perfTimers = []
      if (scenario.startsWith('moving')) window.perfTimers.push(setInterval(() => window.__orbrunLiveAnimation.walk(), 90))
      if (scenario === 'combat-fog') window.perfTimers.push(setInterval(() => document.getElementById('hit').click(), 100))
    }, scenario)
    await page.waitForTimeout(6000)
    const result = await page.evaluate(() => {
      window.perfTimers.forEach(clearInterval)
      return { snapshot: window.__orbrunLiveAnimation.snapshot(), report: window.orbrunPerf.report() }
    })
    if (process.env.PROFILE_CPU) {
      const { profile } = await cdp.send('Profiler.stop')
      const parents = new Map(), totals = new Map()
      for (const node of profile.nodes) for (const id of node.children ?? []) parents.set(id, node)
      for (let i = 0; i < profile.samples.length; i++) {
        const id = profile.samples[i]
        totals.set(id, (totals.get(id) ?? 0) + profile.timeDeltas[i])
      }
      result.cpu = profile.nodes.map(node => {
        const ms = (totals.get(node.id) ?? 0) / 1000, stack = []
        for (let current = node; current && stack.length < 6; current = parents.get(current.id)) stack.push(current.callFrame.functionName)
        return { stack: stack.join(' < '), ms }
      }).sort((a, b) => b.ms - a.ms).slice(0, 20)
    }
    if (errors.length) throw new Error(`${scenario}: ${errors.join('; ')}`)
    results.push({ scenario, ...result })
    await page.close()
  }
  console.log(JSON.stringify({ viewport: '1280x720', browser: browser.version(), node: process.version, platform: `${process.platform}/${process.arch}`, results }, null, 2))
} finally { await browser.close() }
