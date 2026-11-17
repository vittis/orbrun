import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import manifest from './data/menu-replays.json'

/** Fail builds if a curated recording or its matching artwork is missing or changed. No provisioning. */
export function verifyMenuReplays(root = join(import.meta.dirname, 'public/menu')) {
  for (const [path, expected] of Object.entries(manifest.assets)) {
    const bytes = readFileSync(join(root, path))
    if (bytes.length !== expected.size || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
      throw new Error(`Menu replay asset does not match its manifest: ${path}`)
    }
  }
}

export function menuReplayAssets(): Plugin {
  return { name: 'orbrun-menu-replays', buildStart() { verifyMenuReplays() } }
}
