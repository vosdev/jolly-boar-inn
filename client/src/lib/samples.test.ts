import { describe, expect, it } from 'vitest'

import CASES from '../../../server/tests/sample_grading_cases.json'
import { MODES } from './modes'
import {
  SAMPLES,
  nextSample,
  orderingCredit,
  sampleCredit,
  sampleResult,
  sampleReveal,
  samplePicture,
  sampleSeconds,
  speedPoints,
  stepPoints,
  type OneAnswerSample,
  type Sample,
} from './samples'
import { credit, middle, onTrack } from './slider'

/** The sample of `mode`, narrowed to its type. */
function sampleOf<T extends Sample['type']>(mode: string, type: T): Extract<Sample, { type: T }> {
  const sample = SAMPLES[mode]!
  if (sample.type !== type) throw new Error(`${mode} is not a ${type}`)
  return sample as Extract<Sample, { type: T }>
}

describe('grading against the server', () => {
  it.each(CASES.slider)('slider credit %j', (c) => {
    expect(credit(c.min, c.max, c.answer, c.guess)).toBeCloseTo(c.credit, 9)
  })

  it.each(CASES.ordering)('ordering credit %j', (c) => {
    const picks = 'picks' in c ? c.picks : undefined
    expect(orderingCredit(c.ranks, picks, c.value)).toBeCloseTo(c.credit, 9)
  })
})

describe('step points against the server', () => {
  it.each(CASES.steps)('%j', (c) => {
    expect(stepPoints(c.elapsed * 1000, c.seconds, c)).toBe(c.points)
  })
})

