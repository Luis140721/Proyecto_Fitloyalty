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
      // Semana 3: piso de cobertura del 40%.
      thresholds: { lines: 40, branches: 40, functions: 40, statements: 40 },
    },
  },
})
