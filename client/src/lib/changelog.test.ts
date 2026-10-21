/** The changelog: one entry for this build and every release before it, in order. */

import { describe, expect, it } from 'vitest'

import { CHANGELOG, MINOR_MAX, PATCH_MAX, groupByMinor, isPatch } from './changelog'

/** `0.10.2` as numbers, for comparing versions the way semver does. */
function parts(version: string): number[] {
  return version.split('.').map(Number)
}

function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return false
}

describe('CHANGELOG', () => {
  it('has an entry for this build, first', () => {
    expect(CHANGELOG[0]!.version).toBe(__APP_VERSION__)
  })

  it('ends at 0.1.0', () => {
    expect(CHANGELOG.at(-1)!.version).toBe('0.1.0')
  })

  it('lists versions strictly newest first', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(newer(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version), CHANGELOG[i]!.version).toBe(
        true,
      )
    }
  })

  it('dates every entry with a real day, never later than the one above', () => {
    for (const [i, entry] of CHANGELOG.entries()) {
      expect(entry.date, entry.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.date)
      if (i > 0) expect(entry.date <= CHANGELOG[i - 1]!.date, entry.version).toBe(true)
    }
  })

  it('keeps a minor to two lines and a patch to one', () => {
    for (const entry of CHANGELOG) {
      expect(entry.text.trim(), entry.version).not.toBe('')
      expect(entry.text, entry.version).not.toContain('\n')
      expect(entry.text.length, entry.version).toBeLessThanOrEqual(
        isPatch(entry.version) ? PATCH_MAX : MINOR_MAX,
      )
    }
  })
})

describe('groupByMinor', () => {
  const entry = (version: string) => ({ version, date: '2026-10-01', text: version })

  it('nests patches under their minor, both newest first', () => {
    const groups = groupByMinor([
      entry('0.7.0'),
      entry('0.6.2'),
      entry('0.6.1'),
      entry('0.6.0'),
      entry('0.5.0'),
    ])
    expect(groups.map((group) => group.key)).toEqual(['0.7', '0.6', '0.5'])
    expect(groups[1]!.minor!.version).toBe('0.6.0')
    expect(groups[1]!.patches.map((patch) => patch.version)).toEqual(['0.6.2', '0.6.1'])
    expect(groups[0]!.patches).toEqual([])
  })

  it('keeps patches whose minor never reached main, under a group of their own', () => {
    const groups = groupByMinor([entry('0.34.2'), entry('0.34.1'), entry('0.33.0')])
    expect(groups[0]).toEqual({
      key: '0.34',
      minor: null,
      patches: [entry('0.34.2'), entry('0.34.1')],
    })
  })
})
