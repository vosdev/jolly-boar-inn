import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'

import svelteConfig from './svelte.config.js'

export default ts.config(
  { ignores: ['dist', 'public', 'prototypes'] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // A leading underscore marks a binding kept for its position: `{#each xs as _, i}`, a
      // mock's parameter, or a key dropped from a rest spread.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
    rules: {
      // Writing a `$bindable()` prop hands the value to the parent, which ESLint cannot see.
      'no-useless-assignment': 'off',
      // `{' '}` pins a space between inline elements that markup formatting would otherwise
      // move or drop.
      'svelte/no-useless-mustaches': 'off',
      // Our Maps are scratch built and returned inside one function, never state, so a
      // SvelteMap would track reads that nothing subscribes to.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
)
