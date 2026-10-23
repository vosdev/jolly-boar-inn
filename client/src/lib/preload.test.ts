import { afterEach, describe, expect, it, vi } from 'vitest'

import { importantPictures, preloadPictures } from './preload'

const made: string[] = []

afterEach(() => {
  made.length = 0
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
})

function spyOnImages(): void {
  vi.stubGlobal(
    'Image',
    class {
      decoding = ''
      set src(url: string) {
        made.push(url)
      }
    },
  )
}

describe('importantPictures', () => {
  // The art is not committed, so the list is whatever this checkout holds.
  it('lists each picture once, and no pet icons', () => {
    const list = importantPictures()
    expect(new Set(list).size).toBe(list.length)
    expect(
      list.filter((url) => /pets\/[^/]*\.(png|svg)/.test(url) && !url.includes('chathead')),
    ).toEqual([])
  })
})

describe('preloadPictures', () => {
  it('waits for the browser to be idle, then fetches each picture', () => {
    spyOnImages()
    let run: () => void = () => {}
    preloadPictures(['/a.png', '/b.png'], (callback) => (run = callback))
    expect(made).toEqual([])
    run()
    expect(made).toEqual(['/a.png', '/b.png'])
  })

  it.each([{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }])(
    'fetches nothing on a spared connection (%o)',
    (connection) => {
      spyOnImages()
      Object.defineProperty(navigator, 'connection', { value: connection, configurable: true })
      const idle = vi.fn()
      preloadPictures(['/a.png'], idle)
      expect(idle).not.toHaveBeenCalled()
    },
  )
})
