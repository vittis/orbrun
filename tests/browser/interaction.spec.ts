import { expect } from '@playwright/test'
import { test, result } from './fixtures'

type LiveAnimation = { receive(msg: Record<string, unknown>): void; walk(): void; destroy(): void; snapshot(): { xl: number; playerProjection: { x: number; y: number; scale: number } } }

test('level gain celebrates without intercepting input, respects motion, and expires', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/testbed/live-animation.html?native-motion=1&motion=still')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  const popup = page.locator('.level-up')
  await expect(popup).toBeHidden()
  await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'player', xl: 4 })
  })
  await expect(popup).toBeVisible()
  await expect(popup).toHaveAttribute('data-level', '4')
  expect(await popup.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none')
  await expect(popup).toHaveClass(/still/)
  expect(await popup.locator('canvas').evaluate(el => getComputedStyle(el).imageRendering)).toBe('pixelated')
  expect(await page.locator(':focus').count()).toBe(0)
  // On can animate the world; native reduced motion still keeps this popup static.
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('on')
  await expect(popup).not.toHaveClass(/still/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(popup).toHaveClass(/still/)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('still')
  await expect(popup).toBeHidden({ timeout: 6000 })
  const frames = (await result(page)).totalFrames
  await page.waitForTimeout(350)
  expect((await result(page)).totalFrames).toBe(frames)
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.destroy())
  expect((await result(page)).destroyed).toBe(true)
})

test('level announcement appears before answering the stat choice and follows the rendered character', async ({ page }) => {
  await page.goto('/testbed/live-animation.html?native-motion=1&motion=still')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  await page.clock.install()
  await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'player', xl: 5 })
    fixture.receive({ msg: 'msgs', messages: [
      { text: 'You have reached level 6!', channel: 11, turn: 41 },
      { text: 'Your experience leads to an increase in your attributes!', channel: 11, turn: 41 },
      { text: 'Increase (S)trength, (I)ntelligence, or (D)exterity?', channel: 2, turn: 41 },
    ] })
    fixture.receive({ msg: 'input_mode', mode: 7 }) // MouseMode.PROMPT
  })
  await page.clock.runFor(100)
  const popup = page.locator('.level-up')
  await expect(popup).toBeVisible()
  await expect(popup).toHaveAttribute('data-level', '6')
  await expect(page.locator('.prompt-card')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.snapshot().xl)).toBe(5)
  const checkAnchor = async () => {
    const player = await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.snapshot().playerProjection)
    const art = (await popup.locator('canvas').boundingBox())!
    expect(Math.abs(art.x + art.width / 2 - player.x)).toBeLessThanOrEqual(1)
    expect(art.y + art.height).toBeLessThan(player.y - player.scale * 0.7)
    expect(art.y + art.height).toBeGreaterThan(player.y - player.scale * 1.5)
  }
  await checkAnchor()
  // A camera/actor transition and a resize must not leave the banner at its old position.
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.walk())
  await page.clock.runFor(200)
  await checkAnchor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.runFor(200)
  await checkAnchor()
  // The pixel art contains actual dark and bright blood, with opaque source pixels.
  const pixels = await popup.locator('canvas').evaluate(canvas => {
    const data = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 120, 60).data
    let blood = 0, bone = 0, partial = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0 && data[i + 3] !== 255) partial++
      if (data[i + 3] && data[i] > 70 && data[i] > data[i + 1] * 2) blood++
      if (data[i + 3] && data[i] > 190 && data[i + 1] > 150 && data[i + 2] < data[i]) bone++
    }
    return { blood, bone, partial }
  })
  expect(pixels.blood).toBeGreaterThan(100)
  expect(pixels.bone).toBeGreaterThan(100)
  expect(pixels.partial).toBe(0)
  await page.clock.runFor(3000)
  await expect(popup).toBeHidden()
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.receive({ msg: 'player', xl: 6 }))
  await page.clock.runFor(100)
  await expect(popup).toBeHidden()
})

