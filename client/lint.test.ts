/**
 * Formatting is enforced, not suggested: the project's Prettier config rejects code in the
 * wrong shape, `pnpm lint` runs it, and both `make lint` and CI run `pnpm lint`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const CLIENT = import.meta.dirname
const ROOT = join(CLIENT, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const scripts: Record<string, string> = JSON.parse(read('client/package.json')).scripts

/** Whether `source`, saved as `name` in the client, passes `prettier --check`. */
function formatted(name: string, source: string): boolean {
  const bin = join(CLIENT, 'node_modules', '.bin', 'prettier')
  const args = ['--check', '--stdin-filepath', join('src', name)]
  return spawnSync(bin, args, { cwd: CLIENT, input: source }).status === 0
}

describe('prettier', () => {
  it('rejects a misformatted .ts file', () => {
    expect(formatted('x.ts', "export const a = 1\n")).toBe(true)
    expect(formatted('x.ts', 'export const a = "1";\n')).toBe(false)
  })

  it('rejects a misformatted .svelte file', () => {
    const good = "<script lang=\"ts\">\n  let { a }: { a: string } = $props()\n</script>\n\n<p>{a}</p>\n"
    expect(formatted('X.svelte', good)).toBe(true)
    expect(formatted('X.svelte', good.replace('  let', 'let').replace(')\n', ');\n'))).toBe(
      false,
    )
  })
})

describe('pnpm lint', () => {
  it('runs eslint and prettier --check, and is not pnpm check', () => {
    expect(scripts.lint).toContain('eslint .')
    expect(scripts.lint).toContain('prettier --check .')
    expect(scripts.lint).not.toBe(scripts.check)
  })

  it('runs in make lint and in CI', () => {
    const lint = read('Makefile').match(/^lint:\n((?:\t.*\n)+)/m)?.[1] ?? ''
    expect(lint).toContain('pnpm lint')
    const client = read('.github/workflows/ci.yml').match(/^ {2}client:\n((?: {4}.*\n|\n)+)/m)?.[1]
    expect(client).toContain('- run: pnpm lint')
  })
})

describe('git blame', () => {
  it('skips the commits in .git-blame-ignore-revs once make setup has run', () => {
    expect(read('Makefile')).toContain('git config blame.ignoreRevsFile .git-blame-ignore-revs')
    const revs = read('.git-blame-ignore-revs')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
    expect(revs.length).toBeGreaterThan(0)
    for (const rev of revs) expect(rev).toMatch(/^[0-9a-f]{40}$/)
  })
})
