import { menuReplayCheck } from './menu-replay'
import { expect } from '@playwright/test'
import { test, result } from './fixtures'

type LiveAnimation = { receive(msg: Record<string, unknown>): void; walk(): void; destroy(): void; snapshot(): { xl: number; playerProjection: { x: number; y: number; scale: number } } }

test('Shift+numpad sends server run commands when Windows consumes the modifier', async ({ page }) => {
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  const sent = await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: { snapshot(): { sent: unknown[] } } }).__orbrunLiveAnimation
    const before = fixture.snapshot().sent.length
    const directions = [
      ['Numpad8', 'ArrowUp'], ['Numpad9', 'PageUp'], ['Numpad6', 'ArrowRight'], ['Numpad3', 'PageDown'],
      ['Numpad2', 'ArrowDown'], ['Numpad1', 'End'], ['Numpad4', 'ArrowLeft'], ['Numpad7', 'Home'],
    ]
    // Reproduce the OS event shape; browser automation does not emulate
    // Windows' synthetic Shift release when NumLock is overridden.
    for (const modifierNumLock of [true, false]) {
      for (const [code, key] of directions) {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          code, key, location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD,
          modifierNumLock, shiftKey: false, bubbles: true, cancelable: true,
        }))
      }
    }
    return fixture.snapshot().sent.slice(before)
  })
  expect(sent).toEqual([...('KULNJBHYkulnjbhy')].map(text => ({ msg: 'input', text })))
})

test('inputs use server replies immediately between paints, including touch and controller presses', async ({ page }) => {
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  const evidence = await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: {
      receive(msg: Record<string, unknown>): void
      walk(): void
      pad(event: import('../../apps/orbrun/src/gamepad').PadEvent): void
      snapshot(): { totalFrames: number; sent: unknown[] }
    } }).__orbrunLiveAnimation
    const before = fixture.snapshot().totalFrames
    fixture.walk()
    // These replies and inputs all occur in one task: no RAF can refresh the
    // context between them. The actual reducer, controls and Runner are used.
    fixture.receive({ msg: 'msgs', more: true })
    fixture.pad({ type: 'press', button: 'A', t: performance.now() })
    fixture.pad({ type: 'release', button: 'A', t: performance.now(), held: 10 })
    fixture.receive({ msg: 'msgs', more: false })
    fixture.receive({ msg: 'msgs', more: true })
    fixture.pad({ type: 'press', button: 'A', t: performance.now(), touch: true })
    fixture.pad({ type: 'release', button: 'A', t: performance.now(), held: 10, touch: true })
    fixture.receive({ msg: 'msgs', more: false })
    fixture.receive({ msg: 'menu', tag: 'inventory', flags: 0, title: { text: 'Inventory' }, items: [
      { text: 'a - a dagger', hotkeys: [97], level: 2 },
    ], total_items: 1 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    fixture.receive({ msg: 'close_menu' })
    for (let i = 0; i < 8; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }))
    const after = fixture.snapshot()
    return { before, after: after.totalFrames, sent: after.sent }
  })
  expect(evidence.after).toBe(evidence.before)
  expect(evidence.sent.slice(0, 2)).toEqual([{ msg: 'key', keycode: 32 }, { msg: 'key', keycode: 32 }])
  expect(evidence.sent).toContainEqual({ msg: 'key', keycode: 13 })
  expect(evidence.sent.slice(-8)).toEqual(Array.from({ length: 8 }, () => ({ msg: 'input', text: 'l' })))
})

test('inventory transitions preserve live updates, stable hover targets, and immediate closing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  const lifecycle = await page.evaluate(async () => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    const stack = document.querySelector<HTMLElement>('.overlay-stack')!
    const change = (msg: Record<string, unknown>) => new Promise<void>(resolve => {
      const observer = new MutationObserver(() => { observer.disconnect(); resolve() })
      observer.observe(stack, { childList: true })
      fixture.receive(msg)
    })
    await change({ msg: 'menu', tag: 'inventory', flags: 0, title: { text: 'Inventory' }, items: [
      { text: 'a - a dagger', hotkeys: [97], level: 2 },
      { text: 'b - a robe', hotkeys: [98], level: 2 },
    ], total_items: 2 })
    const first = stack.querySelector<HTMLElement>(':scope > .popup')!
    const entrance = first.getAnimations()
    const opened = { animations: entrance.length, duration: entrance[0]?.effect?.getTiming().duration, inert: first.inert }
    entrance.forEach(animation => animation.finish())
    await change({ msg: 'update_menu_items', chunk_start: 0, items: [{ text: 'a - a glowing dagger', hotkeys: [97], level: 2 }] })
    const updated = stack.querySelector<HTMLElement>(':scope > .popup')!
    return { opened, updated: { animations: updated.getAnimations().length, text: updated.textContent } }
  })
  expect(lifecycle.opened).toEqual({ animations: 1, duration: 130, inert: false })
  expect(lifecycle.updated.animations).toBe(0)
  expect(lifecycle.updated.text).toContain('glowing dagger')
  const row = page.locator('.overlay-stack > .popup li.selectable').nth(1)
  const before = await row.boundingBox()
  await row.hover()
  expect(await row.boundingBox()).toEqual(before)
  await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  const closed = await page.evaluate(async () => {
    const stack = document.querySelector<HTMLElement>('.overlay-stack')!
    await new Promise<void>(resolve => {
      const observer = new MutationObserver(() => { observer.disconnect(); resolve() })
      observer.observe(stack, { childList: true })
      ;(window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.receive({ msg: 'close_menu' })
    })
    const exit = stack.querySelector<HTMLElement>('.ui-exit')!
    const retiring = exit.querySelector<HTMLElement>('.popup')!
    return { live: stack.querySelectorAll(':scope > .popup').length, inert: exit.inert, hidden: exit.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(retiring).pointerEvents, duration: retiring.getAnimations()[0]?.effect?.getTiming().duration }
  })
  expect(closed).toEqual({ live: 0, inert: true, hidden: 'true', pointerEvents: 'none', duration: 90 })
  await expect(page.locator('.ui-exit')).toHaveCount(0)
})

