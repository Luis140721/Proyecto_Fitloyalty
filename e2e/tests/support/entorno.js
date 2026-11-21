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

// BD de pruebas desechable (servicio db-test de e2e/docker-compose.yml). Las
// credenciales son de prueba, no secretos. Se puede cambiar con E2E_DATABASE_URL.
// 127.0.0.1 y no localhost: el contenedor solo escucha en IPv4 y en Windows Node
// puede resolver localhost a ::1. La guardia (guardia-bd.cjs) la revisa antes de usarla.
export const BD_PRUEBAS_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test';
