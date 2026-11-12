import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertDeployable } from '../../../tools/build/deploy-guard.mjs'
import { prepareDeployment } from '../../../tools/build/deploy-build.mjs'

let temporary: string[] = []
let template: string
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const identity = (cwd: string) => {
  git(cwd, 'config', 'user.name', 'Deployment test')
  git(cwd, 'config', 'user.email', 'deploy-test@example.invalid')
}
const commit = (cwd: string, name: string, content = name) => {
  writeFileSync(join(cwd, name), content)
  git(cwd, 'add', name)
  git(cwd, 'commit', '-m', name)
  return git(cwd, 'rev-parse', 'HEAD')
}
beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), 'orbrun-deploy-template-'))
  const dir = template
  git(dir, 'init', '--bare', '--initial-branch=main', 'remote.git')
  git(dir, 'init', '--initial-branch=main', 'publisher')
  const publisher = join(dir, 'publisher'), repo = join(dir, 'repo')
  identity(publisher)
  commit(publisher, '.gitignore', 'dist/\n')
  commit(publisher, 'features.txt', 'original feature\n')
  git(publisher, 'remote', 'add', 'origin', join(dir, 'remote.git'))
  git(publisher, 'push', 'origin', 'main')
  git(dir, 'clone', join(dir, 'remote.git'), 'repo')
  identity(repo)
})
afterAll(() => { if (template) rmSync(template, { recursive: true, force: true }) })

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'orbrun-deploy-guard-'))
  temporary.push(dir)
  // Copy the committed baseline, including independent Git object files. Every
  // test still fetches/pushes against its own real, mutable bare remote.
  cpSync(template, dir, { recursive: true })
  const publisher = join(dir, 'publisher'), repo = join(dir, 'repo')
  for (const checkout of [publisher, repo]) git(checkout, 'remote', 'set-url', 'origin', join(dir, 'remote.git'))
  const advance = () => {
    const head = commit(publisher, 'features.txt', 'new popup feature\n')
    git(publisher, 'push', 'origin', 'main')
    return head
  }
  return { dir, publisher, repo, advance }
}

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true })
  temporary = []
})

describe('production deployment guard with real Git remotes', () => {
  it('fetches past a stale tracking ref and refuses the old feature set before building', () => {
    const { repo, advance } = fixture()
    const old = git(repo, 'rev-parse', 'origin/main'), latest = advance()
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(old)
    const build = vi.fn()
    expect(() => prepareDeployment({ cwd: repo, build })).toThrow('does not include latest origin/main')
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(latest)
    expect(build).not.toHaveBeenCalled()
  })

  it('allows a clean feature branch that includes current main', () => {
    const { repo } = fixture()
    git(repo, 'switch', '-c', 'corridor')
    const head = commit(repo, 'corridor.txt')
    expect(assertDeployable(repo)).toBe(head)
  })

  it('refuses a diverged branch even when it has its own newer commits', () => {
    const { repo, advance } = fixture()
    commit(repo, 'corridor.txt')
    advance()
    expect(() => assertDeployable(repo)).toThrow('does not include latest origin/main')
  })

  it('allows deployment after latest main is merged, preserving both features', () => {
    const { repo, advance } = fixture()
    commit(repo, 'corridor.txt')
    advance()
    git(repo, 'fetch', 'origin')
    git(repo, 'merge', '--no-edit', 'origin/main')
    expect(assertDeployable(repo)).toBe(git(repo, 'rev-parse', 'HEAD'))
    expect(readFileSync(join(repo, 'features.txt'), 'utf8')).toContain('new popup feature')
    expect(readFileSync(join(repo, 'corridor.txt'), 'utf8')).toBe('corridor.txt')
  })

  it.each(['unstaged', 'staged', 'untracked'])('refuses %s changes that could remove committed features', state => {
    const { repo } = fixture()
    const name = state === 'untracked' ? 'extra.txt' : 'features.txt'
    writeFileSync(join(repo, name), 'different source')
    if (state === 'staged') git(repo, 'add', name)
    expect(() => assertDeployable(repo)).toThrow('commit or stash')
  })

  it('fails closed when fetching fails, even with a valid cached origin/main', () => {
    const { repo, dir } = fixture()
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(git(repo, 'rev-parse', 'HEAD'))
    git(repo, 'remote', 'set-url', 'origin', join(dir, 'missing.git'))
    expect(() => assertDeployable(repo)).toThrow('could not fetch origin/main')
  })

  it('allows detached CI checkouts of current main', () => {
    const { repo } = fixture()
    git(repo, 'checkout', '--detach')
    expect(assertDeployable(repo)).toBe(git(repo, 'rev-parse', 'HEAD'))
  })

  it('rebuilds ignored assets instead of reusing an earlier dist', () => {
    const { repo } = fixture()
    mkdirSync(join(repo, 'dist'))
    writeFileSync(join(repo, 'dist/index.html'), 'stale build')
    prepareDeployment({ cwd: repo, build: () => writeFileSync(join(repo, 'dist/index.html'), 'current features') })
    expect(readFileSync(join(repo, 'dist/index.html'), 'utf8')).toBe('current features')
  })

  it('refuses deployment if main advances during the build', () => {
    const { repo, advance } = fixture()
    expect(() => prepareDeployment({ cwd: repo, build: advance })).toThrow('does not include latest origin/main')
  })

  it('refuses assets built while HEAD changed, even if both commits include main', () => {
    const { repo } = fixture()
    expect(() => prepareDeployment({ cwd: repo, build: () => commit(repo, 'changed-during-build.txt') })).toThrow('HEAD changed during the build')
  })

  it('refuses source edits made during the build', () => {
    const { repo } = fixture()
    expect(() => prepareDeployment({ cwd: repo, build: () => writeFileSync(join(repo, 'features.txt'), 'removed') })).toThrow('commit or stash')
  })

  it('stops when building fails', () => {
    const { repo } = fixture()
    expect(() => prepareDeployment({ cwd: repo, build: () => { throw new Error('build failed') } })).toThrow('build failed')
  })

  it('leaves local Worker development usable with uncommitted changes', () => {
    const { repo } = fixture(), build = vi.fn()
    writeFileSync(join(repo, 'features.txt'), 'work in progress')
    prepareDeployment({ cwd: repo, command: 'dev', build })
    expect(build).toHaveBeenCalledOnce()
  })
})
