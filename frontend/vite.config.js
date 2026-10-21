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
      // Semana 1: linea base (docs/cobertura-baseline-frontend.txt). No puede bajar.
      thresholds: { lines: 1, branches: 10, functions: 6, statements: 1 },
    },
  },
})
