/**
 * Question pictures, which `scripts/build_pictures.py` copies into `public/pictures/` under
 * random names. An open question's `picture` is that file's name, never the asset id, which
 * for some modes is the answer. They stay out of the bundle because it merges identical
 * files, and would serve a picture under the name of an item icon with the same bytes.
 *
 * The server names only a picture the built client has, so a name always has a file.
 */

/** Where the picture named `name` is served, or null for a question without one. */
export function pictureUrl(name: string | null | undefined): string | null {
  return name ? `/pictures/${name}` : null
}
