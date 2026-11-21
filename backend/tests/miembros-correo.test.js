/**
 * El correo que rechaza el servidor se explica en espanol (semana 7).
 *
 * El formulario del alta (MiembrosPage.jsx, EMAIL_RE) deja pasar correos que
 * zod rechaza, como "ana..perez@correo.co". El API respondia el mensaje por
 * defecto de zod, "Invalid email", y la pantalla lo mostraba tal cual. Ahora
 * parse() de routes/miembros.js lo cambia por el texto del formulario. El E2E
 * (alta-miembro.spec.js) lo ve en la pantalla; aqui se prueba en el alta y en la
 * edicion, con un pool falso, y que los mensajes propios de los esquemas no cambian.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../src/db/db', () => ({ query: (...args) => mockQuery(...args) }));
// Los envios no son parte de esta regla: dummies que no hacen nada.
jest.mock('../src/lib/email', () => ({ sendMemberQR: jest.fn() }));
jest.mock('../src/lib/whatsapp', () => ({ sendWhatsAppQR: jest.fn() }));

process.env.JWT_SECRET = 'secreto-de-pruebas';

const miembrosRouter = require('../src/routes/miembros');
const { errorHandler } = require('../src/middleware/errorHandler');
const { establecerBusquedaPersonal } = require('../src/middleware/auth');

const CORREO_INVALIDO = 'Este correo no tiene un formato válido.';
const token = jwt.sign({ id: 1, role: 'admin', gymId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });

let server;
let base;

beforeAll((done) => {
  establecerBusquedaPersonal(() => ({ activo: true, id_gimnasio: 7, rol_nombre: 'ADMINISTRADOR' }));
  const app = express();
  app.use(express.json());
  app.use('/api', miembrosRouter);
  app.use(errorHandler);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll(() => new Promise((resolve) => {
  establecerBusquedaPersonal(null);
  if (server.closeAllConnections) server.closeAllConnections();
  server.close(() => resolve());
}));

/** Pool falso (fake): solo el gimnasio activo; la validacion corta antes de lo demas. */
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql) => {
    if (/FROM gimnasio WHERE id_gimnasio/i.test(sql) && /trial_ends_at/i.test(sql)) {
      return { rows: [{ id_gimnasio: 7, activo: true, trial_ends_at: null }] };
    }
    return { rows: [] };
  });
});

const tocoMiembro = () => mockQuery.mock.calls.some(([sql]) => /(INSERT INTO|UPDATE) miembro/i.test(sql));

function enviar(metodo, ruta, body) {
  return fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const miembroValido = (campos = {}) => ({ nombre: 'Ana Ruiz', documento: '10203040', telefono: '3001234567', ...campos });

describe('POST y PUT /api/admin/miembros: el correo invalido', () => {
  it('should explain in Spanish that the email is not valid when creating a member', async () => {
    // Arrange
    const body = miembroValido({ email: 'ana..perez@correo.co' });

    // Act
    const res = await enviar('POST', '/admin/miembros', body);

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: CORREO_INVALIDO, code: 'VALIDATION_ERROR' });
    expect(tocoMiembro()).toBe(false);
  });

  it('should explain in Spanish that the email is not valid when editing a member', async () => {
    // Act
    const res = await enviar('PUT', '/admin/miembros/4', { email: 'ana..perez@correo.co' });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: CORREO_INVALIDO, code: 'VALIDATION_ERROR' });
    expect(tocoMiembro()).toBe(false);
  });

  it('should keep the message of the schema when another field is not valid', async () => {
    // Act: el nombre corto tiene su propio mensaje en createSchema
    const res = await enviar('POST', '/admin/miembros', miembroValido({ nombre: 'A' }));

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'El nombre es requerido', code: 'VALIDATION_ERROR' });
  });
});
