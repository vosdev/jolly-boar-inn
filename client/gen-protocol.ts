/**
 * `src/lib/protocol.gen.ts` from `schema/protocol.schema.json`, which the server writes from
 * its websocket models. `pnpm gen:protocol` rewrites the file; `--check` only fails while it
 * is stale, which `gen-protocol.test.ts` runs. `make gen-protocol` does both halves.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile, type JSONSchema } from 'json-schema-to-typescript'
import { format, resolveConfig } from 'prettier'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA = join(HERE, '..', 'schema', 'protocol.schema.json')
const OUTPUT = join(HERE, 'src', 'lib', 'protocol.gen.ts')

const BANNER = `/**
 * Generated from \`schema/protocol.schema.json\` by \`make gen-protocol\`. Do not edit:
 * change \`server/app/ws/protocol.py\` and regenerate. Import from \`protocol.ts\`.
 */`

/**
 * The schema as the generator reads it best. Docstrings quote code in reStructuredText's
 * double backticks, where JSDoc reads single ones. A `$ref` with a description beside it
 * would be dereferenced into a copy of its target, a second interface named `Segment1`.
 */
function prepare(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prepare)
  if (node === null || typeof node !== 'object') return node
  if ('$ref' in node && 'description' in node) {
    const { $ref, ...rest } = node
    return prepare({ ...rest, allOf: [{ $ref }] })
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === 'description' && typeof value === 'string'
        ? value.replaceAll('``', '`')
        : prepare(value),
    ]),
  )
}

/** The generated module's source, formatted as Prettier would leave it. */
async function generate(): Promise<string> {
  const schema = prepare(JSON.parse(readFileSync(SCHEMA, 'utf8'))) as JSONSchema
  const source = await compile(schema, 'Protocol', {
    bannerComment: BANNER,
    additionalProperties: false,
    // A `minItems: 1` list would be a tuple, which no array literal the client builds is.
    ignoreMinAndMaxItems: true,
    format: false,
  })
  const options = await resolveConfig(OUTPUT)
  return format(source, { ...options, filepath: OUTPUT })
}

if (import.meta.main) {
  const source = await generate()
  if (!process.argv.includes('--check')) {
    writeFileSync(OUTPUT, source)
    console.log(`wrote ${OUTPUT}`)
  } else if (readFileSync(OUTPUT, 'utf8') !== source) {
    console.error(`${OUTPUT} is stale: run \`make gen-protocol\` and commit the result`)
    process.exitCode = 1
  }
}