test('level gain celebrates and expires without intercepting input', async ({ page }) => {
  await page.goto('/testbed/live-animation.html')
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
  expect(await popup.locator('canvas').evaluate(el => getComputedStyle(el).imageRendering)).toBe('auto')
  expect(await page.locator(':focus').count()).toBe(0)
  await expect(popup).toBeHidden({ timeout: 6000 })
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.destroy())
  expect((await result(page)).destroyed).toBe(true)
})

test('level announcement appears before answering the stat choice and follows the rendered character', async ({ page }) => {
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-13T12:00:01Z'))
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
  // Smooth lettering retains readable warm highlights and antialiased edges.
  const pixels = await popup.locator('canvas').evaluate(canvas => {
    const art = canvas as HTMLCanvasElement
    const data = art.getContext('2d')!.getImageData(0, 0, art.width, art.height).data
    let warm = 0, partial = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0 && data[i + 3] !== 255) partial++
      if (data[i + 3] > 128 && data[i] > 190 && data[i + 1] > 150 && data[i + 2] < data[i]) warm++
    }
    return { warm, partial }
  })
  expect(pixels.warm).toBeGreaterThan(50)
  expect(pixels.partial).toBeGreaterThan(100)
  await page.clock.runFor(3000)
  await expect(popup).toBeHidden()
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.receive({ msg: 'player', xl: 6 }))
  await page.clock.runFor(100)
  await expect(popup).toBeHidden()
})

test('level-up embers rise during the celebration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-13T12:00:01Z'))
  await page.evaluate(() => (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation.receive({ msg: 'player', xl: 4 }))
  const embers = () => page.locator('.level-up-art').evaluate(canvas => {
    const art = canvas as HTMLCanvasElement, dpr = art.width / art.clientWidth
    const data = art.getContext('2d')!.getImageData(0, 0, art.width, art.height).data
    const points: { x: number; y: number }[] = []
    for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
      if (x / dpr >= 80 && x / dpr <= 160 && y / dpr >= 55) continue // exclude lettering
      const i = (y * art.width + x) * 4
      if (data[i + 3] > 40 && data[i] > 170 && data[i + 1] > 80) points.push({ x: x / dpr, y: y / dpr })
    }
    // Track the outermost ember, so motes entering/leaving the text mask cannot bias its motion.
    const left = Math.min(...points.map(p => p.x))
    const edge = points.filter(p => p.x <= left + 3)
    return { count: points.length, y: edge.length ? edge.reduce((sum, p) => sum + p.y, 0) / edge.length : 0 }
  })
  await page.clock.runFor(250)
  const first = await embers()
  expect(first.count).toBeGreaterThan(5)
  await page.clock.runFor(300)
  const later = await embers()
  expect(later.count).toBeGreaterThan(5)
  expect(later.y).toBeLessThan(first.y - 3)
})

