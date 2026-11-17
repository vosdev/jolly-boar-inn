import { describe, expect, it } from 'vitest'

import { exportText, importText } from './customQuestions'
import { answerLine, draftOf, problems, questionOf, type MatchingDraft } from './matching'

function written(pairs: number, decoys: number): MatchingDraft {
  const draft = draftOf()
  draft.prompt = 'Match each boss to where it is fought.'
  draft.pairs = Array.from({ length: pairs }, (_, i) => ({
    field: `Boss ${i + 1}`,
    icon: '',
    option: `Lair ${i + 1}`,
    detail: '',
  }))
  draft.decoys = Array.from({ length: decoys }, (_, i) => ({
    option: `Decoy ${i + 1}`,
    detail: '',
  }))
  return draft
}

/** A sort into `bins` bins, entries taking the first two bins in turn. */
function sorting(bins: number, entries: number): MatchingDraft {
  const draft = draftOf()
  draft.prompt = 'Which god does each belong to?'
  draft.sorting = true
  draft.bins = Array.from({ length: bins }, (_, i) => ({ option: `God ${i + 1}`, detail: '' }))
  draft.entries = Array.from({ length: entries }, (_, i) => ({
    field: `Item ${i + 1}`,
    icon: '',
    bin: i % Math.min(bins, 2),
  }))
  return draft
}

const paths = (draft: MatchingDraft, icons = false) =>
  problems(questionOf(draft), icons).map((problem) => problem.path)