for (const touch of [false, true]) {
  test.describe(touch ? 'RC editor touch' : 'RC editor desktop', () => {
    test.use({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch })
    test('edits the server file from Play and reads it again on reopen', async ({ page }) => {
      const files: Record<string, string> = { 'dcss-web-0.34': '# server rc\n', 'dcss-web-trunk': '# trunk rc\n' }
      const sent: { msg: string; game_id?: string; contents?: string }[] = []
      // Exercise the app's real connection and lobby without any public-server dependency.
      await page.route('**/morgue-proxy/**', route => route.fulfill({ status: 404, body: '' }))
      await page.route('**/gamedata-proxy/**', route => route.fulfill({ status: 404, body: '' }))
      await page.routeWebSocket('wss://crawl.dcss.io/socket', socket => {
        socket.onMessage(raw => {
          const message = JSON.parse(String(raw))
          sent.push(message)
          if (message.msg === 'token_login') socket.send(JSON.stringify({ msgs: [
            { msg: 'login_success', username: 'rc-test' },
            { msg: 'set_game_links', content: Object.keys(files).map(id => `<span><br><a href="#play-${id}">DCSS ${id.endsWith('trunk') ? 'trunk' : '0.34'}</a><a class="edit_rc_link" data-game_id="${id}">(edit rc)</a></span>`).join('') },
            { msg: 'lobby_complete' },
          ] }))
          if (message.msg === 'set_login_cookie') socket.send(JSON.stringify({ msg: 'login_cookie', cookie: 'test-token', expires: 7 }))
          if (message.msg === 'get_rc') socket.send(JSON.stringify({ msg: 'rcfile_contents', game_id: message.game_id, contents: files[message.game_id] ?? '' }))
          if (message.msg === 'set_rc') files[message.game_id] = message.contents
        })
      })
      await page.addInitScript(() => {
        const account = { serverId: 'cdi', username: 'rc-test' }
        localStorage.setItem('orbrun.accounts', JSON.stringify([account]))
        localStorage.setItem('orbrun.account', JSON.stringify(account))
        localStorage.setItem('orbrun.tokens', JSON.stringify({ 'cdi/rc-test': 'test-token' }))
      })
      await page.goto('/')
      const edit = page.locator('[data-focus="rc:dcss-web-0.34"]')
      await expect(edit).toBeVisible()
      const bounds = await edit.boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      await edit.click()
      const text = page.getByRole('textbox', { name: 'rc file', exact: true })
      await expect(text).toHaveValue('# server rc\n')
      const contents = '# server rc\nautofight_stop = 60\n{\n  -- Lua stays verbatim\n}\n'
      await text.fill(contents)
      if (touch) await page.locator('[data-focus="rc:save"]').click()
      else await text.press('Control+s')
      await expect(page.locator('.brand > .hint').filter({ hasText: 'Saved on crawl.dcss.io.' })).toBeVisible()
      expect(files['dcss-web-0.34']).toBe(contents)
      expect(files['dcss-web-trunk']).toBe('# trunk rc\n')
      expect(sent.filter(message => message.msg === 'set_rc')).toEqual([{ msg: 'set_rc', game_id: 'dcss-web-0.34', contents }])
      await page.getByRole('button', { name: /Back/ }).click()
      await expect(edit).toBeFocused()
      // A WebTiles edit changes the same remote file. Reopening must fetch it again.
      files['dcss-web-0.34'] = '# edited in WebTiles\n'
      await edit.click()
      await expect(text).toHaveValue('# edited in WebTiles\n')
      await text.fill('# unsaved\n')
      await page.getByRole('button', { name: /Back/ }).click()
      await expect(text).toHaveValue('# unsaved\n')
      await page.getByRole('button', { name: /Back, without saving\?/ }).click()
      await expect(edit).toBeFocused()
      expect(files['dcss-web-0.34']).toBe('# edited in WebTiles\n')
      expect(sent.some(message => ['play', 'input', 'key'].includes(message.msg))).toBe(false)
    })
  })
}

test('Dungeon and flat atmosphere, Still, and impact', async ({ page }) => {
  await page.goto('/testbed/living-checks.html')
  await expect.poll(async () => {
    try { return (await result(page)).status } catch { return 'loading' }
  }, { timeout: 75_000 }).toMatch(/complete|error/)
  const report = await result(page)
  expect(report.status, JSON.stringify(report)).toBe('complete')
  expect(report.profile).toBe('full')
  expect(report.checks).toBe(12)
  expect(report.passed).toBe(report.checks)
  expect(report.failures).toEqual([])
})

