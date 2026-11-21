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
  // Guarda la DATABASE_URL del entorno del proceso antes de que un test cargue
  // dotenv: la de backend/.env no activa los tests de integracion.
  setupFiles: ['<rootDir>/tests/integracion/entorno-del-proceso.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/lib/**/*.js',
    'src/middleware/**/*.js',
    'src/routes/**/*.js',
    'src/jobs/**/*.js',
  ],
  // Cierre de S5 a S8 (2026-11-20): en cada metrica, el mayor entre el piso de
  // la S8 (80%) y la cobertura real del CI, redondeada hacia abajo. Medida sobre
  // chore/test-semana-01 con el #96, en Linux con Node 24: lineas 89,08,
  // sentencias 88,64, ramas 83,64 y funciones 87,73. En Windows da menos
  // (lineas 88,60, sentencias 88,25, ramas 83,41): alli `pnpm test` sale en rojo
  // por el umbral de lineas aunque los tests pasen; la cifra que cuenta es la del
  // CI. Nunca baja (regla de trinquete del bootcamp).
  coverageThreshold: {
    global: { statements: 88, branches: 83, functions: 87, lines: 89 },
  },
  // Evita que Jest intente transformar código nativo (bcrypt, pg) sin
  // necesidad. Cuando agreguemos tests sobre rutas reales, podemos cambiar
  // a un setup más completo.
  transform: {},
  verbose: true,
};