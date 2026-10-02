/**
 * The search a `pick_from_list` round is answered with: case, accents,
 * word-prefix ("whip" finds "Abyssal whip"), and names that start with the query first.
 * Plus the once-per-session fetch.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearVocabCache, fold, loadVocab, search, words, type VocabEntry } from './vocab'

const ENTRIES: VocabEntry[] = [
  { id: 4587, name: 'Dragon scimitar' },
  { id: 4151, name: 'Abyssal whip' },
  { id: 12006, name: 'Abyssal tentacle' },
  { id: 4712, name: "Ahrim's robetop" },
  { id: 21015, name: 'Dinh’s bulwark' },
  { id: 12773, name: 'Volcanic abyssal whip' },
  { id: 1333, name: 'Rune scimitar' },
  { id: 9999, name: 'Élysian spirit shield' },
]

const names = (query: string) => search(ENTRIES, query).map((entry) => entry.name)

describe('fold and words', () => {
  it('drop case and accents, the way the server folds a name', () => {
    expect(fold('Élysian SPIRIT')).toBe('elysian spirit')
    expect(words("Ahrim's robetop")).toEqual(['ahrim', 's', 'robetop'])
    expect(words('Amulet of glory(6)')).toEqual(['amulet', 'of', 'glory', '6'])
  })
})

describe('search', () => {
  it('is the whole list, alphabetical, for an empty query', () => {
    expect(names('')).toEqual([
      'Abyssal tentacle',
      'Abyssal whip',
      "Ahrim's robetop",
      'Dinh’s bulwark',
      'Dragon scimitar',
      'Élysian spirit shield',
      'Rune scimitar',
      'Volcanic abyssal whip',
    ])
    expect(names('   ')).toHaveLength(ENTRIES.length)
  })

  it('ignores case', () => {
    expect(names('ABYSSAL WHIP')).toEqual(['Abyssal whip', 'Volcanic abyssal whip'])
  })

  it('ignores accents, both ways round', () => {
    expect(names('elysian')).toEqual(['Élysian spirit shield'])
    expect(names('Élys')).toEqual(['Élysian spirit shield'])
  })

  it('matches the start of any word, so "whip" finds "Abyssal whip"', () => {
    expect(names('whip')).toEqual(['Abyssal whip', 'Volcanic abyssal whip'])
    expect(names('scim')).toEqual(['Dragon scimitar', 'Rune scimitar'])
    expect(names('bulwark')).toEqual(['Dinh’s bulwark'])
  })

  it('matches words in order, each by its start: "d sc" is Dragon scimitar', () => {
    expect(names('d sc')).toEqual(['Dragon scimitar'])
    expect(names('abyssal wh')).toEqual(['Abyssal whip', 'Volcanic abyssal whip'])
    expect(names('ahrim')).toEqual(["Ahrim's robetop"])
    expect(names("ahrim's")).toEqual(["Ahrim's robetop"])
  })

  it('does not match the middle of a word', () => {
    expect(names('hip')).toEqual([])
    expect(names('imitar')).toEqual([])
    expect(names('sc d')).toEqual([])
  })

  it('puts names that start with the query first, then the rest, each alphabetical', () => {
    expect(names('ab')).toEqual(['Abyssal tentacle', 'Abyssal whip', 'Volcanic abyssal whip'])
    expect(
      search(
        [
          { id: 1, name: 'Rune arrow' },
          { id: 2, name: 'Arrow shaft' },
          { id: 3, name: 'Bronze arrow' },
          { id: 4, name: 'Arrowtips' },
        ],
        'arrow',
      ).map((e) => e.name),
    ).toEqual(['Arrow shaft', 'Arrowtips', 'Bronze arrow', 'Rune arrow'])
  })

  it('leaves the list it was given alone', () => {
    const before = ENTRIES.map((e) => e.id)
    search(ENTRIES, '')
    expect(ENTRIES.map((e) => e.id)).toEqual(before)
  })

  it('folds a list once, and after that only the query', () => {
    const list = ENTRIES.map((entry) => ({ ...entry }))
    const normalize = vi.spyOn(String.prototype, 'normalize')
    try {
      search(list, 'a')
      expect(normalize.mock.calls.length).toBeGreaterThanOrEqual(list.length)
      normalize.mockClear()
      search(list, 'ab')
      search(list, 'abyssal w')
      expect(normalize).toHaveBeenCalledTimes(2)
    } finally {
      normalize.mockRestore()
    }
  })
})

describe('loadVocab', () => {
  afterEach(() => {
    clearVocabCache()
    vi.unstubAllGlobals()
  })

  const body = { vocab: 'items', version: 'abc', entries: ENTRIES }

  it('fetches a list once per session, however many ask', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body)))
    vi.stubGlobal('fetch', fetch)
    const [a, b] = await Promise.all([loadVocab('items'), loadVocab('items')])
    await loadVocab('items')
    expect(a).toEqual(body)
    expect(b).toBe(a)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/vocab/items')
  })

  it('forgets a failure, so the next caller tries again', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'not_found', message: 'no' }), { status: 404 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(body)))
    vi.stubGlobal('fetch', fetch)
    await expect(loadVocab('items')).rejects.toMatchObject({ code: 'not_found' })
    await expect(loadVocab('items')).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
