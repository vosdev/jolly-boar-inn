/**
 * The NPC art on the stage, found by name at build time (D14, section 8 of ideas/design.md).
 *
 * An NPC is two wiki files in `assets/npcs/`: `<id>.<ext>`, the full-body render, and
 * `<id>_chathead.<ext>`, its chathead. The stage shows the render's top half, head and
 * upper body, and a phone shows the chathead. Renders are game assets and not committed,
 * so either may be missing: an NPC with one file shows it at both sizes, and an NPC with
 * neither is the committed innkeeper drawing. Dropping a file in replaces it on the next
 * build with no code change.
 *
 * The wiki's renders face left and its chatheads right. The host stands left of the
 * scroll, so a render is drawn mirrored to face the sheet. An `.svg` is an original
 * drawing, already facing the right way and already cropped, so it is drawn as it is.
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

/** How a picture is drawn: a render cropped and mirrored, or anything else as it is. */
export type NpcCut = 'render' | 'chathead' | 'drawing'

export interface NpcPicture {
  url: string
  cut: NpcCut
}

export interface NpcArt {
  /** Head and upper body, for the stage at full size. */
  body: NpcPicture
  /** The head, for the stage on a phone. */
  head: NpcPicture
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

function pictureOf(files: Record<string, string>, id: string): NpcPicture | null {
  const file = fileNamed(files, id)
  if (file === null) return null
  return { url: file.url, cut: file.ext === 'svg' ? 'drawing' : 'render' }
}

function chatheadOf(files: Record<string, string>, id: string): NpcPicture | null {
  const file = fileNamed(files, `${id}_chathead`)
  return file === null ? null : { url: file.url, cut: 'chathead' }
}

/** The pictures for NPC `id`, falling back to whichever of its files exists, then the innkeeper. */
export function npcArt(id: string, files: Record<string, string> = npcFiles): NpcArt {
  const body = pictureOf(files, id)
  const head = chatheadOf(files, id)
  if (body !== null || head !== null) return { body: body ?? head!, head: head ?? body! }
  if (id !== FALLBACK_NPC) return npcArt(FALLBACK_NPC, files)
  // The innkeeper is committed, so this is never the empty string in a real build.
  const none: NpcPicture = { url: '', cut: 'drawing' }
  return { body: none, head: none }
}
