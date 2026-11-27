/**
 * T6, item 12: la especificacion OpenAPI (docs/api/openapi.json) dice las
 * mismas rutas que monta Express, ni una mas ni una menos.
 *
 * Se carga la app real de src/index.js (no abre puertos ni migra al
 * importarse) y se recorre su pila de rutas y middlewares, igual que se saco
 * la lista de docs/api/API.md. Si alguien agrega, quita o cambia de metodo una
 * ruta sin tocar la especificacion, aqui falla con la ruta que sobra o falta.
 *
 * Ademas compara el acceso: una ruta sin `authenticate` en el codigo tiene que
 * ser publica en la especificacion (`security: []`) y al reves; las de
 * `requireClient` piden el token del miembro y la de `requireAdminToken`, la
 * cabecera X-Admin-Token.
 *
 * En las rutas del personal compara tambien el rol (`x-roles` contra los
 * authorize() de la ruta) y la prueba gratis (`x-prueba-gratis` contra
 * requireActiveTrial). Asi falla si recepcion pasa a entrar a una ruta del
 * administrador o si una ruta deja de revisar la prueba gratis.
 *
 * Un router.use() de un router sigue corriendo para los routers que se montan
 * despues en el mismo prefijo: Express entra al router con cada peticion de su
 * prefijo y, si ninguna ruta suya coincide, sigue con los siguientes. Por eso
 * un router.use(authenticate) sin ruta en un router montado en /api cerraria
 * /api/healthz, y aqui se ve como una ruta publica que pide token.
 *
 * La especificacion es JSON y no YAML porque el backend no tiene un lector de
 * YAML entre sus dependencias (js-yaml solo llega como dependencia de eslint y
 * jest, y pnpm no lo deja cargar desde aqui).
 */
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

jest.mock('../src/db/db', () => ({ query: jest.fn() }));

const fs = require('fs');
const path = require('path');
const express = require('express');
const { app } = require('../src/index');
const { authorize } = require('../src/middleware/auth');
const { requireActiveTrial } = require('../src/lib/trial');

// authorize('admin') y requireActiveTrial(pool) devuelven funciones sin nombre;
// se reconocen por su codigo fuente, que es el mismo en cada llamada.
const FUENTE_AUTHORIZE = authorize('rol').toString();
const FUENTE_PRUEBA_GRATIS = requireActiveTrial({}).toString();
const ROLES_DEL_PERSONAL = ['admin', 'receptionist'];

const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/api/openapi.json'), 'utf8'));
// La URL de cada servidor de la especificacion ya termina en /api.
const BASE = '/api';
const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

/**
 * Prefijo con que se monto un router o un middleware: app.use('/api/admin', r).
 * Express 4 solo guarda la expresion regular (path-to-regexp 0.1, sin `end`):
 * '^\/api\/admin\/?(?=\/|$)'. Si el prefijo tiene parametros u otra sintaxis,
 * falla en vez de adivinar.
 */
function prefijoDe(layer) {
  if (layer.regexp.fast_slash) return '';
  const prefijo = layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
  if (!/^[\w\-/.]+$/.test(prefijo)) {
    throw new Error(`No se pudo leer el prefijo de un app.use(): ${layer.regexp}`);
  }
  return prefijo;
}

/**
 * Rutas de la pila, en orden, con los middlewares que corren antes del handler
 * (`cadena`, las capas de Express): los de la ruta y los de un use() anterior
 * cuyo prefijo la cubre (por ejemplo el router.use(authenticate, requireClient)
 * de cliente.js, que va despues del login y por eso no lo cubre). Los use() de
 * un router siguen valiendo para lo que se monta despues de el.
 */
