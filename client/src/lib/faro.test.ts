/** Faro reporting: off without a receiver, and nothing naming a room or player in a report. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ initializeFaro: vi.fn(), imported: vi.fn() }))

vi.mock('@grafana/faro-web-sdk', () => {
  sdk.imported()
  class Named {
    name: string
    constructor(name: string) {
      this.name = name
    }
  }
  return {
    initializeFaro: sdk.initializeFaro,
    ErrorsInstrumentation: class extends Named {
      constructor() {
        super('errors')
      }
    },
    WebVitalsInstrumentation: class extends Named {
      constructor() {
        super('web-vitals')
      }
    },
    SessionInstrumentation: class extends Named {
      constructor() {
        super('session')
      }
    },
  }
})

import { faroUrl, knownSecrets, scrub, scrubText, startFaro } from './faro'
import { rememberCreated, setSession } from './session'

const SESSION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const ADMIN = 'f'.repeat(40)

function page(content: string | null): Document {
  const doc = document.implementation.createHTMLDocument()
  if (content !== null) doc.head.innerHTML = `<meta name="faro-url" content="${content}">`
  return doc
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.clearAllMocks())

describe('faroUrl', () => {
  it('reads what the server wrote into the slot', () => {
    expect(faroUrl(page('/faro/collect'))).toBe('/faro/collect')
    expect(faroUrl(page('https://faro.example/collect'))).toBe('https://faro.example/collect')
  })

  it('is off when unset, unfilled or missing', () => {
    expect(faroUrl(page(''))).toBeNull()
    expect(faroUrl(page('__FARO_URL__'))).toBeNull()
    expect(faroUrl(page(null))).toBeNull()
  })
})

describe('startFaro', () => {
  it('never loads the SDK without a receiver', async () => {
    await startFaro(null)
    expect(sdk.imported).not.toHaveBeenCalled()
    expect(sdk.initializeFaro).not.toHaveBeenCalled()
  })

  it('captures errors, Web Vitals and a tab-long session, and nothing else', async () => {
    await startFaro('/faro/collect')
    expect(sdk.initializeFaro).toHaveBeenCalledOnce()
    const config = sdk.initializeFaro.mock.calls[0]![0]
    expect(config.url).toBe('/faro/collect')
    expect(config.app).toEqual({ name: 'jolly-boar-inn', version: __APP_VERSION__ })
    expect(config.instrumentations.map((i: { name: string }) => i.name)).toEqual([
      'errors',
      'web-vitals',
      'session',
    ])
    expect(config.sessionTracking).toEqual({ enabled: true, persistent: false })
    expect(config.trackGeolocation).toBe(false)
  })

  it('scrubs every report before it is sent', async () => {
    setSession('ABYSSAL', SESSION)
    await startFaro('/faro/collect')
    const { beforeSend } = sdk.initializeFaro.mock.calls[0]![0]
    const sent = beforeSend({
      type: 'exception',
      payload: { type: 'Error', value: `ABYSSAL rejected ${SESSION}` },
      meta: { page: { url: 'https://quiz.example/r/ABYSSAL' } },
    })
    expect(JSON.stringify(sent)).not.toMatch(/ABYSSAL|a1b2c3d4/)
  })
})

describe('knownSecrets', () => {
  it('holds the codes and tokens this browser stores, and the code in the address', () => {
    setSession('ABYSSAL', SESSION)
    rememberCreated('CABBAGE', new Date(Date.now() + 3_600_000).toISOString())
    localStorage.setItem('jbi:admin', ADMIN)
    const secrets = knownSecrets('/history/Dragon-Dagger/2610281200')
    expect(secrets.codes.sort()).toEqual(['ABYSSAL', 'CABBAGE', 'DRAGONDAGGER'])
    expect(secrets.tokens.sort()).toEqual([SESSION, ADMIN].sort())
  })
})

describe('scrubText', () => {
  const secrets = { codes: ['ABYSSAL'], tokens: [SESSION] }

  it('turns room and history paths into their routes', () => {
    expect(scrubText('https://quiz.example/r/WHATEVER', secrets)).toBe(
      'https://quiz.example/r/:code',
    )
    expect(scrubText('/history/WHATEVER/2610281200', secrets)).toBe('/history/:code/:stamp')
  })

  it('drops queries and fragments, admin token included', () => {
    expect(scrubText('https://quiz.example/admin#token=secret', secrets)).toBe(
      'https://quiz.example/admin',
    )
    expect(scrubText('failed at /api/x?code=1 again', secrets)).toBe('failed at /api/x again')
  })

  it('removes known codes and tokens anywhere in a message', () => {
    expect(scrubText(`Room abyssal: bad session ${SESSION}`, secrets)).toBe(
      'Room :code: bad session [token]',
    )
  })

  it('leaves ordinary text and asset addresses alone', () => {
    const text = 'Is it? Cannot read x at https://quiz.example/assets/index-abc.js:1:20'
    expect(scrubText(text, secrets)).toBe(text)
  })
})

describe('scrub', () => {
  it('reaches every string in a report and keeps the rest', () => {
    const report = {
      meta: { page: { url: '/r/ABYSSAL' } },
      values: { lcp: 1200 },
      tags: ['ABYSSAL'],
    }
    expect(scrub(report, { codes: ['ABYSSAL'], tokens: [] })).toEqual({
      meta: { page: { url: '/r/:code' } },
      values: { lcp: 1200 },
      tags: [':code'],
    })
  })
})