test('message pauses preserve dungeon brightness and menus have no corner vignette', async ({ page }) => {
  await page.goto('/testbed/live-animation.html?frameTime=1')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  const corner = { x: 30, y: 130, width: 40, height: 40 }
  const before = await page.screenshot({ clip: corner })
  await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'msgs', more: true, messages: [{ text: 'You have reached level 3!', channel: 11 }] })
    fixture.receive({ msg: 'input_mode', mode: 5 })
  })
  await expect(page.locator('.messages .line.more')).toHaveText('--more--')
  await expect(page.locator('.more-scrim')).toHaveCount(0)
  expect(await page.screenshot({ clip: corner })).toEqual(before)
  await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'msgs', more: false })
    fixture.receive({ msg: 'input_mode', mode: 1 })
  })
  await expect(page.locator('.messages')).not.toHaveClass(/\bmore\b/)
  await page.keyboard.press('F5')
  await expect(page.locator('.popup.sysmenu')).toBeVisible()
  expect(await page.locator('.overlay-stack').evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toBe('none')
  await expect.poll(() => page.locator('.overlay-stack').evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgba(3, 2, 6, 0.5)')
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

test('Dungeon and flat atmosphere, paused frames and impact', async ({ page }) => {
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

test('real GameScreen keeps animating after the device motion preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(2)
  const beforeChange = (await result(page)).frames
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(async () => (await result(page)).animating).toBe(true)
  await expect.poll(async () => (await result(page)).frames).toBeGreaterThan(beforeChange + 2)
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
      const counter = page.locator('.fps-counter')
      const fpsSetting = quick.getByRole('combobox', { name: 'FPS counter', exact: true })
      await expect(counter).toBeHidden()
      await fpsSetting.selectOption({ label: 'On' })
      await expect(counter).toBeVisible()
      const zoom = quick.getByRole('slider', { name: 'Dungeon zoom', exact: true })
      await zoom.focus()
      await zoom.press('ArrowRight')
      await expect(zoom).toHaveAttribute('aria-valuetext', '105%')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions?.zoom).toBe(1.05)
      await zoom.press('End')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.zoom).toBe(2)
      await quick.getByRole('button', { name: 'Dungeon tilt increase', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.tilt).toBe(40)
      for (const [label, key, value] of [['Move hop height', 'movementHopHeight', 0.35], ['Move squash', 'movementSquash', 0.55], ['Move sway', 'movementSway', 0.95]] as const) {
        await quick.getByRole('button', { name: `${label} decrease`, exact: true }).click()
        await expect.poll(async () => (await result(page)).appliedDungeonOptions[key]).toBe(value)
      }
      await quick.getByRole('tab', { name: 'Combat', exact: true }).click()
      await quick.getByRole('button', { name: 'Hit bump speed increase', exact: true }).click()
      await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.settings')!).meleeBumpSpeed)).toBe(1.2)
      await quick.getByRole('button', { name: 'Hit bump strength increase', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.meleeBumpStrength).toBe(1.8)
      const variation = quick.getByRole('slider', { name: 'VFX variation', exact: true })
      await variation.focus()
      await variation.press('ArrowRight')
      await expect(variation).toHaveAttribute('aria-valuetext', '65%')
      await expect.poll(async () => (await result(page)).appliedDungeonOptions.combatVfxVariation).toBe(0.65)
      await quick.getByRole('tab', { name: 'View', exact: true }).click()
      await quick.getByRole('combobox', { name: 'Dungeon movement', exact: true }).selectOption({ label: 'Instant' })
      for (const label of ['Move hop height', 'Move squash', 'Move sway']) await expect(quick.getByRole('slider', { name: label, exact: true })).toBeDisabled()
      await quick.getByRole('tab', { name: 'Combat', exact: true }).click()
      await expect(quick.getByRole('slider', { name: 'Hit bump speed', exact: true })).toBeEnabled()
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
      await expect(counter).toBeHidden()
      await expect(quick.getByRole('tab', { name: 'View', exact: true })).toBeFocused()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions).toMatchObject({ tilt: 35, zoom: 1, movementDuration: 0.14, meleeBumpStrength: 1.8,
        movementHopHeight: 0.4, movementSquash: 0.6, movementSway: 1 })
      await page.getByRole('button', { name: 'Open level map', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render2d')
      await fpsSetting.selectOption({ label: 'On' })
      await expect(counter).toBeHidden()
      await quick.getByRole('button', { name: 'Dungeon zoom increase', exact: true }).click()
      await quick.getByRole('button', { name: 'Move sway increase', exact: true }).click()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).appliedDungeonOptions?.zoom).toBe(1.05)
      await expect.poll(async () => (await result(page)).appliedDungeonOptions?.movementSway).toBe(1.05)
      await expect(counter).toBeVisible()
      await zoom.focus()
      await zoom.press('Escape')
      await expect(quick.getByRole('button', { name: 'Open quick settings', exact: true })).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('canvas.view')).toBeFocused()
      await expect(page.locator('canvas.view')).toHaveCSS('outline-style', 'none')
      expect((await result(page)).sent).toEqual([])
      await page.locator('canvas.view').press('ArrowRight')
      await expect.poll(async () => JSON.stringify((await result(page)).sent)).toContain('"l"')
    })
  })
  test.describe(touch ? 'narrow touch' : 'narrow mouse', () => {
    test.use({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: touch, deviceScaleFactor: 3 })
    test('readable HUD and repeated map/overview restoration', async ({ page }) => {
      await page.goto('/testbed/map-lifecycle.html')
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(touch)
      expect(await page.evaluate(() => screen.width)).toBe(390)
      const canvas = page.locator('canvas.view')
      const backingScale = () => canvas.evaluate(el => (el as HTMLCanvasElement).width / el.getBoundingClientRect().width)
      const dungeonScale = touch ? 1.5 : 1
      await expect(canvas).toHaveCSS('image-rendering', touch ? 'auto' : 'pixelated')
      await expect(page.locator('canvas.portrait')).toHaveCSS('image-rendering', touch ? 'auto' : 'pixelated')
      expect(await backingScale()).toBeCloseTo(dungeonScale)
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
      await expect(canvas).toHaveCSS('image-rendering', 'pixelated')
      expect(await backingScale()).toBeCloseTo(1)
      await expect.poll(async () => (await result(page)).cursor).toMatchObject({ x: 13, y: 7 })
      await page.getByRole('button', { name: 'Change tilt and zoom', exact: true }).click()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Open overview', exact: true }).click()
      await expect(page.getByText('Dungeon overview', { exact: true })).toBeVisible()
      expect((await result(page)).renderer).toBe('Render2d')
      await page.getByRole('button', { name: 'Close view', exact: true }).click()
      await expect.poll(async () => (await result(page)).renderer).toBe('Render25d')
      expect(await result(page)).toMatchObject({ tilt: 65, zoom: 1.2, cursor: null, canvases: 1, appliedDungeonOptions: { tilt: 65, zoom: 1.2, filterCreatureScaling: touch } })
      expect(await backingScale()).toBeCloseTo(dungeonScale)
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


test('unexplored atmosphere can be disabled independently, persists and resets', async ({ page }) => {
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.goto('/settings/view')
  const fog = page.locator('[data-focus="setting:Unexplored fog"]')
  const atmosphere = page.locator('[data-focus="setting:Unexplored atmosphere"]')
  await expect(fog.locator('.val')).toHaveText('On')
  await expect(atmosphere.locator('.val')).toHaveText('On')
  await page.getByRole('button', { name: 'Unexplored atmosphere next', exact: true }).click()
  await expect(atmosphere.locator('.val')).toHaveText('Off')
  await expect(fog.locator('.val')).toHaveText('On')
  await page.reload()
  await expect(atmosphere.locator('.val')).toHaveText('Off')
  await expect(fog.locator('.val')).toHaveText('On')
  await page.getByRole('button', { name: 'Unexplored fog next', exact: true }).click()
  await expect(fog.locator('.val')).toHaveText('Off')
  await expect(atmosphere).toHaveClass(/\boff\b/)
  await page.reload()
  await expect(fog.locator('.val')).toHaveText('Off')
  await page.getByText('Reset to defaults', { exact: true }).click()
  await expect(fog.locator('.val')).toHaveText('On')
  await expect(atmosphere.locator('.val')).toHaveText('On')
})

test('movement tuning persists in the narrow settings menu and respects instant movement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.goto('/settings/view')
  const row = (label: string) => page.locator(`[data-focus="setting:${label}"]`)
  const gestures = [['Move hop height', '35%', '40%'], ['Move squash', '55%', '60%'], ['Move sway', '95%', '100%']]
  for (const [label, changed] of gestures) {
    await page.getByRole('button', { name: `${label} previous`, exact: true }).click()
    await expect(row(label).locator('.val')).toHaveText(changed)
  }
  await page.getByRole('button', { name: 'Dungeon move duration next', exact: true }).click()
  await expect(row('Dungeon move duration').locator('.val')).toHaveText('150 ms')
  await page.reload()
  for (const [label, changed] of gestures) await expect(row(label).locator('.val')).toHaveText(changed)
  await expect(row('Dungeon move duration').locator('.val')).toHaveText('150 ms')
  await page.getByRole('button', { name: 'Dungeon movement next', exact: true }).click()
  for (const [label, changed] of gestures) {
    await expect(row(label)).toHaveClass(/off/)
    await page.getByRole('button', { name: `${label} next`, exact: true }).click()
    await expect(row(label).locator('.val')).toHaveText(changed)
  }
  await page.getByRole('button', { name: 'Dungeon movement next', exact: true }).click()
  for (const [label] of gestures) await expect(row(label)).not.toHaveClass(/off/)
  await page.getByText('Reset to defaults', { exact: true }).click()
  for (const [label, , fallback] of gestures) await expect(row(label).locator('.val')).toHaveText(fallback)
  const bounds = await page.locator('.settings .row .value').evaluateAll(values => values.map(value => {
    const rect = value.getBoundingClientRect()
    return { left: rect.left, right: rect.right, viewport: innerWidth }
  }))
  for (const rect of bounds) {
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.right).toBeLessThanOrEqual(rect.viewport)
  }
})

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
  await expect(row('VFX variation').locator('.val')).toHaveText('65%')
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
  await expect(row('VFX variation').locator('.val')).toHaveText('65%')
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
  await expect(row('VFX variation').locator('.val')).toHaveText('60%')
})

