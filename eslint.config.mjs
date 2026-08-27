import { defineConfig, globalIgnores } from 'eslint/config'
import espree from 'espree'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,

  // ESLint 10 requires the parser's ScopeManager to implement addGlobals().
  // eslint-config-next 16.3.3 still uses Next's compiled Babel parser for
  // JavaScript/JSX, which does not expose that API. Use Espree for JS/JSX;
  // TypeScript files keep the typescript-eslint parser from nextVitals.
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
