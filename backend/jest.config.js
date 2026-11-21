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
  // Cierre de S2 a S4 (2026-11-19): el mayor entre el piso de la S4 (50%) y la
  // cobertura real, redondeada hacia abajo. Se toma la menor entre el CI (run
  // 44653040667) y Windows, que da unas decimas menos, para que nadie vea rojo
  // en su equipo. Nunca baja (regla de trinquete del bootcamp).
  coverageThreshold: {
    global: { statements: 60, branches: 54, functions: 66, lines: 61 },
  },
  // Evita que Jest intente transformar código nativo (bcrypt, pg) sin
  // necesidad. Cuando agreguemos tests sobre rutas reales, podemos cambiar
  // a un setup más completo.
  transform: {},
  verbose: true,
};