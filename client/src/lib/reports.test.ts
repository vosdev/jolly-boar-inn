/** How the report queue names a question: the way players found it in the form. */

import { describe, expect, it } from 'vitest'

import { packAnswer, questionLine } from './reports'

describe('questionLine', () => {
  it('names a Who’s That NPC? question by its NPC, as the form lists it', () => {
    const question = {
      id: 'q_1',
      type: 'pick_from_list',
      mode: 'whos_that_npc',
      payload: {
        prompt: 'Who’s that NPC?',
        vocab: 'npcs',
        answer_id: 7241,
        subject: { name: 'Abyssal demon' },
      },
    }
    expect(questionLine(question)).toBe('Abyssal demon')
  })
})

describe('packAnswer', () => {
  it('gives a slider’s answer with its ends and scale, for the admin to check', () => {
    const question = {
      id: 'q_1',
      type: 'number_slider',
      mode: 'bestiary',
      payload: {
        prompt: 'Hitpoints?',
        answer: 2000,
        unit: 'hp',
        min: 100,
        max: 10000,
        scale: 'log',
      },
    }
    expect(packAnswer(question)).toBe('2000 hp (100 to 10000, log)')
  })
})
