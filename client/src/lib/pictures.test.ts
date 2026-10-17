import { describe, expect, it } from 'vitest'

import { pictureUrl } from './pictures'

describe('pictureUrl', () => {
  it('serves a picture from its own path under its random name', () => {
    expect(pictureUrl('0123456789abcdef.png')).toBe('/pictures/0123456789abcdef.png')
  })

  it('has nothing for a question without a picture, so nothing is drawn broken', () => {
    expect(pictureUrl(null)).toBeNull()
    expect(pictureUrl(undefined)).toBeNull()
  })
})