// Real ZIP worker, IndexedDB, browser decoding and AudioContext; only the pack HTTP response is local.
test('audio settings load OSP, persist cache and volume, import ZIPs and remove cached assets', async ({ page }) => {
  const { audioArchive, audioStarts, observeAudio } = await import('./audio-fixture')
  await observeAudio(page)
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  let downloads = 0
  await page.route('https://osp.nemelex.cards/build/latest.zip', route => {
    downloads++
    return route.fulfill({ body: audioArchive(), contentType: 'application/zip', headers: { 'access-control-allow-origin': '*' } })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings/audio')
  await expect(page.locator('.audio-status')).toContainText('Download CNC')
  expect(downloads).toBe(0)
  await page.getByRole('button', { name: 'Sound effects next', exact: true }).click()
  await page.getByRole('button', { name: 'Master volume previous', exact: true }).click()
  await page.getByText('Download / refresh OSP', { exact: true }).click()
  await expect(page.locator('.audio-status')).toContainText('3 sound rules ready')
  await page.getByText('Test sound', { exact: true }).click()
  await expect.poll(() => audioStarts(page)).toBe(1)
  await page.reload()
  await expect(page.locator('.audio-status')).toContainText('3 sound rules ready')
  expect(downloads).toBe(1)
  await expect(page.locator('[data-focus="setting:Master volume"] .val')).toHaveText('65%')
  await page.getByText('Test sound', { exact: true }).click()
  await expect.poll(() => audioStarts(page)).toBe(1)
  const choosing = page.waitForEvent('filechooser')
  await page.getByText('Import OSP ZIP', { exact: true }).click()
  await (await choosing).setFiles({ name: 'local-osp.zip', mimeType: 'application/zip', buffer: audioArchive() })
  await expect(page.locator('.audio-status')).toContainText('3 sound rules ready')
  await page.getByText('Remove cached pack', { exact: true }).click()
  await expect(page.locator('.audio-status')).toContainText('removed')
  await page.reload()
  await expect(page.locator('.audio-status')).toContainText('Download CNC')
  expect(downloads).toBe(1)
})

test('live sounds follow confirmed message occurrences and stop on screen teardown', async ({ page }) => {
  const { audioArchive, audioStarts, observeAudio } = await import('./audio-fixture')
  await observeAudio(page)
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.route('https://osp.nemelex.cards/build/latest.zip', route => route.fulfill({ body: audioArchive(), contentType: 'application/zip', headers: { 'access-control-allow-origin': '*' } }))
  await page.goto('/settings/audio')
  await page.getByRole('button', { name: 'Sound effects next', exact: true }).click()
  await page.getByText('Download / refresh OSP', { exact: true }).click()
  await expect(page.locator('.audio-status')).toContainText('3 sound rules ready')
  await page.goto('/testbed/live-animation.html')
  await expect.poll(async () => (await result(page)).playerOnLevel).toBe(true)
  await page.evaluate(async () => {
    // Vite-only inspection of the same controller owned by this real GameScreen.
    const path = '/src/audio/controller.ts'
    const { audio } = await import(path)
    await new Promise<void>(resolve => {
      if (audio().snapshot().info) { resolve(); return }
      const off = audio().subscribe((s: { info?: unknown }) => { if (s.info) { off(); resolve() } })
    })
  })
  // A real gesture unlocks Web Audio without sending a game command.
  await page.locator('#controls').click({ position: { x: 2, y: 2 } })
  const receive = (text: string, rollback = 0) => page.evaluate(({ text, rollback }) => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'msgs', rollback, messages: [{ text, turn: 1 }] })
  }, { text, rollback })
  await receive('You hit the goblin.')
  await expect.poll(() => audioStarts(page)).toBe(1)
  await receive('You hit the goblin. You miss the goblin.', 1)
  await expect.poll(() => audioStarts(page)).toBe(2)
  await receive('You hit the goblin. You miss the goblin.', 1)
  await receive('You hit the goblin.')
  await expect.poll(() => audioStarts(page)).toBe(3)
  await page.evaluate(() => {
    const fixture = (window as unknown as { __orbrunLiveAnimation: LiveAnimation }).__orbrunLiveAnimation
    fixture.receive({ msg: 'msgs', messages: [{ text: 'You hit the goblin.' }] })
    fixture.destroy()
  })
  // Worker replies and browser audio callbacks must not revive a destroyed screen.
  await page.waitForTimeout(150)
  expect(await audioStarts(page)).toBe(3)
})

