/**
 * ESLint del backend (T6, ítem 14: linter sin errores críticos).
 *
 * Base: las reglas recomendadas de ESLint (`@eslint/js`), que marcan errores
 * reales: variables sin declarar, código inalcanzable, claves duplicadas,
 * comparaciones con NaN, etc. Se corre con `pnpm lint` y en el CI.
 *
 * - Error: lo que casi siempre es un fallo y debe corregirse antes de fusionar.
 * - Aviso: código muerto (variables sin usar). No rompe nada, pero se limpia
 *   cuando se toca el archivo.
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/', 'coverage/', '.wwebjs_auth/', '.wwebjs_cache/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Los parámetros y errores que empiezan con _ se ignoran a propósito
      // (por ejemplo, el `next` de los middlewares de error de Express).
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Un catch vacío es a propósito en este código: un ROLLBACK de mejor
      // esfuerzo que, si falla, no cambia nada. Otros bloques vacíos sí son error.
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['tests/**/*.js', 'jest.config.js', 'jest.setup*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
