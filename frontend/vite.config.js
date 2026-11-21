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
      // Cierre de S5 a S8 (2026-11-20): en cada metrica, el mayor entre el piso de la S8 (80%)
      // y la cobertura real del CI (Linux, LF, TZ=UTC), redondeada hacia abajo: lineas 84,36,
      // sentencias 84,36, ramas 92,67 y funciones 95,16. No puede bajar.
      thresholds: { lines: 84, branches: 92, functions: 95, statements: 84 },
    },
  },
})
