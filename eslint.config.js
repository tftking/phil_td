import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/server/data/**'] },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        localStorage: 'readonly',
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The simulation must stay deterministic: all randomness goes through the
    // seeded RNG and all time is measured in ticks.
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['packages/sim/src/cli/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from core/rng.' },
        { object: 'Date', property: 'now', message: 'Sim time is ticks, not wall clock.' },
        { object: 'performance', property: 'now', message: 'Sim time is ticks.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Sim time is ticks, not wall clock.' },
        { name: 'setTimeout', message: 'The sim is synchronous.' },
        { name: 'setInterval', message: 'The sim is synchronous.' },
      ],
    },
  },
);