for (const touch of [false, true]) {
  test.describe(touch ? 'Polished menu touch' : 'Polished menu desktop', () => {
    test.use({ viewport: touch ? { width: 320, height: 960 } : { width: 1016, height: 780 }, hasTouch: touch })
    test('keeps inline auth, keyed rows and modal focus stable as the lobby changes', async ({ page }) => {
      const sockets: import('@playwright/test').WebSocketRoute[] = []
      const sent: { msg: string; username?: string; password?: string }[] = []
      const send = (socket: import('@playwright/test').WebSocketRoute, msgs: object[]) => socket.send(JSON.stringify({ msgs }))
      await page.route('**/morgue-proxy/**', route => route.fulfill({ status: 404, body: '' }))
      await page.routeWebSocket(/wss?:\/\//, socket => {
        sockets.push(socket)
        send(socket, [{ msg: 'lobby_complete' }])
        socket.onMessage(raw => {
          const m = JSON.parse(String(raw)); sent.push(m)
          if (m.msg === 'login' && m.password === 'fixture-password') send(socket, [
            { msg: 'login_success', username: m.username },
            { msg: 'set_game_links', content: '<span><a href="#play-dcss-0.34">DCSS 0.34</a><a class="edit_rc_link" data-game_id="stable-rc">(edit rc)</a></span><span><a href="#play-dcss-web-trunk">DCSS trunk</a><a class="edit_rc_link" data-game_id="trunk-rc">(edit rc)</a></span><span><a href="#play-descent-web-trunk">Descent</a></span>' },
            { msg: 'lobby_complete' },
          ])
        })
      })
      await page.addInitScript(() => {
        const account = { serverId: 'cdi', username: 'menu-test' }
        localStorage.setItem('orbrun.accounts', JSON.stringify([account])); localStorage.setItem('orbrun.account', JSON.stringify(account))
      })
      await page.goto('/')
      const user = page.getByRole('textbox', { name: 'Username', exact: true }), pass = page.getByLabel('Password', { exact: true })
      const server = page.getByRole('combobox', { name: 'Server', exact: true })
      const login = page.getByRole('button', { name: 'Log in', exact: true })
      const firstCommand = page.getByRole('navigation', { name: 'Main menu' }).getByRole('button').first()
      await expect(firstCommand).not.toBeFocused()
      await expect(firstCommand).toHaveCSS('outline-style', 'none')
      await page.getByRole('button', { name: 'Accounts', exact: true }).focus()
      await page.keyboard.press('Tab')
      await expect(firstCommand).toBeFocused()
      await expect(firstCommand).toHaveCSS('outline-style', 'solid')
      await page.locator('.polished-subtitle').click()
      await expect(firstCommand).not.toBeFocused()
      await expect(firstCommand).toHaveCSS('outline-style', 'none')
      // Cover both a remembered account and a server where this device has never logged in.
      if (touch) {
        await server.selectOption('cao')
        const [picker, ...fields] = await Promise.all([server, user, pass, login].map(control => control.boundingBox()))
        for (const field of fields) expect(field!.y + field!.height / 2).toBeCloseTo(picker!.y + picker!.height / 2)
        await expect(login).toBeInViewport({ ratio: 1 })
      }
      await user.fill('menu-test'); await pass.fill('fixture-password')
      const handle = await pass.elementHandle()
      send(sockets.at(-1)!, [{ msg: 'lobby_entry', id: 1, username: 'viewer', game_id: 'dcss-0.34' }, { msg: 'lobby_complete' }])
      await expect(pass).toBeFocused(); await expect(pass).toHaveValue('fixture-password')
      expect(await handle!.evaluate(el => el === document.activeElement)).toBe(true)
      for (const id of ['about', 'news']) {
        const trigger = page.locator(`[data-focus="${id}"]`)
        await trigger.click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.locator('.polished-home')).toHaveAttribute('inert', '')
        send(sockets.at(-1)!, [{ msg: 'lobby_complete' }])
        await page.keyboard.press('Shift+Tab')
        expect(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expect(pass).toHaveValue('fixture-password')
      }
      expect(await page.evaluate(() => localStorage.getItem('orbrun.newsSeen'))).toBeTruthy()
      await pass.fill('rejected-password')
      await login.click()
      await expect(login).toBeDisabled()
      await expect(page.locator('.account-bar [role="status"]')).toHaveText('Logging in…')
      await pass.fill('fixture-password')
      await pass.press('Enter')
      send(sockets.at(-1)!, [{ msg: touch ? 'auth_error' : 'login_fail', reason: 'Incorrect password.' }])
      await expect(page.locator('.account-bar [role="status"]')).toHaveText('Incorrect password.')
      await expect(pass).toHaveValue('fixture-password')
      await expect(login).toBeEnabled()
      await page.screenshot({ path: `test-results/polished-login-${touch ? 'mobile' : 'desktop'}.png` })
      await pass.press('Enter')
      await expect(page.locator('[data-focus="play:dcss-0.34"]')).toBeVisible()
      await expect(page.locator('.signed-in')).toContainText('menu-test')
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.account')!))).toEqual({ serverId: touch ? 'cao' : 'cdi', username: 'menu-test' })
      await expect(page.locator('.polished-commands')).not.toContainText('Descent')
      expect(sent.filter(m => m.msg === 'login')).toEqual([
        { msg: 'login', username: 'menu-test', password: 'rejected-password' },
        { msg: 'login', username: 'menu-test', password: 'fixture-password' },
      ])
      const play = page.locator('[data-focus="play:dcss-web-trunk"]'); await play.focus()
      const node = await play.elementHandle()
      send(sockets.at(-1)!, [{ msg: 'lobby_entry', id: 2, username: 'menu-test', game_id: 'dcss-web-trunk', char: 'TrFi', xl: '11', place: 'Lair:2' }])
      await expect(play).toContainText('Continue')
      expect(await node!.evaluate(el => el === document.activeElement)).toBe(true)
      expect(await page.locator('.polished-home').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `test-results/polished-${touch ? 'mobile' : 'desktop'}.png` })
      await page.locator('[data-focus="about"]').click()
      await page.screenshot({ path: `test-results/polished-modal-${touch ? 'mobile' : 'desktop'}.png` })
      await page.goBack()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.polished-home')).not.toHaveAttribute('inert', '')
    })
  })
}

