/**
 * Run as its own process: under jsdom, `prettier` resolves to its browser build, which
 * cannot read the project's config.
 */

import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

const CLIENT = import.meta.dirname

describe('protocol.gen.ts', () => {
  it('is what the committed schema generates', () => {
    const run = spawnSync(process.execPath, ['gen-protocol.ts', '--check'], {
      cwd: CLIENT,
      encoding: 'utf8',
    })
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
  }, 20_000)
})
