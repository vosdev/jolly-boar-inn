import { describe, expect, it } from 'vitest'

import { MODES } from './modes'
import { SAMPLES, nextSample, sampleResult, sampleReveal, speedPoints } from './samples'

describe('samples', () => {
  it('are each for a known mode, with the answer among the options', () => {
    for (const [id, sample] of Object.entries(SAMPLES)) {
      expect(MODES[id]).toBeDefined()
      expect(sample.mode).toBe(id)
      const options = sample.view.options as unknown[]
      expect(sample.answer).toBeGreaterThanOrEqual(0)
      expect(sample.answer).toBeLessThan(options.length)
    }
  })

  it('reveal More or Less with each value', () => {
    const shown = sampleReveal(SAMPLES.more_less!).options as { value: number }[]
    expect(shown.map((option) => option.value)).toEqual([15360, 39000])
  })

  it('score on the server speed buckets', () => {
    expect(speedPoints(1, 2000)).toBe(1000)
    expect(speedPoints(1, 2001)).toBe(900)
    expect(speedPoints(1, 10000)).toBe(800)
    expect(speedPoints(1, 15000)).toBe(700)
    expect(speedPoints(1, 20000)).toBe(600)
    expect(speedPoints(1, 20001)).toBe(0)
    expect(speedPoints(0, 1000)).toBe(0)
  })

  it('grade the right index alone as correct', () => {
    const sample = SAMPLES.bestiary!
    expect(sampleResult(sample, sample.answer, 1000)).toEqual({
      value: sample.answer,
      correct: true,
      credit: 1,
      points: 1000,
    })
    expect(sampleResult(sample, sample.answer + 1, 1000)).toMatchObject({
      correct: false,
      points: 0,
    })
  })

  it('go on to the next mode with a sample, wrapping round', () => {
    expect(nextSample('more_less', ['more_less', 'sort_it_out', 'bestiary'])).toBe('bestiary')
    expect(nextSample('bestiary', ['more_less', 'sort_it_out', 'bestiary'])).toBe('more_less')
  })
})