test('real GameScreen follows native reduced motion, Still, and explicit On', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/testbed/live-animation.html?native-motion=1&motion=auto')
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(async () => (await result(page)).reduced).toBe(true)
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  const reducedFrames = (await result(page)).frames
  // Intentional quiet observation window: an animation loop must remain asleep.
  await page.waitForTimeout(350)
  expect((await result(page)).frames).toBe(reducedFrames)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('on')
  await expect.poll(async () => (await result(page)).animating).toBe(true)
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(2)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('still')
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  // Applying Still queues one static redraw; observe sleep after that paint.
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(0)
  const stillFrames = (await result(page)).frames
  await page.waitForTimeout(350)
  expect((await result(page)).frames).toBe(stillFrames)
  await page.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption('auto')
  await expect.poll(async () => (await result(page)).animating).toBe(false)
  const beforeResume = (await result(page)).frames
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => (await result(page)).reduced).toBe(false)
  await expect.poll(async () => (await result(page)).animating).toBe(true)
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(beforeResume + 2)
  // Removing floating text must leave confirmed world effects connected to GameScreen.
  const impacts = (await result(page)).impacts
  await page.getByRole('button', { name: 'Trigger local hit', exact: true }).click()
  await expect.poll(async () => (await result(page)).impacts).toBeGreaterThan(impacts)
})

for (const touch of [false, true]) {
  test.describe(touch ? 'quick settings touch' : 'quick settings desktop', () => {
    test.use({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch })
    test('tunes both groups without gameplay input and survives map transitions', async ({ page }) => {
      await page.goto('/testbed/map-lifecycle.html')
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      const quick = page.getByRole('complementary', { name: 'Quick settings' })
      await quick.getByRole('button', { name: 'Open quick settings', exact: true }).click()
      const zoom = quick.getByRole('slider', { name: 'Dungeon zoom', exact: true })
      await zoom.focus()
      await zoom.press('ArrowRight')
      await expect(zoom).toHaveAttribute('aria-valuetext', '105%')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions?.zoom).toBe(1.05)
      await zoom.press('End')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.zoom).toBe(3)
      await quick.getByRole('button', { name: 'Dungeon tilt increase', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.tilt).toBe(55)
      await quick.getByRole('tab', { name: 'Combat', exact: true }).click()
      await quick.getByRole('button', { name: 'Hit bump speed increase', exact: true }).click()
      await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.settings')!).meleeBumpSpeed)).toBe(1.2)
      await quick.getByRole('button', { name: 'Hit bump strength increase', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.meleeBumpStrength).toBe(1.8)
      const variation = quick.getByRole('slider', { name: 'VFX variation', exact: true })
      await variation.focus()
      await variation.press('ArrowRight')
      await expect(variation).toHaveAttribute('aria-valuetext', '30%')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.combatVfxVariation).toBe(0.3)
      await quick.getByRole('tab', { name: 'View', exact: true }).click()
      await quick.getByRole('combobox', { name: 'Dungeon animation', exact: true }).selectOption({ label: 'Still' })
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.animate).toBe(false)
      await expect(quick.getByRole('combobox', { name: 'Dungeon movement', exact: true })).toBeDisabled()
      await quick.getByRole('tab', { name: 'Combat', exact: true }).click()
      await expect(quick.getByRole('slider', { name: 'Hit bump speed', exact: true })).toBeDisabled()
      expect((await result(page)).sent).toEqual([])
      const bounds = await quick.locator('.quick-settings-panel').evaluate(el => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.width)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
      await quick.getByRole('tab', { name: 'View', exact: true }).click()
      await quick.getByRole('button', { name: 'Reset view', exact: true }).click()
      await expect(quick.getByRole('tab', { name: 'View', exact: true })).toBeFocused()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions).toMatchObject({ tilt: 50, zoom: 1, meleeBumpStrength: 1.8 })
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await quick.getByRole('button', { name: 'Dungeon zoom increase', exact: true }).click()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions?.zoom).toBe(1.05)
      await zoom.focus()
      await zoom.press('Escape')
      await expect(quick.getByRole('button', { name: 'Open quick settings', exact: true })).toHaveAttribute('aria-expanded', 'false')
      expect((await result(page)).sent).toEqual([])
      await page.locator('canvas.view').press('ArrowRight')
      await expect.poll(async () => JSON.stringify((await result(page)).sent)).toContain('"l"')
    })
  })
  test.describe(touch ? 'narrow touch' : 'narrow mouse', () => {
    test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: touch })
    test('readable HUD and repeated map/overview restoration', async ({ page }) => {
      await page.goto('/testbed/map-lifecycle.html')
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(touch)
      expect(await page.evaluate(() => screen.width)).toBe(390)
      const layout = await page.locator('.stats').evaluate(el => {
        const rect = el.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth }
      })
      expect(layout.left).toBeGreaterThanOrEqual(0)
      expect(layout.right).toBeLessThanOrEqual(layout.viewport)
      expect(layout.width).toBeGreaterThan(280)
      const overflow = await page.locator('.stats .line').evaluateAll(lines => lines
        .filter(line => line.textContent?.trim())
        .map(line => ({ text: line.textContent, width: line.clientWidth, content: line.scrollWidth })))
      expect(overflow.length).toBeGreaterThan(3)
      expect(overflow.filter(line => line.content > line.width + 1), 'clipped stats text').toEqual([])
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await expect.poll(async () => (await result(page)).cursor).toMatchObject({ x: 13, y: 7 })
      await page.getByRole('button', { name: 'Change tilt and zoom', exact: true }).click()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Open overview', exact: true }).click()
      await expect(page.getByText('Dungeon overview', { exact: true })).toBeVisible()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await result(page)).toMatchObject({ tilt: 65, zoom: 1.2, cursor: null, canvases: 1, appliedDungeonOptions: { tilt: 65, zoom: 1.2 } })
      await page.setViewportSize({ width: 640, height: 720 })
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      const state = await result(page)
      expect(state.created - state.destroyed).toBe(1)
      expect(state.canvases).toBe(1)
      await page.getByRole('button', { name: 'Target creature', exact: true }).click()
      await expect.poll(async () => (await result(page)).cursor).toMatchObject({ x: 11, y: 3 })
      await page.locator('canvas.view').press('ArrowRight')
      await expect.poll(async () => JSON.stringify((await result(page)).sent)).toContain('"l"')
    })
  })
}


