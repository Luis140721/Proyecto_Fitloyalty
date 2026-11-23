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
  // rojo en su equipo. Nunca baja (regla de trinquete del bootcamp).
  //  - #106, sobre chore/semana-01-con-develop-2 (17f3e0f): lineas 90,
  //    sentencias 89, ramas 83 y funciones 89.
  //  - Tercera sincronizacion con develop (#100 y #104: campanas, retos y QR
  //    dinamico, con los tests de campanas-rutas y retos-rutas): en Linux con
  //    Node 24, lineas 91,66, sentencias 90,88, ramas 84,83 y funciones 89,83;
  //    en Windows, lineas 91,34, sentencias 90,62, ramas 84,68 y funciones
  //    89,83. Las dos redondean igual.
  coverageThreshold: {
    global: { statements: 90, branches: 84, functions: 89, lines: 91 },
  },
  // Evita que Jest intente transformar código nativo (bcrypt, pg) sin
  // necesidad. Cuando agreguemos tests sobre rutas reales, podemos cambiar
  // a un setup más completo.
  transform: {},
  verbose: true,
};