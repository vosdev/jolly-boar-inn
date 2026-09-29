/**
 * The NPC art on the stage, found by name at build time (D14, section 8 of ideas/design.md).
 *
 * An NPC is up to two wiki files in `assets/npcs/`: `<id>_chathead.<ext>`, its chathead,
 * and `<id>.<ext>`, the full-body render. The stage shows the chathead: the render's upper
 * body looked worse at this size. Without a chathead it shows the top of the render, and
 * without either the committed innkeeper drawing. Renders are game assets and not
 * committed, so a file may be missing: dropping one in replaces it on the next build with
 * no code change.
 *
 * Chatheads face right, toward the scroll. The wiki's renders face left, so a render is
 * drawn mirrored. An `.svg` is an original drawing, already facing the right way and
 * already cropped, so it is drawn as it is.
 */

// An empty folder is an empty object, so an NPC with no file is known
// to have none before the page asks, and nothing ever 404s.
const npcFiles = import.meta.glob<string>('../assets/npcs/*.{avif,webp,png,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Who stands in for an NPC with no art at all: the one drawing that is committed. */
export const FALLBACK_NPC = 'innkeeper'

/** How a picture is drawn: a chathead or drawing as it is, a render cropped and mirrored. */
export type NpcCut = 'chathead' | 'render' | 'drawing'

export interface NpcPicture {
  url: string
  cut: NpcCut
}

/** The file whose name without its extension is `name`, and that extension. */
function fileNamed(files: Record<string, string>, name: string): { url: string; ext: string } | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.slice(path.lastIndexOf('/') + 1)
    const dot = base.lastIndexOf('.')
    if (base.slice(0, dot) === name) return { url, ext: base.slice(dot + 1) }
  }
  return null
}

/** The picture for NPC `id`: its chathead, else its render, else the innkeeper. */
export function npcArt(id: string, files: Record<string, string> = npcFiles): NpcPicture {
  const head = fileNamed(files, `${id}_chathead`)
  if (head !== null) return { url: head.url, cut: head.ext === 'svg' ? 'drawing' : 'chathead' }
  const body = fileNamed(files, id)
  if (body !== null) return { url: body.url, cut: body.ext === 'svg' ? 'drawing' : 'render' }
  if (id !== FALLBACK_NPC) return npcArt(FALLBACK_NPC, files)
  // The innkeeper is committed, so this is never the empty string in a real build.
  return { url: '', cut: 'drawing' }
}
