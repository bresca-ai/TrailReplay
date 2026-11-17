import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const STORY_EDITOR_FREE = {
  // `**/` so relative paths are caught as well as `@/` aliases.
  group: [
    '**/store',
    '**/store/**',
    '**/hooks/**',
    '**/useI18n',
    '**/mapRef',
    '**/probeBridge',
    '**/TrailMap',
    '**/playback/**',
    '**/sidebar/**',
    // `*` also matches the view directory itself, so the negation keeps view/.
    '**/components/story/*',
    '!**/components/story/view',
  ],
  message: 'Story model and reader code must not depend on the editor store, hooks, i18n hook, story editor or video map: the phase-2 viewer reuses it standalone.',
}

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // These existing effects intentionally synchronize UI drafts with external
  // viewport/store state or kick off an asynchronous preview. Keep the newer
  // React Hooks rule enabled everywhere else while they are migrated.
  {
    files: [
      'src/components/feedback/FeedbackSolicitation.tsx',
      'src/components/sidebar/AnnotationsPanel.tsx',
      'src/components/sidebar/CinematicCameraEditor.tsx',
      'src/components/sidebar/TracksPanel.tsx',
      'src/components/sidebar/export/useSocialShareExport.ts',
      'src/hooks/use-mobile.ts',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
  // The keyboard listener deliberately follows the latest capture callback.
  {
    files: ['src/components/sidebar/CinematicCameraEditor.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  {
    files: ['src/utils/story/**/*.{ts,tsx}', 'src/components/story/view/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [STORY_EDITOR_FREE] }] },
  },
  // A later block replaces the rule's options instead of merging them, so the reader repeats the boundary above.
  {
    files: ['src/components/story/view/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [STORY_EDITOR_FREE, {
          group: ['../**'],
          message: 'The reader imports outside view/ by alias only, so a relative path cannot climb into the story editor beside it: the phase-2 viewer reuses view/ alone.',
        }],
      }],
    },
  },
])
