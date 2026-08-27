import { defineConfig, globalIgnores } from 'eslint/config'
import * as espree from 'espree'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,

  // Use Espree for JavaScript/JSX files.
  // ESLint 10 requires a ScopeManager with addGlobals(), which the
  // compiled Babel parser bundled by eslint-config-next 16.3.3 does not provide.
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: espree,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])