function rutasDe(stack, base = '', heredados = []) {
  const rutas = [];
  let usados = [...heredados];
  for (const layer of stack) {
    if (layer.route) {
      const completa = base + layer.route.path;
      const antes = usados.filter((u) => u.prefijo === '' || completa === u.prefijo || completa.startsWith(`${u.prefijo}/`));
      const cadena = [...antes.map((u) => u.layer), ...layer.route.stack];
      for (const metodo of Object.keys(layer.route.methods)) {
        rutas.push({ metodo: metodo.toUpperCase(), completa, cadena });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const dentro = rutasDe(layer.handle.stack, base + prefijoDe(layer), usados);
      rutas.push(...dentro.rutas);
      usados = dentro.usados;
    } else {
      usados.push({ layer, prefijo: base + prefijoDe(layer) });
    }
  }
  return { rutas, usados };
}

const nombres = (cadena) => cadena.map((l) => l.name);

/** Roles del personal que pasan todos los authorize() de la cadena. */
function rolesDelCodigo(cadena) {
  const autorizaciones = cadena.filter((l) => l.handle.toString() === FUENTE_AUTHORIZE);
  const resFalsa = { status() { return this; }, json() { return this; } };
  return ROLES_DEL_PERSONAL.filter((rol) => autorizaciones.every((l) => {
    let paso = false;
    l.handle({ user: { role: rol } }, resFalsa, () => { paso = true; });
    return paso;
  }));
}

const exigePruebaGratis = (cadena) => cadena.some((l) => l.handle.toString() === FUENTE_PRUEBA_GRATIS);

/** '/api/admin/miembros/:id/' -> '/admin/miembros/{id}', como en la especificacion. */
function aRutaDeSpec(completa) {
  if (!completa.startsWith(`${BASE}/`)) throw new Error(`Ruta fuera de ${BASE}: ${completa}`);
  const sinBase = completa.slice(BASE.length).replace(/\/+$/, '') || '/';
  return sinBase.replace(/:(\w+)/g, '{$1}');
}

/** Acceso segun los middlewares del codigo. */
function accesoDelCodigo(cadena) {
  const n = nombres(cadena);
  if (n.includes('requireAdminToken')) return 'X-Admin-Token';
  if (n.includes('requireClient')) return 'token del miembro';
  if (n.includes('authenticate')) return 'token';
  return 'publica';
}

/** Acceso segun el `security` de la operacion (o el global). */
function accesoDeLaSpec(operacion) {
  const security = operacion.security || SPEC.security || [];
  const esquemas = security.flatMap((s) => Object.keys(s));
  if (esquemas.length === 0) return 'publica';
  if (esquemas.every((e) => e === 'adminToken')) return 'X-Admin-Token';
  if (esquemas.every((e) => e === 'miembro')) return 'token del miembro';
  if (esquemas.includes('personal')) return 'token';
  return `otro (${esquemas.join(', ')})`;
}

// Express responde con la primera ruta que coincide: una repetida mas abajo no
// se usa nunca. Se queda la primera, igual que Express.
const todas = rutasDe(app._router.stack).rutas.map((r) => ({ ...r, clave: `${r.metodo} ${aRutaDeSpec(r.completa)}` }));
const delCodigo = new Map();
const repetidas = [];
for (const r of todas) {
  if (delCodigo.has(r.clave)) repetidas.push(r.clave);
  else delCodigo.set(r.clave, r);
}

const deLaSpec = new Map();
for (const [ruta, item] of Object.entries(SPEC.paths)) {
  for (const metodo of METODOS) {
    if (item[metodo]) deLaSpec.set(`${metodo.toUpperCase()} ${ruta}`, item[metodo]);
  }
}

describe('docs/api/openapi.json frente a las rutas de Express', () => {
  test('should document in the spec every route that Express mounts', () => {
    // Act
    const faltan = [...delCodigo.keys()].filter((clave) => !deLaSpec.has(clave)).sort();

    // Assert: cada una es una ruta del codigo que no esta en openapi.json
    expect(delCodigo.size).toBeGreaterThan(0);
    expect(faltan).toEqual([]);
  });

  test('should not have operations in the spec that Express does not mount', () => {
    // Act
    const sobran = [...deLaSpec.keys()].filter((clave) => !delCodigo.has(clave)).sort();

    // Assert: cada una es una operacion de openapi.json que el codigo no tiene
    expect(sobran).toEqual([]);
  });

  test('should only repeat GET /admin/diagnostics, the route the spec says is shadowed', () => {
    // Assert: esta en staff.js y en dashboard.js, y responde la de staff.js.
    // Otra repetida es codigo que nunca corre.
    expect(repetidas).toEqual(['GET /admin/diagnostics']);
  });

  test('should give each operation the same access in the spec as the middlewares in the code', () => {
    // Act
    const distintas = [...delCodigo.values()]
      .filter((r) => deLaSpec.has(r.clave))
      .map((r) => ({ ruta: r.clave, codigo: accesoDelCodigo(r.cadena), spec: accesoDeLaSpec(deLaSpec.get(r.clave)) }))
      .filter((r) => r.codigo !== r.spec);

    // Assert
    expect(distintas).toEqual([]);
  });

  test('should give each staff operation the same roles in x-roles as the authorize() calls in the code', () => {
    // Arrange: solo las rutas del personal (token del personal en el codigo)
    const delPersonal = [...delCodigo.values()].filter((r) => deLaSpec.has(r.clave) && accesoDelCodigo(r.cadena) === 'token');

    // Act
    const distintas = delPersonal
      .map((r) => ({ ruta: r.clave, codigo: rolesDelCodigo(r.cadena), spec: [...(deLaSpec.get(r.clave)['x-roles'] || [])].sort() }))
      .filter((r) => JSON.stringify(r.codigo) !== JSON.stringify(r.spec));

    // Assert
    expect(delPersonal.length).toBeGreaterThan(0);
    expect(distintas).toEqual([]);
  });

  test('should mark x-prueba-gratis exactly on the operations that check the free trial, each with its 402', () => {
    // Act
    const distintas = [...delCodigo.values()]
      .filter((r) => deLaSpec.has(r.clave))
      .map((r) => {
        const op = deLaSpec.get(r.clave);
        return { ruta: r.clave, codigo: exigePruebaGratis(r.cadena), spec: op['x-prueba-gratis'] === true, con402: Boolean(op.responses['402']) };
      })
      .filter((r) => r.codigo !== r.spec || (r.spec && !r.con402));

    // Assert
    expect(distintas).toEqual([]);
  });
});

describe('recorrido de la pila de Express que usa esta prueba', () => {
  function authenticate(_req, _res, next) { next(); }

  test('should treat a path-less router.use(authenticate) as applying to the routers mounted after it', () => {
    // Arrange: el error que cerraria /api/healthz
    const conCandado = express.Router();
    conCandado.use(authenticate);
    conCandado.get('/privada', (_req, res) => res.end());
    const publico = express.Router();
    publico.get('/healthz', (_req, res) => res.end());
    const appDePrueba = express();
    appDePrueba.use('/api', conCandado);
    appDePrueba.use('/api', publico);

    // Act
    const { rutas } = rutasDe(appDePrueba._router.stack);
    const healthz = rutas.find((r) => r.completa === '/api/healthz');

    // Assert
    expect(accesoDelCodigo(healthz.cadena)).toBe('token');
  });

  test('should not apply a router.use() to the routes declared before it', () => {
    // Arrange: como el login de cliente.js, que va antes del router.use
    const router = express.Router();
    router.post('/login', (_req, res) => res.end());
    router.use(authenticate);
    router.get('/me', (_req, res) => res.end());
    const appDePrueba = express();
    appDePrueba.use('/api/cliente', router);

    // Act
    const { rutas } = rutasDe(appDePrueba._router.stack);
    const acceso = Object.fromEntries(rutas.map((r) => [r.completa, accesoDelCodigo(r.cadena)]));

    // Assert
    expect(acceso).toEqual({ '/api/cliente/login': 'publica', '/api/cliente/me': 'token' });
  });

  test('should read the roles of authorize() and recognize requireActiveTrial', () => {
    // Arrange
    const router = express.Router();
    router.get('/solo-admin', authenticate, authorize('admin'), requireActiveTrial({}), (_req, res) => res.end());
    router.get('/los-dos', authenticate, authorize('admin', 'receptionist'), (_req, res) => res.end());
    const appDePrueba = express();
    appDePrueba.use('/api', router);

    // Act
    const { rutas } = rutasDe(appDePrueba._router.stack);
    const porRuta = Object.fromEntries(rutas.map((r) => [r.completa, { roles: rolesDelCodigo(r.cadena), prueba: exigePruebaGratis(r.cadena) }]));

    // Assert
    expect(porRuta).toEqual({
      '/api/solo-admin': { roles: ['admin'], prueba: true },
      '/api/los-dos': { roles: ['admin', 'receptionist'], prueba: false },
    });
  });
});
