import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Con globals: false, Testing Library no desmonta solo: se limpia el DOM tras cada test.
afterEach(() => cleanup());
