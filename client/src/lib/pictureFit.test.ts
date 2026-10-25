/** A large question picture takes the stage's leftover height, clamped to 160px and its render's own. */

import { describe, expect, it } from 'vitest'

import { PICTURE_LEAST, SUGGESTIONS, pictureHeight, suggestionsHeight } from './pictureFit'

describe('pictureHeight', () => {
  it('is the room left when that lies between the least and the render', () => {
    expect(pictureHeight(300, 500)).toBe(300)
  })

  it('stops at the render, which a larger box would only blur', () => {
    expect(pictureHeight(900, 420)).toBe(420)
  })

  it('stops at 160px however little room is left', () => {
    expect(pictureHeight(40, 500)).toBe(PICTURE_LEAST)
    expect(pictureHeight(-20, 500)).toBe(PICTURE_LEAST)
  })

  it('is the render itself when that is smaller than 160px', () => {
    expect(pictureHeight(700, 96)).toBe(96)
  })

  it('stops at one image pixel per screen pixel when the room is scaled up', () => {
    expect(pictureHeight(900, 420, 1.5)).toBe(280)
    expect(pictureHeight(200, 420, 1.5)).toBe(200)
  })

  it('never exceeds a render smaller than the floor, scaled or not', () => {
    expect(pictureHeight(700, 96, 1.2)).toBe(80)
  })
})

describe('suggestionsHeight', () => {
  it('holds five rows of 2.5rem and the list’s own chrome', () => {
    expect(SUGGESTIONS).toBe(5)
    expect(suggestionsHeight(16)).toBe(Math.ceil(16 * 13.35 + 8))
  })
})
