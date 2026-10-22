/**
 * `schema/question.schema.json`, read in the browser: the limits a question is held to, and
 * a check of a payload against them that says what is wrong in words a host can act on.
 *
 * The schema is imported rather than retyped, so a limit moved there moves here in the
 * same build. Only the keywords that file uses are understood. A general validator would
 * compile the schema to code at runtime, which the page's `script-src 'self'` forbids.
 *
 * Lengths are counted in code points, as the server's `len()` counts them.
 */

import SCHEMA from '../../../schema/question.schema.json'

export type Schema = { [keyword: string]: unknown }

/** What is wrong, and where. `missing` is a field still to be filled; `limit` is one over a line. */
export interface Problem {
  /** `payload.options[2]`: the place in the question, as the form names its fields. */
  path: string
  message: string
  kind: 'missing' | 'limit'
}

const DEFS = SCHEMA.$defs as unknown as Record<string, Schema>

/** A named definition from the schema's `$defs`. */
export function definition(name: string): Schema {
  const found = DEFS[name]
  if (found === undefined) throw new Error(`schema has no $defs/${name}`)
  return found
}

/** The envelope's own property schema, such as `random_event`'s. */
export function envelopeProperty(name: string): Schema {
  return (SCHEMA.properties as unknown as Record<string, Schema>)[name] ?? {}
}

/** `#/$defs/x` resolved, merged under the keywords written beside it. */
function resolved(schema: Schema): Schema {
  const ref = schema.$ref
  if (typeof ref !== 'string') return schema
  const { $ref: _, ...beside } = schema
  return { ...resolved(definition(ref.replace('#/$defs/', ''))), ...beside }
}

/** A numeric keyword of `schema` after `$ref`, such as a payload field's `maxLength`. */
export function limit(schema: Schema, keyword: string): number | undefined {
  const value = resolved(schema)[keyword]
  return typeof value === 'number' ? value : undefined
}

/** The schema of `field` in `type`'s payload, `$ref` followed. */
export function field(type: string, name: string): Schema {
  const properties = definition(type).properties as Record<string, Schema>
  return resolved(properties[name] ?? {})
}

/** The fields `type`'s payload may have, in the schema's order. */
export function fields(type: string): string[] {
  return Object.keys(definition(type).properties as object)
}

export function codePoints(text: string): number {
  return [...text].length
}

const NOUNS: Record<string, string> = { options: 'answers', accepted: 'accepted answers' }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typeProblem(type: unknown, value: unknown): string | null {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? null : 'Must be text.'
    case 'integer':
      return Number.isInteger(value) ? null : 'Must be a whole number.'
    case 'number':
      if (typeof value === 'number' && Number.isFinite(value)) return null
      return 'Must be a number, like 1500 or 2.5.'
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Must be true or false.'
    case 'object':
      return isObject(value) ? null : 'Must be a JSON object.'
    case 'array':
      return Array.isArray(value) ? null : 'Must be a list.'
    default:
      return null
  }
}

/** Every way `value` breaks `schema`, with `path` the place it sits. */
export function check(schema: Schema, value: unknown, path: string): Problem[] {
  const rule = resolved(schema)
  const found: Problem[] = []
  const add = (message: string, kind: Problem['kind'] = 'limit', at = path): void => {
    found.push({ path: at, message, kind })
  }

  const wrongType = typeProblem(rule.type, value)
  if (wrongType !== null) {
    add(wrongType)
    return found
  }
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
    add(`Must be one of ${rule.enum.map((option) => JSON.stringify(option)).join(', ')}.`)
  }

  if (typeof value === 'string') {
    const length = codePoints(value)
    const min = rule.minLength
    const max = rule.maxLength
    if (typeof min === 'number' && length < min) {
      add(min === 1 ? 'Can’t be empty.' : `At least ${min} characters.`, 'missing')
    }
    if (typeof max === 'number' && length > max) {
      add(`At most ${max} characters; this has ${length}.`)
    }
    if (typeof rule.pattern === 'string' && !new RegExp(rule.pattern, 'u').test(value)) {
      add('Not in the form this field takes.')
    }
  }

  if (typeof value === 'number') {
    if (typeof rule.minimum === 'number' && value < rule.minimum) add(`At least ${rule.minimum}.`)
    if (typeof rule.exclusiveMinimum === 'number' && value <= rule.exclusiveMinimum) {
      add(`More than ${rule.exclusiveMinimum}.`)
    }
    if (typeof rule.maximum === 'number' && value > rule.maximum) add(`At most ${rule.maximum}.`)
  }

  if (Array.isArray(value)) {
    const noun = NOUNS[path.split('.').pop() ?? ''] ?? 'entries'
    if (typeof rule.minItems === 'number' && value.length < rule.minItems) {
      add(`At least ${rule.minItems} ${noun}.`, 'missing')
    }
    if (typeof rule.maxItems === 'number' && value.length > rule.maxItems) {
      add(`At most ${rule.maxItems} ${noun}.`)
    }
    if (isObject(rule.items)) {
      const items = rule.items as Schema
      value.forEach((item, index) => found.push(...check(items, item, `${path}[${index}]`)))
    }
  }

  if (isObject(value)) {
    const properties = (rule.properties ?? {}) as Record<string, Schema>
    for (const key of (rule.required ?? []) as string[]) {
      if (!(key in value)) add('Required.', 'missing', `${path}.${key}`)
    }
    for (const [key, item] of Object.entries(value)) {
      const known = properties[key]
      if (known !== undefined) found.push(...check(known, item, `${path}.${key}`))
      else if (rule.additionalProperties === false) {
        add(`“${key}” is not a field of this question.`, 'limit', `${path}.${key}`)
      }
    }
  }
  return found
}
