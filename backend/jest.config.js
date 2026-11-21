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
  // Cierre de S5 a S8 (2026-11-21): en cada metrica, el mayor entre el piso de
  // la S8 (80%) y la cobertura real, redondeada hacia abajo. Como en el cierre de
  // S2 a S4 (#77), se toma la menor entre el CI y Windows, para que nadie vea
  // rojo en su equipo. Medida sobre la rama de la semana con el #96 y develop
  // (chore/semana-01-con-develop-2, 17f3e0f): en Linux con Node 24, lineas
  // 90,73, sentencias 89,94, ramas 83,94 y funciones 89,28; en Windows, lineas
  // 90,32, sentencias 89,61, ramas 83,76 y funciones 89,28. Las dos redondean
  // igual. Nunca baja (regla de trinquete del bootcamp).
  coverageThreshold: {
    global: { statements: 89, branches: 83, functions: 89, lines: 90 },
  },
  // Evita que Jest intente transformar código nativo (bcrypt, pg) sin
  // necesidad. Cuando agreguemos tests sobre rutas reales, podemos cambiar
  // a un setup más completo.
  transform: {},
  verbose: true,
};