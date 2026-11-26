/**
 * ESLint del frontend (T6, ítem 14: linter sin errores críticos).
 *
 * Base: las reglas recomendadas de ESLint, las de React y las de los hooks de
 * React (`rules-of-hooks` es error: un hook dentro de un if o un bucle rompe
 * el estado del componente). Se corre con `pnpm lint` y en el CI.
 *
 * - Error: lo que casi siempre es un fallo y debe corregirse antes de fusionar.
 * - Aviso: código muerto y dependencias de useEffect que conviene revisar.
 */
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // El proyecto no usa PropTypes (no hay TypeScript ni prop-types).
      'react/prop-types': 'off',
      // Textos en español con comillas y apóstrofes dentro del JSX.
      'react/no-unescaped-entities': 'off',
      // React 18 no conoce la prop fetchPriority (llega en React 19): en
      // minúscula pasa tal cual al <img> y el navegador la entiende.
      'react/no-unknown-property': ['error', { ignore: ['fetchpriority'] }],
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['tests/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}', 'vite.config.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
  },
];
