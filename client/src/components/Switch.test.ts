/** The Ready and Full screen switches are a track and a label, with no pill drawn around them. */

import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import Switch from './Switch.svelte'
import source from './Switch.svelte?raw'

/** The body of one rule in the component's `<style>`. */
function rule(selector: string): string {
  const start = source.indexOf(`\n  ${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('}', start))
}

describe('Switch', () => {
  it('strips the button chrome so no circle surrounds the switch and its label', () => {
    render(Switch, { label: 'Ready', checked: false, onclick: () => {}, large: true, tone: 'ok' })
    const button = screen.getByRole('switch', { name: 'Ready' })
    expect(button.querySelector('.track')).not.toBeNull()
    const body = rule('.switch')
    expect(body).toContain('padding: 0;')
    expect(body).toContain('border: 0;')
    expect(body).toContain('background: transparent;')
  })
})