describe('matching drafts', () => {
  it('start with three blank pairs and no decoys', () => {
    const draft = draftOf()
    expect(draft.pairs).toHaveLength(3)
    expect(draft.decoys).toEqual([])
  })

  it('build a payload check() passes, pairs first and decoys after', () => {
    const draft = written(3, 2)
    draft.pairs[0]!.detail = ' Tirannwn '
    const { payload } = questionOf(draft)
    expect(payload).toEqual({
      prompt: 'Match each boss to where it is fought.',
      fields: [{ text: 'Boss 1' }, { text: 'Boss 2' }, { text: 'Boss 3' }],
      options: [
        { text: 'Lair 1', detail: 'Tirannwn' },
        { text: 'Lair 2' },
        { text: 'Lair 3' },
        { text: 'Decoy 1' },
        { text: 'Decoy 2' },
      ],
      answer: [0, 1, 2],
    })
    expect(problems(questionOf(draft))).toEqual([])
  })

  it('open a stored question as its pairs and decoys, whatever order its options are in', () => {
    const payload = {
      prompt: 'Which?',
      fields: [{ text: 'Zulrah' }, { text: 'Vorkath' }, { text: 'Kraken' }],
      options: [
        { text: 'Lithkren' },
        { text: 'Kraken Cove' },
        { text: 'Zul-Andra' },
        { text: 'Ungael' },
      ],
      answer: [2, 3, 1],
    }
    const draft = draftOf({ type: 'matching', payload })
    expect(draft.pairs.map((pair) => [pair.field, pair.option])).toEqual([
      ['Zulrah', 'Zul-Andra'],
      ['Vorkath', 'Ungael'],
      ['Kraken', 'Kraken Cove'],
    ])
    expect(draft.decoys).toEqual([{ option: 'Lithkren', detail: '' }])
    expect(answerLine(payload)).toBe(
      'Zulrah → Zul-Andra, Vorkath → Ungael, Kraken → Kraken Cove; left over: Lithkren',
    )
  })

  it('refuse 2 fields, 7 fields and 7 options', () => {
    expect(paths(written(2, 1))).toContain('payload.fields')
    expect(paths(written(7, 0))).toContain('payload.fields')
    expect(paths(written(4, 3))).toContain('payload.options')
    expect(paths(written(6, 0))).toEqual([])
    expect(paths(written(3, 3))).toEqual([])
  })

  it('refuse a repeated field or answer, and an empty field', () => {
    const draft = written(3, 1)
    draft.pairs[2]!.field = ' boss  1 '
    draft.decoys[0]!.option = 'lair 2'
    draft.pairs[1]!.field = ''
    expect(paths(draft)).toEqual([
      'payload.fields[1].text',
      'payload.fields[2].text',
      'payload.options[3].text',
    ])
  })

  it('take an icon only where the form allows one', () => {
    const draft = written(3, 0)
    draft.pairs[0] = { field: '', icon: 'item:4151', option: 'Abyssal demon', detail: '' }
    expect(paths(draft)).toEqual(['payload.fields[0].icon'])
    expect(paths(draft, true)).toEqual([])
    expect(questionOf(draft).payload.fields).toEqual([
      { icon: 'item:4151' },
      { text: 'Boss 2' },
      { text: 'Boss 3' },
    ])
  })

  it('export from Create and import back the same question', () => {
    const question = { ...questionOf(written(3, 1)), random_event: 'bob' }
    const text = exportText([question])
    const back = importText(text)
    expect(back).toEqual({ ok: true, questions: [question] })
    expect(exportText(back.ok ? back.questions : [])).toBe(text)
  })

  it('start a sort with three blank bins and four entries, in the first bin', () => {
    const draft = draftOf()
    expect(draft.sorting).toBe(false)
    expect(draft.bins).toHaveLength(3)
    expect(draft.entries).toEqual(
      Array.from({ length: 4 }, () => ({ field: '', icon: '', bin: 0 })),
    )
  })

  it('build a sort check() passes, many entries to a bin and a bin left empty', () => {
    const draft = sorting(3, 5)
    draft.bins[0]!.detail = ' Order '
    const { payload } = questionOf(draft)
    expect(payload).toEqual({
      prompt: 'Which god does each belong to?',
      bins: true,
      fields: [1, 2, 3, 4, 5].map((n) => ({ text: `Item ${n}` })),
      options: [{ text: 'God 1', detail: 'Order' }, { text: 'God 2' }, { text: 'God 3' }],
      answer: [0, 1, 0, 1, 0],
    })
    expect(problems(questionOf(draft))).toEqual([])
  })

  it('open a stored sort as its bins and entries, and line it up for a reviewer', () => {
    const payload = questionOf(sorting(3, 4)).payload
    const draft = draftOf({ type: 'matching', payload })
    expect(draft.sorting).toBe(true)
    expect(draft.bins.map((bin) => bin.option)).toEqual(['God 1', 'God 2', 'God 3'])
    expect(draft.entries.map((entry) => [entry.field, entry.bin])).toEqual([
      ['Item 1', 0],
      ['Item 2', 1],
      ['Item 3', 0],
      ['Item 4', 1],
    ])
    expect(questionOf(draft).payload).toEqual(payload)
    expect(answerLine(payload)).toBe('God 1: Item 1, Item 3; God 2: Item 2, Item 4; God 3: none')
  })

  it('hold a sort to three or four bins and four to six entries', () => {
    expect(paths(sorting(1, 4))).toContain('payload.options')
    expect(paths(sorting(2, 4))).toContain('payload.options')
    expect(paths(sorting(5, 4))).toContain('payload.options')
    expect(paths(sorting(3, 3))).toContain('payload.fields')
    expect(paths(sorting(3, 7))).toContain('payload.fields')
    expect(paths(sorting(3, 4))).toEqual([])
    expect(paths(sorting(4, 6))).toEqual([])
  })

  it('refuse a repeated option on fields only without bins', () => {
    const plain = questionOf(written(3, 1))
    plain.payload.answer = [0, 0, 1]
    expect(problems(plain).map((problem) => problem.message)).toContain(
      'Uses an answer on two fields.',
    )
  })

  it('import nothing from a file whose matching question the server would refuse', () => {
    const bad = questionOf(written(3, 0))
    bad.payload.answer = [0, 0, 1]
    const result = importText(JSON.stringify([bad]))
    expect(result.ok).toBe(false)
  })
})
