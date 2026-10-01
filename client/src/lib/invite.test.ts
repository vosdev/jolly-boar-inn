import { describe, expect, it } from 'vitest'

import { inviteLink, keyFromHash, keyFromInput, maskedLink } from './invite'

describe('invite links', () => {
  it('put the key after #, where no request carries it', () => {
    const link = new URL(inviteLink('https://inn.example', 'ABYSSAL', 'abc_DEF-123'))
    expect(link.pathname).toBe('/r/ABYSSAL')
    expect(link.search).toBe('')
    expect(link.hash).toBe('#k=abc_DEF-123')
  })

  it('are the plain room link for a room without a key', () => {
    expect(inviteLink('https://inn.example', 'ABYSSAL')).toBe('https://inn.example/r/ABYSSAL')
    expect(maskedLink('https://inn.example', 'ABYSSAL')).toBe('https://inn.example/r/ABYSSAL')
  })

  it('show the key as asterisks', () => {
    expect(maskedLink('https://inn.example', 'ABYSSAL', 'abc123')).toBe(
      'https://inn.example/r/ABYSSAL#k=******',
    )
  })

  it.each([
    ['#k=abc', 'abc'],
    ['k=abc', 'abc'],
    ['#t=abc', null],
    ['#k=', null],
    ['#k=a%20b', null],
    ['', null],
  ])('read %j as %j', (hash, key) => {
    expect(keyFromHash(hash)).toBe(key)
  })

  it.each([
    ['https://inn.example/r/ABYSSAL#k=abc', 'abc'],
    ['  abc_DEF-123  ', 'abc_DEF-123'],
    ['https://inn.example/r/ABYSSAL', null],
    ['', null],
  ])('take %j pasted as %j', (text, key) => {
    expect(keyFromInput(text)).toBe(key)
  })
})