describe('samples', () => {
  it('are each for a known mode', () => {
    for (const [id, sample] of Object.entries(SAMPLES)) {
      expect(MODES[id]).toBeDefined()
      expect(sample.mode).toBe(id)
    }
  })

  it('have the answer among the options on the buttons', () => {
    for (const sample of Object.values(SAMPLES)) {
      if (sample.type !== 'more_less' && sample.type !== 'multiple_choice') continue
      const options = sample.view.options as unknown[]
      expect(sample.answer).toBeGreaterThanOrEqual(0)
      expect(sample.answer).toBeLessThan(options.length)
    }
  })

  it('include the price, the sort and the shadow', () => {
    expect(SAMPLES.price_is_right?.type).toBe('price_is_right')
    expect(SAMPLES.sort_it_out?.type).toBe('ordering')
    expect(SAMPLES.whos_that_npc?.type).toBe('pick_from_list')
    expect(SAMPLES.pixel_hunt?.type).toBe('pick_from_list')
  })

  it('stay open as long as the room leaves their type open', () => {
    expect(sampleSeconds(SAMPLES.more_less!)).toBe(10)
    expect(sampleSeconds(SAMPLES.bestiary!)).toBe(18)
    expect(sampleSeconds(SAMPLES.scaperune!)).toBe(30)
    expect(sampleSeconds(SAMPLES.uris_unravelling!)).toBe(23)
    expect(sampleSeconds(SAMPLES.price_is_right!)).toBe(15)
    expect(sampleSeconds(SAMPLES.sort_it_out!)).toBe(35)
    expect(sampleSeconds(SAMPLES.whos_that_npc!)).toBe(25)
  })

  it('reveal More or Less with each value', () => {
    const shown = sampleReveal(SAMPLES.more_less!).options as { value: number }[]
    expect(shown.map((option) => option.value)).toEqual([15360, 39000])
  })

  it('keep the price on the slider, off its ends and off where it starts', () => {
    const sample = sampleOf('price_is_right', 'price_is_right')
    const { min, max } = sample.view as { min: number; max: number }
    expect(onTrack(sample.value)).toBe(true)
    expect(sample.value).toBeGreaterThan(min)
    expect(sample.value).toBeLessThan(max)
    expect(sample.value).not.toBe(middle(min, max))
    expect(sampleReveal(sample).value).toBe(sample.value)
  })

  it('reveal Sort It Out in rank order, as shown positions, with each fact', () => {
    const sample = sampleOf('sort_it_out', 'ordering')
    const shown = sampleReveal(sample)
    expect(shown.answer).toEqual([2, 4, 0, 3, 1])
    expect(shown.entries).toContainEqual({ text: 'Shark', rank: 1, detail: 'Heals 20' })
  })

  it('never start Sort It Out with its places already right', () => {
    const sample = sampleOf('sort_it_out', 'ordering')
    const places = sample.view.picks as number
    const first = sample.reveal.slice(0, places).map((entry) => entry.rank)
    expect(first).not.toEqual([1, 2, 3].slice(0, places))
  })

  it('grade Sort It Out with half credit for a right pick in the wrong place', () => {
    const sample = sampleOf('sort_it_out', 'ordering')
    expect(sampleCredit(sample, [2, 4, 0])).toBe(1)
    expect(sampleCredit(sample, [2, 0, 4])).toBeCloseTo(2 / 3, 9)
    expect(sampleCredit(sample, [1, 3, 0])).toBeCloseTo(1 / 3, 9)
  })

  it('grade the price by distance, and score the credit on speed', () => {
    const sample = sampleOf('price_is_right', 'price_is_right')
    expect(sampleResult(sample, 130000, 1000)).toMatchObject({ correct: true, points: 1000 })
    const near = sampleResult(sample, 124000, 1000)
    expect(near.correct).toBe(false)
    expect(near.points).toBe(958)
    expect(sampleResult(sample, 70000, 1000)).toMatchObject({ credit: 0, points: 0 })
  })

  it('grade the NPC by entry id, on speed: its mode has no steps', () => {
    const sample = sampleOf('whos_that_npc', 'pick_from_list')
    expect(sampleResult(sample, 817, 3000)).toMatchObject({ correct: true, points: 900 })
    expect(sampleResult(sample, 8, 3000)).toMatchObject({ correct: false, points: 0 })
    expect(sampleReveal(sample)).toMatchObject({ answer_id: 817, subject: { name: 'Elvarg' } })
  })

  it('grade Pixel Hunt by entry id, on the step the picture has reached', () => {
    const sample = sampleOf('pixel_hunt', 'pick_from_list')
    expect(sampleSeconds(sample)).toBe(25)
    expect(sampleResult(sample, 4151, 500)).toMatchObject({ correct: true, points: 1000 })
    expect(sampleResult(sample, 4151, 9000)).toMatchObject({ correct: true, points: 718 })
    expect(sampleResult(sample, 4151, 24000)).toMatchObject({ correct: true, points: 400 })
    expect(sampleResult(sample, 1, 500)).toMatchObject({ correct: false, points: 0 })
  })

  it('draw Pixel Hunt from the fetched detail picture, or none where it is missing', () => {
    const sample = sampleOf('pixel_hunt', 'pick_from_list')
    const files = { '../assets/items/detail_4151.png': '/whip.png' }
    expect(samplePicture(sample, files)).toBe('/whip.png')
    expect(samplePicture(sample, {})).toBeNull()
  })

  it('score on the server speed buckets', () => {
    expect(speedPoints(1, 2000, 20)).toBe(1000)
    expect(speedPoints(1, 2001, 20)).toBe(900)
    expect(speedPoints(1, 10000, 20)).toBe(800)
    expect(speedPoints(1, 15000, 20)).toBe(700)
    expect(speedPoints(1, 20000, 20)).toBe(600)
    expect(speedPoints(1, 20001, 20)).toBe(0)
    expect(speedPoints(0, 1000, 20)).toBe(0)
  })

  it('grade the right index alone as correct', () => {
    const sample = SAMPLES.bestiary as OneAnswerSample
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
    expect(nextSample('more_less', ['more_less', 'no_sample', 'bestiary'])).toBe('bestiary')
    expect(nextSample('bestiary', ['more_less', 'no_sample', 'bestiary'])).toBe('more_less')
  })
})
