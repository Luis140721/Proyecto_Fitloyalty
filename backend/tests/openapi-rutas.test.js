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
 * La especificacion es JSON y no YAML porque el backend no tiene un lector de
 * YAML entre sus dependencias (js-yaml solo llega como dependencia de eslint y
 * jest, y pnpm no lo deja cargar desde aqui).
 */
process.env.ENABLE_WHATSAPP = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

jest.mock('../src/db/db', () => ({ query: jest.fn() }));

const fs = require('fs');
const path = require('path');
const { app } = require('../src/index');

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
 * Rutas de la pila, en orden, con los middlewares que corren antes del handler:
 * los de la ruta y los de un use() anterior cuyo prefijo la cubre (por ejemplo
 * el router.use(authenticate, requireClient) de cliente.js, que va despues del
 * login y por eso no lo cubre).
 */
function rutasDe(stack, base = '', heredados = []) {
  const rutas = [];
  const usados = [...heredados];
  for (const layer of stack) {
    if (layer.route) {
      const completa = base + layer.route.path;
      const antes = usados.filter((u) => completa === u.prefijo || completa.startsWith(`${u.prefijo}/`) || u.prefijo === '');
      const cadena = [...antes.map((u) => u.nombre), ...layer.route.stack.map((l) => l.name)];
      for (const metodo of Object.keys(layer.route.methods)) {
        rutas.push({ metodo: metodo.toUpperCase(), completa, cadena });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      rutas.push(...rutasDe(layer.handle.stack, base + prefijoDe(layer), usados));
    } else {
      usados.push({ nombre: layer.name, prefijo: base + prefijoDe(layer) });
    }
  }
  return rutas;
}

/** '/api/admin/miembros/:id/' -> '/admin/miembros/{id}', como en la especificacion. */
function aRutaDeSpec(completa) {
  if (!completa.startsWith(`${BASE}/`)) throw new Error(`Ruta fuera de ${BASE}: ${completa}`);
  const sinBase = completa.slice(BASE.length).replace(/\/+$/, '') || '/';
  return sinBase.replace(/:(\w+)/g, '{$1}');
}

/** Acceso segun los middlewares del codigo. */
function accesoDelCodigo(cadena) {
  if (cadena.includes('requireAdminToken')) return 'X-Admin-Token';
  if (cadena.includes('requireClient')) return 'token del miembro';
  if (cadena.includes('authenticate')) return 'token';
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
const todas = rutasDe(app._router.stack).map((r) => ({ ...r, clave: `${r.metodo} ${aRutaDeSpec(r.completa)}` }));
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
});