test('menu entrance remains usable when recordings are unavailable despite an old saved animation setting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let requests = 0
  let failFirstRequest!: () => void
  const loading = new Promise<void>(resolve => { failFirstRequest = resolve })
  await page.route('**/menu/clips/**', async route => {
    if (++requests !== 1) return route.continue()
    await loading
    return route.fulfill({ status: 404, body: '' })
  })
  await page.routeWebSocket(/wss?:\/\//, socket => socket.close())
  await page.addInitScript(() => { localStorage.setItem('orbrun.settings', JSON.stringify({ depthAnimate: false })) })
  await page.goto('/')
  const canvas = page.locator('.menu-backdrop canvas')
  const shine = page.locator('.crawl-title')
  await expect(page.getByText('Loading dungeon replay…')).toBeVisible()
  await expect(page.locator('.polished-footer')).toBeInViewport({ ratio: 1 })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'test-results/menu-loading-narrow.png' })
  failFirstRequest()
  await expect(page.getByRole('button', { name: 'Retry replay' })).toBeVisible()
  expect(requests).toBe(1)
  await expect(canvas).toBeHidden()
  expect(await shine.evaluate(el => getComputedStyle(el, '::after').animationDuration)).toBe('8s')
  await page.locator('[data-focus="about"]').click()
  expect(await shine.evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Retry replay' }).click()
  await expect(canvas).toBeVisible()
  await page.locator('[data-focus="settings"]').click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(requests).toBe(2)
})

