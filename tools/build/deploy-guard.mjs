import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** Fetch the authoritative branch every time; cached tracking refs cannot approve a deployment. */
export function assertDeployable(cwd = root) {
  const git = (...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
  const clean = () => {
    if (git('status', '--porcelain', '--untracked-files=all')) {
      throw new Error('Deployment refused: commit or stash all working-tree changes first.')
    }
  }
  clean()
  try {
    git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main')
  } catch {
    throw new Error('Deployment refused: could not fetch origin/main. Restore remote access and retry; cached refs are not sufficient.')
  }
  const head = git('rev-parse', 'HEAD'), main = git('rev-parse', 'refs/remotes/origin/main')
  try {
    git('merge-base', '--is-ancestor', main, head)
  } catch {
    throw new Error(`Deployment refused: HEAD ${head.slice(0, 12)} does not include latest origin/main ${main.slice(0, 12)}. Merge or rebase origin/main, commit the result, and retry. Shallow checkouts may need more history.`)
  }
  clean()
  console.log(`[deploy guard] ${head.slice(0, 12)} includes latest origin/main ${main.slice(0, 12)}`)
  return head
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertDeployable() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
