import { describe, expect, it } from 'vitest'
import { changeScope } from '../change-scope.mjs'

describe('verification scope', () => {
  it('skips repository prose but verifies documents embedded in the app', () => {
    expect(changeScope(['README.md', 'AGENTS.md', 'project-notes/RUNBOOK.md']).code).toBe(false)
    expect(changeScope(['ABOUT.md'])).toMatchObject({ code: true, production: true })
  })
  it('keeps unit-only changes free of browser setup', () => {
    expect(changeScope(['packages/webtiles/test/reducer.test.ts'])).toEqual({ code: true, browser: 'none', production: false, deploy: false })
  })
  it('widens for rendering, fixtures, CSS and shared configuration', () => {
    expect(changeScope(['apps/orbrun/src/styles.css']).browser).toBe('smoke')
    expect(changeScope(['apps/orbrun/src/servers.ts'])).toMatchObject({ browser: 'smoke', production: true })
    for (const path of ['packages/render-2.5d/src/index.ts', 'packages/render-2d/src/index.ts', 'apps/orbrun/public/room/places/lair.json', 'apps/orbrun/testbed/fixture.ts'])
      expect(changeScope([path]).browser, path).toBe('full')
    expect(changeScope(['tsconfig.base.json'])).toEqual({ code: true, browser: 'full', production: true, deploy: true })
  })
  it('includes the real Git tests when deployment tooling changes', () => {
    expect(changeScope(['tools/build/deploy-guard.mjs'])).toMatchObject({ code: true, deploy: true, production: true })
  })
  it('never downgrades a wider gate and checks unknown paths conservatively', () => {
    expect(changeScope(['packages/scene/src/index.ts', 'apps/orbrun/src/hud.ts']).browser).toBe('full')
    expect(changeScope(['project-notes/new-script.mjs']).browser).toBe('full')
    expect(changeScope(['new-tool/script.mjs'])).toEqual({ code: true, browser: 'full', production: true, deploy: true })
  })
})
