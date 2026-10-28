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
      // Arranque: solo monta React en el DOM, no tiene logica de negocio.
      exclude: ['src/main.jsx'],
      // Semana 1: linea base medida el 2026-10-26 sobre develop @ 7e3ede9 (docs/cobertura-baseline-frontend.txt). No puede bajar.
      thresholds: { lines: 99, branches: 99, functions: 99, statements: 99 },
    },
  },
})
