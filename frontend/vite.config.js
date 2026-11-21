import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      // Los de vitest por defecto mas json-summary: el job frontend del CI lee
      // coverage/coverage-summary.json para dejar el resumen en la pagina del run.
      reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        // Arranque: solo monta React en el DOM, no tiene logica de negocio.
        'src/main.jsx',
        // Textos legales: solo pasan titulo y parrafos fijos a LegalLayout. Sin
        // estado, efectos, handlers, formularios, API ni condicionales.
        // LegalLayout si se mide.
        'src/pages/TerminosPage.jsx',
        'src/pages/PrivacidadPage.jsx',
        'src/pages/PoliticaDatosPage.jsx',
        // No se excluyen NotFoundPage (elige el panel segun el rol y "Volver
        // atras" cae al inicio si no hay historial) ni LandingPage (sus botones
        // llevan al registro del gimnasio).
      ],
      // Cierre de S5 a S8 (2026-11-21): en cada metrica, el mayor entre el piso de la S8 (80%)
      // y la cobertura real del CI (Linux, LF, TZ=UTC), redondeada hacia abajo. No puede bajar.
      //  - #106 (17f3e0f, con develop): lineas 84, sentencias 84, ramas 91 y funciones 93.
      //  - Tercera sincronizacion con develop (#100 y #104, con los tests de CampanasPage y
      //    RetosPage) y los #82, #84 y #85: lineas 85,73, sentencias 85,73, ramas 92,59 y
      //    funciones 93,51.
      thresholds: { lines: 85, branches: 92, functions: 93, statements: 85 },
    },
  },
})
