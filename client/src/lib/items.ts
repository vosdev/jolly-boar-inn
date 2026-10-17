/**
 * Item icons, the wiki's inventory icons for the roster's items, found by name at build time
 * as `npcs.ts` finds the NPCs: `assets/items/<id>.<ext>` for `item:<id>`.
 *
 * They are game assets and not committed, so one may be missing, and its item then shows its
 * name alone. A question's picture is never one of these files (`lib/pictures.ts`): its bytes
 * would match the icon bundled under its item id, which for some modes is the answer.
 */

// An empty folder is an empty object, so an item with no file is known to have none before
// the page asks, and nothing ever 404s.
const itemFiles = import.meta.glob<string>('../assets/items/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const ITEM = /^item:([0-9]{1,7})$/

/** The icon's URL for `asset`, an `item:<id>`, or null for anything else or a missing file. */
export function itemIcon(asset: unknown, files: Record<string, string> = itemFiles): string | null {
  const id = typeof asset === 'string' ? ITEM.exec(asset)?.[1] : undefined
  if (id === undefined) return null
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (base.slice(0, base.lastIndexOf('.')) === id) return url
  }
  return null
}
