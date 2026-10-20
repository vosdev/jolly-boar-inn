/** @type {import('prettier').Config} */
export default {
  plugins: ['prettier-plugin-svelte'],
  semi: false,
  singleQuote: true,
  // ruff's line length, so both halves of the repo wrap at the same column.
  printWidth: 100,
}
