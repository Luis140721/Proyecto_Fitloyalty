import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Puerto fijo: los mocks de login.spec.js interceptan http://localhost:3001/api/**.
export const API_URL = 'http://localhost:3001/api';

// storageState del dueno que guarda tests/auth.setup.js. Queda en
// e2e/playwright/.auth/, que esta en .gitignore: el token lo firma el JWT_SECRET
// de prueba de la config, pero igual es una sesion y no se sube.
export const SESION = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'playwright', '.auth', 'user.json');

// Clave del token en localStorage (frontend/src/api.js, TOKEN_KEY).
export const CLAVE_TOKEN = 'fitloyalty_token';