test('fine combat controls work in a narrow settings panel and persist across reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.goto('/settings/combat')
  const row = (label: string) => page.locator(`[data-focus="setting:${label}"]`)
  for (const [label, expected] of [['Hit bump strength', '170%'], ['Hit bump snap', '65%'], ['Hit gore', '95%'], ['Death gore', '45%']]) {
    await page.getByRole('button', { name: `${label} previous`, exact: true }).click()
    await expect(row(label).locator('.val')).toHaveText(expected)
  }
  await page.getByRole('button', { name: 'Hit outward spray previous', exact: true }).click()
  await expect(row('Hit outward spray').locator('.val')).toHaveText('95%')
  await page.getByRole('button', { name: 'Death outward spray next', exact: true }).click()
  await expect(row('Death outward spray').locator('.val')).toHaveText('80%')
  await page.getByRole('button', { name: 'VFX variation next', exact: true }).click()
  await expect(row('VFX variation').locator('.val')).toHaveText('30%')
  await page.getByRole('button', { name: 'Hit bump speed next', exact: true }).click()
  await expect(row('Hit bump speed').locator('.val')).toHaveText('120%')
  await row('Hit bump speed').press('ArrowRight')
  await expect(row('Hit bump speed').locator('.val')).toHaveText('125%')
  await row('Hit bump speed').press('ArrowLeft')
  await expect(row('Hit bump speed').locator('.val')).toHaveText('120%')
  await page.reload()
  await expect(row('Hit bump speed').locator('.val')).toHaveText('120%')
  await expect(row('Hit bump snap').locator('.val')).toHaveText('65%')
  await expect(row('Hit outward spray').locator('.val')).toHaveText('95%')
  await expect(row('VFX variation').locator('.val')).toHaveText('30%')
  const bounds = await page.locator('.settings .row .value').evaluateAll(values => values.map(value => {
    const rect = value.getBoundingClientRect()
    return { left: rect.left, right: rect.right, viewport: innerWidth }
  }))
  expect(bounds.length).toBe(8)
  for (const rect of bounds) {
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.right).toBeLessThanOrEqual(rect.viewport)
  }
  await page.getByText('Reset to defaults', { exact: true }).click()
  await expect(row('Hit bump speed').locator('.val')).toHaveText('115%')
  await expect(row('Hit outward spray').locator('.val')).toHaveText('100%')
  await expect(row('VFX variation').locator('.val')).toHaveText('25%')
})
