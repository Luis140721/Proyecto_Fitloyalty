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
      // Semana 1: linea base medida el 2026-10-26 sobre develop @ 7e3ede9 (docs/cobertura-baseline-frontend.txt). No puede bajar.
      thresholds: { lines: 1, branches: 9, functions: 6, statements: 1 },
    },
  },
})
