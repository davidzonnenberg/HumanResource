// ESLint flat config. The Simulation restrictions enforce Requirement 2.4/2.6 (see
// .kiro/steering/architecture.md). Do not disable these rules; fix the code instead.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const simRestrictedImports = {
  patterns: [
    { group: ['react', 'react-*', 'three', 'three/*', '@react-three/*', '@dimforge/*', 'idb', 'zustand', 'node:*', 'fs', 'path', 'os'], message: 'packages/sim must stay pure: no rendering, DOM, physics, storage or Node imports.' },
    { group: ['@hr/web', '@hr/server', '@hr/shared'], message: 'packages/sim must not depend on apps or shared.' },
  ],
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dev-dist/**', '**/coverage/**', '**/*.tsbuildinfo', 'scripts/**/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', simRestrictedImports],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'fetch', 'performance', 'setTimeout', 'setInterval', 'localStorage', 'indexedDB', 'structuredClone'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in state.rng.' },
        { object: 'Date', property: 'now', message: 'The Simulation has no wall clock; use state.tick.' },
        ...['pow', 'exp', 'log', 'sin', 'cos', 'tan', 'atan2', 'hypot', 'cbrt', 'log2', 'log10'].map((property) => ({
          object: 'Math',
          property,
          message: 'Transcendental math breaks cross-engine determinism; use + - * / and Math.sqrt.',
        })),
      ],
      'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date']", message: 'No wall clock in the Simulation.' }],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@hr/sim', '@hr/web', '@hr/content'], message: 'The server only depends on @hr/shared.' }] }],
    },
  },
  {
    // English-only, no user-facing literals in JSX (criterion 46.8): use t('key').
    files: ['apps/web/src/ui/**/*.tsx', 'apps/web/src/render/**/*.tsx', 'apps/web/src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', { selector: 'JSXText[value=/[A-Za-z]/]', message: 'User-facing text must come from t() and en.json.' }],
    },
  },
);