menuReplayCheck(false)

for (const narrow of [false, true]) {
  test(`menu recording chooser loads only the current recording and resets on reload at ${narrow ? 'narrow' : 'desktop'} width`, async ({ page }) => {
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 720 })
    await page.routeWebSocket(/^wss:\/\//, socket => socket.send(JSON.stringify({ msg: 'lobby_complete' })))
    await page.addInitScript(() => {
      Math.random = () => .999
      localStorage.setItem('orbrun.settings', JSON.stringify({ depthTilt: 65 }))
    })
    const assetRequests: string[] = []
    page.on('request', request => { if (request.url().includes('/menu/')) assetRequests.push(request.url()) })
    await page.goto('/')
    const chooser = page.getByRole('combobox', { name: 'Choose scene', exact: true })
    const canvas = page.locator('.menu-backdrop canvas')
    await expect(chooser).toBeVisible()
    await expect(canvas).toBeVisible()
    await expect(chooser).toHaveValue('')
    const requestedClips = () => assetRequests.filter(url => url.includes('/menu/clips/'))
    expect(requestedClips()).toHaveLength(1)
    expect(new Set(assetRequests.filter(url => url.includes('/menu/gamedata/')).map(url => url.split('/gamedata/')[1].split('/')[0])).size).toBe(1)
    for (const title of ['Octopode in the Vaults', 'Crystal Spears in Dis', 'Vaults skirmish', 'Ghoul in the Swamp', 'Blademaster in the Elven Halls', 'The Gauntlet Transporter', 'Stand against Jeremiah', 'Djinni descent', 'Volcano Lake']) {
      const before = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
      await chooser.selectOption({ label: title })
      await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toBe(before)
      await expect(canvas).toBeVisible()
    }
    expect(requestedClips()).toHaveLength(10)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.settings')!))).toEqual({ depthTilt: 65 })
    await chooser.selectOption({ label: 'Polar Vortex in Gehenna' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `test-results/menu-chooser-${narrow ? 'narrow' : 'desktop'}.png` })
    const chosen = await chooser.inputValue()
    await page.locator('[data-focus="about"]').click(); await expect(chooser).toBeHidden()
    await page.keyboard.press('Escape'); await expect(chooser).toHaveValue(chosen)
    await chooser.selectOption({ label: 'Shuffle all' }); await expect(chooser).toHaveValue('')
    await chooser.selectOption({ label: 'Djinni descent' })
    const djinni = await chooser.inputValue()
    await page.getByRole('button', { name: 'Next scene' }).click()
    await expect(chooser).not.toHaveValue(djinni)
    await page.getByRole('button', { name: 'Previous scene' }).click()
    await expect(chooser).toHaveValue(djinni)
    await expect(page.locator('.menu-replay-title')).toHaveText('Djinni descent')
    await page.reload(); await expect(chooser).toBeVisible(); await expect(chooser).toHaveValue('')
  })

  test(`menu replay tilt and zoom preview and persist with native controls at ${narrow ? 'narrow' : 'desktop'} width`, async ({ page }) => {
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 720 })
    await page.routeWebSocket(/^wss:\/\//, socket => socket.send(JSON.stringify({ msg: 'lobby_complete' })))
    await page.addInitScript(() => {
      Math.random = () => 0.999 // Stable first clip for the visual evidence.
      if (!localStorage.getItem('orbrun.settings')) localStorage.setItem('orbrun.settings', JSON.stringify({ depthTilt: 50, depthZoom: 1.2 }))
    })
    await page.goto('/')
    const slider = page.getByRole('slider', { name: 'Dungeon tilt', exact: true })
    const canvas = page.locator('.menu-backdrop canvas')
    await expect(canvas).toBeVisible()
    await expect(slider).toBeVisible()
    await expect(slider).toHaveValue('50')
    const controls = await page.locator('.menu-replay-controls').boundingBox()
    expect(controls).not.toBeNull()
    expect(controls!.x).toBeGreaterThanOrEqual(0)
    expect(controls!.x + controls!.width).toBeLessThanOrEqual(narrow ? 390 : 1280)
    expect(controls!.x + controls!.width / 2).toBeCloseTo(narrow ? 195 : 1280 * .68, 0)
    if (narrow) {
      const main = (await page.locator('.polished-main').boundingBox())!
      const footer = (await page.locator('.polished-footer').boundingBox())!
      expect(main.y).toBeLessThan(844 / 4)
      expect(main.y + main.height).toBeLessThanOrEqual(controls!.y)
      const footerGap = footer.y - (controls!.y + controls!.height)
      expect(footerGap).toBeGreaterThanOrEqual(0)
      expect(footerGap).toBeLessThan(16)
      expect(footer.y + footer.height).toBeGreaterThan(814)
      await expect(page.locator('.polished-footer')).toBeInViewport({ ratio: 1 })
    }
    const before = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
    // A real pointer click catches controls accidentally buried under the full-screen home layer.
    await slider.click()
    await slider.fill('70')
    await slider.press('ArrowRight')
    await expect(slider).toHaveValue('71')
    await expect(slider).toHaveAttribute('aria-valuetext', '71 degrees')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.settings')!))).toMatchObject({ depthTilt: 71, depthZoom: 1.2 })
    await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toBe(before)
    const zoom = page.getByRole('slider', { name: 'Dungeon zoom', exact: true })
    await expect(zoom).toHaveValue('120')
    await zoom.click()
    await zoom.press('Home'); await expect(zoom).toHaveValue('50')
    await zoom.press('End'); await expect(zoom).toHaveValue('200')
    await zoom.fill('145')
    await zoom.press('ArrowRight')
    await expect(zoom).toHaveAttribute('aria-valuetext', '150%')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('orbrun.settings')!))).toMatchObject({ depthTilt: 71, depthZoom: 1.5 })
    await page.screenshot({ path: `test-results/menu-tilt-${narrow ? 'narrow' : 'desktop'}.png` })
    await page.locator('[data-focus="about"]').click()
    await expect(slider).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(slider).toBeVisible()
    await expect(slider).toHaveValue('71')
    await page.reload()
    await expect(slider).toBeVisible()
    await expect(slider).toHaveValue('71')
    await expect(zoom).toHaveValue('150')
    for (const [key, value] of [['Home', '20'], ['End', '90']]) {
      const pixels = () => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
      await expect(canvas).toBeVisible()
      const previous = await pixels()
      await slider.press(key)
      await expect(slider).toHaveValue(value)
      await expect.poll(pixels).not.toBe(previous)
      await page.screenshot({ path: `test-results/menu-tilt-${value}-${narrow ? 'narrow' : 'desktop'}.png` })
    }
  })
}
