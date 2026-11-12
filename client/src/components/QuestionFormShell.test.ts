/** The intro, asker and explanation every question form shows are written once, in the shell. */

import { describe, expect, it } from 'vitest'

import customSource from './CustomQuestionForm.svelte?raw'
import matchingSource from './MatchingForm.svelte?raw'
import orderingSource from './OrderingForm.svelte?raw'
import shellSource from './QuestionFormShell.svelte?raw'

const SHARED = [
  "Intro, a line in the asker's voice before the question",
  '<NpcPicker',
  'Explanation shown after the question finished.',
]

describe('QuestionFormShell', () => {
  it.each(SHARED)('holds %s', (markup) => {
    expect(shellSource).toContain(markup)
  })

  it.each([
    ['CustomQuestionForm', customSource],
    ['MatchingForm', matchingSource],
    ['OrderingForm', orderingSource],
  ])('%s leaves the shared markup to the shell', (_, source) => {
    for (const markup of SHARED) expect(source).not.toContain(markup)
  })
})
