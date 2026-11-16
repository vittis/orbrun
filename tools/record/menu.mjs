#!/usr/bin/env node
/** Capture genuine local replay pixels; never connect to a game server. Start Vite separately. */
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5290')
if (url.hostname !== '127.0.0.1') throw new Error('Capture requires a loopback Vite server')
const version = 'acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8'
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'polished-menu-'))
let browser
try {
  for (const name of ['floor', 'wall', 'feat', 'main', 'player', 'icons', 'gui']) {
    const response = await fetch(`https://crawl.dcss.io/gamedata/${version}/${name}.png`)
    if (!response.ok) throw new Error(`Atlas ${name}: HTTP ${response.status}`)
    await fs.writeFile(path.join(temporary, name + '.png'), Buffer.from(await response.arrayBuffer()))
  }
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.routeWebSocket(/wss?:\/\//, () => { throw new Error('No sockets belong in this capture') })
  await page.route('**/capture-gamedata/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (!/^[\w-]+\.(png|js)$/.test(name)) throw new Error('Unexpected fixture asset')
    const file = name.endsWith('.png') ? path.join(temporary, name) : path.join(root, 'packages/scene-webtiles/test/fixtures/gamedata', version, name)
    await route.fulfill({ body: await fs.readFile(file), contentType: name.endsWith('.png') ? 'image/png' : 'text/javascript' })
  })
  await page.goto(new URL('/testbed/menu-recording.html', url).href)
  await page.waitForFunction(() => window.menuCapture)
  await page.waitForTimeout(1000)
  const output = path.join(root, 'apps/orbrun/public/menu')
  await fs.mkdir(output, { recursive: true })
  const poster = await page.evaluate(() => window.menuCapture.poster())
  const clip = await page.evaluate(() => window.menuCapture.capture())
  if (errors.length || !clip.impacts) throw new Error(`Capture failed: ${errors.join('; ')}, ${clip.impacts} confirmed impacts`)
  await fs.writeFile(path.join(output, 'poster.jpg'), Buffer.from(poster.split(',')[1], 'base64'))
  await fs.writeFile(path.join(output, 'crawl.webm'), Buffer.from(clip.data, 'base64'))
  console.log(`Captured ${clip.duration}s, ${clip.impacts} confirmed impacts; VP9 WebM, 1280×720, no audio tracks.`)
} finally {
  await browser?.close()
  await fs.rm(temporary, { recursive: true, force: true })
}
