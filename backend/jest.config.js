/**
 * Configuración de Jest para el backend de FitLoyalty.
 *
 * Notas:
 *  - `testEnvironment: node` porque todo el backend es código de servidor.
 *  - `testMatch` apunta exclusivamente a la carpeta `tests/` para no
 *    escanear `node_modules/`.
 *  - `clearMocks: true` aísla el estado entre tests sin necesidad de
 *    reinvocar `jest.clearAllMocks()` en cada `beforeEach`.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/lib/**/*.js',
    'src/middleware/**/*.js',
    'src/routes/**/*.js',
    'src/jobs/**/*.js',
  ],
  // Semana 1: linea base medida el 2026-10-20 (docs/cobertura-baseline-backend.txt).
  // Es el piso: nunca puede bajar (regla de trinquete del bootcamp). Todavia no
  // se exige el 30% de la semana 2; solo evita retroceder.
  coverageThreshold: {
    global: { statements: 17, branches: 16, functions: 21, lines: 18 },
  },
  // Evita que Jest intente transformar código nativo (bcrypt, pg) sin
  // necesidad. Cuando agreguemos tests sobre rutas reales, podemos cambiar
  // a un setup más completo.
  transform: {},
  verbose: true,
};