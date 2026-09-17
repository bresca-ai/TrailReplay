import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
])
