/**
 * routes/cliente.js
 *
 * API para la APP MÓVIL DEL CLIENTE (Flutter).
 *
 * Endpoints (todos bajo /api/cliente):
 *   POST /login        -> documento + PIN -> JWT de cliente (30 dias)
 *   GET  /me           -> datos del miembro autenticado
 *   PUT  /me           -> actualizar telefono, email, contacto de emergencia
 *   GET  /qr           -> { codigo, imagenDataUrl, dinamico } para mostrar el QR
 *   GET  /membresia    -> plan vigente (plan_cobro activo)
 *   GET  /asistencia   -> ultimos check-ins del miembro (default 20)
 *   GET  /gamificacion -> hitos alcanzados + disponibles + puntos totales
 *   GET  /retos        -> retos vigentes del gimnasio y los que el miembro completo
 *   POST /retos/:id/unirse -> inscribe al miembro en un reto (si es elegible)
 *   GET  /mensajes     -> bandeja de mensajes del gimnasio para el miembro
 *   PATCH /mensajes/:id/leido -> marca un mensaje propio como leido
 *   PATCH /mensajes/leidos    -> marca todos como leidos
 *   POST /logout       -> cierre de sesion (cliente borra el token)
 *
 * Autenticacion:
 *   - authenticate valida JWT
 *   - requireClient garantiza que el token es de MIEMBRO (role='cliente'),
 *     no de staff. Asi un admin no puede suplantar a un miembro.
 *
 * Seguridad:
 *   - TODAS las queries filtran por req.user.idMiembro. Un miembro NUNCA
 *     puede ver datos de otro miembro ni de otro gimnasio.
 *   - El PIN se guarda como bcrypt (pin_hash) y se compara en login.
 *   - El endpoint /me NO devuelve pin_hash, ni campos sensibles innecesarios.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const { z }   = require('zod');
const { largoEnCaracteres } = require('../lib/validators');

const pool = require('../db/db');
const { authenticate, requireClient } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { generarTokenCliente, miembroSeguro } = require('../lib/auth-helpers');
const { datosParaApp } = require('../lib/qr-dinamico');
const { esElegible, ETIQUETAS, HOY } = require('../lib/segmentos');
const { sincronizarEstados, recalcularYAvisar } = require('../lib/retos');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/cliente/login
// v3 (2026-09-23): login por TELEFONO + CONTRASENA, SIN pedir gimnasio.
// El backend busca el miembro por telefono en TODOS los gimnasios activos.
// El gimnasio del miembro viene en la respuesta para que la app lo muestre.
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  telefono: z.string().regex(/^3\d{9}$/, 'Telefono debe ser 10 digitos y empezar por 3 (ej. 3001234567)'),
  password: z.string().min(6, 'La contrasena debe tener minimo 6 caracteres'),
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw new AppError(400, 'Datos invalidos: ' + parsed.error.issues[0].message, 'VALIDATION_ERROR');
  }
  const { telefono, password } = parsed.data;

  try {
    // 1) Buscar miembro por telefono en todos los gyms activos.
    //    Quitamos espacios y guiones para comparar limpio.
    const { rows: miembros } = await pool.query(
      `SELECT m.id_miembro, m.id_gimnasio, m.nombre, m.documento, m.telefono, m.email,
              m.codigo_qr, m.qr_imagen, m.foto_url, m.activo, m.fecha_registro,
              m.password_hash, m.app_acceso,
              g.nombre AS gym_nombre, g.activo AS gym_activo, g.plan_activo
         FROM miembro m
         INNER JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
        WHERE REPLACE(REPLACE(COALESCE(m.telefono, ''), ' ', ''), '-', '') = $1
          AND m.activo = TRUE AND g.activo = TRUE
        ORDER BY m.id_miembro ASC
        LIMIT 1`,
      [telefono.trim()]
    );
    if (miembros.length === 0) {
      throw new AppError(404, 'No encontramos un miembro activo con ese telefono.', 'MEMBER_NOT_FOUND');
    }
    const row = miembros[0];

    if (row.app_acceso === false) {
      throw new AppError(403, 'Tu acceso a la app esta desactivado. Habla con el administrador.', 'APP_ACCESS_DENIED');
    }

    if (!row.password_hash) {
      throw new AppError(403, 'Aun no tienes contrasena asignada. Pide al administrador que te la asigne en el panel.', 'PASSWORD_NOT_SET');
    }

    // 2) Comparar contrasena con bcrypt.
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new AppError(401, 'Contrasena incorrecta.', 'BAD_PASSWORD');

    // 3) Generar JWT de cliente (NO de staff).
    const token = generarTokenCliente(row);

    return res.json({
      message: 'Inicio de sesion exitoso',
      token,
      miembro: miembroSeguro(row),
      gimnasio: {
        id:        row.id_gimnasio,
        nombre:    row.gym_nombre,
        planActivo: row.plan_activo,
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[POST /cliente/login] Error:', err.message);
    throw new AppError(503, 'No pudimos iniciar sesion. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// Todas las rutas siguientes requieren token de cliente.
router.use(authenticate, requireClient);

// ---------------------------------------------------------------------------
// GET /api/cliente/me
// ---------------------------------------------------------------------------
router.get('/me', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rows } = await pool.query(
      `SELECT m.id_miembro, m.id_gimnasio, m.nombre, m.documento, m.telefono, m.email,
              m.codigo_qr, m.qr_imagen, m.foto_url, m.activo, m.fecha_registro,
              m.tipo_documento, m.fecha_nacimiento, m.genero, m.direccion,
              m.contacto_emergencia, m.telefono_emergencia, m.condiciones_medicas,
              m.alergias, m.objetivo, m.nivel_experiencia, m.observaciones,
              m.app_acceso,
              g.nombre AS gym_nombre, g.logo_url AS gym_logo, g.telefono AS gym_telefono,
              g.direccion AS gym_direccion
         FROM miembro m
         INNER JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
        WHERE m.id_miembro = $1 AND m.id_gimnasio = $2 AND m.activo = TRUE`,
      [idMiembro, gymId]
    );
    if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    const m = rows[0];
    return res.json({
      miembro: miembroSeguro(m),
      gimnasio: {
        id:       m.id_gimnasio,
        nombre:   m.gym_nombre,
        logoUrl:  m.gym_logo,
        telefono: m.gym_telefono,
        direccion: m.gym_direccion,
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/me] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu perfil. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// PUT /api/cliente/me
// Editar SOLO los campos que un cliente tiene sentido editar.
// Nunca deja tocar documento, codigo_qr, ni campos de gestion interna.
//
// La app abre estos campos vacios (no los recibe) y los manda todos al guardar:
// un texto vacio quiere decir "no lo cambie", no "borrelo". Sin esto, cambiar
// solo el telefono borraba la direccion, el contacto de emergencia y los datos
// de salud. El correo si llega lleno: vacio quiere decir que no tiene, y se
// guarda NULL ('' chocaria con el de otro miembro sin correo).
// ---------------------------------------------------------------------------
const VACIO_ES_SIN_CAMBIO = [
  'direccion', 'contacto_emergencia', 'telefono_emergencia', 'condiciones_medicas', 'alergias', 'objetivo',
];

// Los topes son los de las columnas de miembro (iguales en Neon y en las
// migraciones): email VARCHAR(150), contacto_emergencia VARCHAR(100),
// objetivo VARCHAR(50), telefono_emergencia VARCHAR(20). Antes el esquema
// dejaba pasar mas, la BD respondia 22001 y el miembro veia un 503 (#89).
// Se mide con largoEnCaracteres, que cuenta igual que PostgreSQL (un emoji es
// un caracter, no dos). direccion, condiciones y alergias son TEXT.
const cabe = (n, campo) => z.string({ invalid_type_error: `${campo} debe ser texto.` })
  .refine((v) => largoEnCaracteres(v) <= n, { message: `${campo} admite máximo ${n} caracteres.` });

const updateMeSchema = z.object({
  telefono:            z.string().regex(/^[3]\d{9}$/, 'Telefono debe ser 10 digitos y empezar por 3').optional(),
  email:               z.string().email('Correo invalido')
    .refine((v) => largoEnCaracteres(v) <= 150, { message: 'El correo admite máximo 150 caracteres.' })
    .optional().or(z.literal('')),
  direccion:           cabe(200, 'La dirección').optional(),
  contacto_emergencia: cabe(100, 'El contacto de emergencia').optional(),
  telefono_emergencia: cabe(20, 'El teléfono de emergencia').optional(),
  condiciones_medicas: cabe(2000, 'Las condiciones médicas').optional(),
  alergias:            cabe(500, 'Las alergias').optional(),
  objetivo:            cabe(50, 'El objetivo').optional(),
  nivel_experiencia:   z.enum(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO']).optional(),
});

router.put('/me', asyncHandler(async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  }
  const data = parsed.data;
  // RQNF-17: cuenta que la app los mande, aunque vengan vacios (ver descartarSensiblesSinAutorizacion).
  const mandaSalud = data.condiciones_medicas !== undefined || data.alergias !== undefined;
  for (const campo of VACIO_ES_SIN_CAMBIO) {
    if (data[campo] !== undefined && data[campo].trim() === '') delete data[campo];
  }
  if (data.email === '') data.email = null;
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No hay campos para actualizar.', 'EMPTY_UPDATE');
  }
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;

  // Validar email unico en el gimnasio si viene
  if (data.email) {
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM miembro
        WHERE id_gimnasio = $1 AND LOWER(email) = LOWER($2)
          AND id_miembro <> $3 AND activo = TRUE`,
      [gymId, data.email, idMiembro]
    );
    if (dup.length > 0) throw new AppError(409, 'Ese correo ya esta registrado en otro miembro.', 'EMAIL_TAKEN');
  }

  // RQNF-17: sin la autorizacion de datos sensibles no se guardan
  // condiciones medicas ni alergias (quedan en NULL).
  const sensiblesDescartados = mandaSalud && await descartarSensiblesSinAutorizacion(idMiembro, gymId, data);

  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    params.push(k === 'email' && v ? v.toLowerCase() : v);
    campos.push(`${k} = $${params.length}`);
  }
  params.push(idMiembro);
  const idIdx = params.length;
  params.push(gymId);
  const gymIdx = params.length;

  try {
    const { rows } = await pool.query(
      `UPDATE miembro SET ${campos.join(', ')}
        WHERE id_miembro = $${idIdx} AND id_gimnasio = $${gymIdx}
        RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                  foto_url, activo, fecha_registro`,
      params
    );
    if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    return res.json({
      message: sensiblesDescartados
        ? 'Perfil actualizado. Tus condiciones médicas y alergias no se guardaron porque no has autorizado el tratamiento de datos de salud.'
        : 'Perfil actualizado.',
      miembro: miembroSeguro(rows[0]),
      datos_sensibles_descartados: sensiblesDescartados,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[PUT /cliente/me] Error:', err.message);
    throw new AppError(503, 'No pudimos actualizar tu perfil. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// GET /api/cliente/qr
// Devuelve el codigo y la imagen del QR para mostrar en pantalla.
// ---------------------------------------------------------------------------
router.get('/qr', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rows } = await pool.query(
      `SELECT m.id_miembro, m.codigo_qr, m.qr_imagen, g.qr_dinamico_obligatorio
         FROM miembro m
         JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
        WHERE m.id_miembro = $1 AND m.id_gimnasio = $2 AND m.activo = TRUE`,
      [idMiembro, gymId]
    );
    if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    const { codigo_qr, qr_imagen } = rows[0];
    if (!codigo_qr) throw new AppError(404, 'Aun no tienes un QR asignado.', 'QR_NOT_ASSIGNED');

    return res.json({
      // QR dinamico: la app calcula sola el codigo de cada 30 s (lib/qr-dinamico.js).
      dinamico: datosParaApp(rows[0].id_miembro, codigo_qr),
      // true si el gimnasio ya no acepta el QR fijo.
      solo_dinamico: rows[0].qr_dinamico_obligatorio === true,
      codigo: codigo_qr,
      // La BD guarda base64 crudo; el front espera el data URL completo.
      imagenDataUrl: qr_imagen
        ? (qr_imagen.startsWith('data:image') ? qr_imagen : `data:image/png;base64,${qr_imagen}`)
        : null,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/qr] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu QR. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// GET /api/cliente/membresia
// Plan vigente del miembro (si tiene). Usa plan_cobro (es donde realmente
// vive el plan en este proyecto; la tabla membresia esta desfasada).
// ---------------------------------------------------------------------------
router.get('/membresia', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  try {
    const { rows } = await pool.query(
      `SELECT pc.id_plan_cobro, pc.tipo_plan, pc.fecha_inicio, pc.fecha_fin,
              pc.estado_pago, pc.valor_total, pc.valor_pagado, pc.metodo_pago,
              pc.proxima_fecha_cobro, pc.activo,
              (pc.fecha_fin IS NOT NULL AND pc.fecha_fin < CURRENT_DATE) AS vencido,
              (pc.fecha_fin IS NOT NULL
               AND pc.fecha_fin >= CURRENT_DATE
               AND pc.fecha_fin <= CURRENT_DATE + INTERVAL '7 days') AS vencePronto,
              (pc.fecha_fin - CURRENT_DATE)::int AS dias_para_vencer
         FROM plan_cobro pc
        WHERE pc.id_miembro = $1 AND pc.activo = TRUE
        ORDER BY pc.fecha_fin DESC NULLS LAST, pc.id_plan_cobro DESC
        LIMIT 1`,
      [idMiembro]
    );
    if (rows.length === 0) {
      return res.json({ membresia: null, mensaje: 'Aun no tienes un plan activo.' });
    }
    return res.json({ membresia: rows[0] });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/membresia] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu plan. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// GET /api/cliente/asistencia
// Ultimos N check-ins del miembro autenticado.
// ---------------------------------------------------------------------------
router.get('/asistencia', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  const limit     = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  try {
    const { rows: historial } = await pool.query(
      `SELECT c.id_checkin, c.fecha_hora, c.metodo, c.observacion
         FROM checkin c
        WHERE c.id_miembro = $1 AND c.id_gimnasio = $2 AND c.valido = TRUE
        ORDER BY c.fecha_hora DESC
        LIMIT $3`,
      [idMiembro, gymId, limit]
    );
    const { rows: resumen } = await pool.query(
      `SELECT
         COUNT(*)::int                                                              AS total,
         COUNT(*) FILTER (WHERE c.fecha_hora::date = CURRENT_DATE)::int              AS hoy,
         COUNT(*) FILTER (WHERE c.fecha_hora >= date_trunc('month', CURRENT_DATE))::int AS este_mes
       FROM checkin c
       WHERE c.id_miembro = $1 AND c.id_gimnasio = $2 AND c.valido = TRUE`,
      [idMiembro, gymId]
    );
    return res.json({
      checkins: historial,
      resumen: resumen[0] || { total: 0, hoy: 0, este_mes: 0 },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/asistencia] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu asistencia. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// GET /api/cliente/gamificacion
// Resumen para la pantalla "Mis logros":
//   - puntosTotales: suma de puntos de los hitos logrados
//   - totalHitos, totalLogrados
//   - hitos: lista de hitos del gimnasio con flag `logrado` y fecha
//
// NOTA: la tabla hito_gamificacion NO tiene columna `puntos` ni `descripcion`
// ni `icono`. Tiene `valor_objetivo` (meta a alcanzar) y `mensaje` (texto que
// se muestra al lograrlo). Como "puntos" no existe en BD, los calculamos en
// backend con una regla simple:
//   - RACHA              -> valor_objetivo * 5  (5 puntos por dia de racha)
//   - TOTAL_ASISTENCIAS  -> valor_objetivo * 2  (2 puntos por visita)
// Asi un hito de racha de 7 dias = 35 pts, 100 visitas = 200 pts.
// ---------------------------------------------------------------------------
router.get('/gamificacion', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rows: hitos } = await pool.query(
      `SELECT h.id_hito, h.nombre, h.tipo_hito, h.valor_objetivo, h.mensaje,
              hm.id_hito_miembro, hm.fecha_logro,
              (hm.id_hito IS NOT NULL) AS logrado,
              CASE
                WHEN h.tipo_hito = 'RACHA'              THEN h.valor_objetivo * 5
                WHEN h.tipo_hito = 'TOTAL_ASISTENCIAS'  THEN h.valor_objetivo * 2
                ELSE h.valor_objetivo
              END AS puntos
         FROM hito_gamificacion h
         LEFT JOIN hito_miembro hm
           ON hm.id_hito = h.id_hito AND hm.id_miembro = $1
        WHERE h.id_gimnasio = $2 AND h.activo = TRUE
        ORDER BY logrado DESC, h.valor_objetivo ASC, h.id_hito ASC`,
      [idMiembro, gymId]
    );
    const puntosTotales = hitos.reduce(
      (acc, h) => acc + (h.logrado ? (h.puntos || 0) : 0),
      0
    );
    const totalLogrados = hitos.filter((h) => h.logrado).length;
    const totalHitos    = hitos.length;
    return res.json({
      resumen: {
        puntosTotales,
        totalHitos,
        totalLogrados,
        porcentaje: totalHitos === 0 ? 0 : Math.round((totalLogrados / totalHitos) * 100),
      },
      hitos,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/gamificacion] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tus logros. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// GET /api/cliente/retos
// Retos del miembro (RQF-12):
//   - los vigentes o programados del gimnasio, con `participa` si ya esta
//     inscrito (si no, la app ofrece «Unirme»);
//   - los que ya completo, aunque el reto haya terminado o lo hayan cancelado
//     despues: la recompensa es suya y la app los muestra como completados.
// Primero los que no ha completado (el que termina antes, arriba) y despues
// los completados (el mas reciente, arriba). `vigente` dice si el reto todavia
// corre.
//
// NOTA: la tabla `reto` NO tiene `meta` ni `premio`, tiene `meta_asistencias`
// y `recompensa`. `reto_miembro` no tiene `progreso` ni `completado` como
// boolean, tiene `checkins_acumulados`, `porcentaje_avance` y `estado`
// ('EN_CURSO' / 'COMPLETADO' / 'CANCELADO').
// Las fechas salen como AAAA-MM-DD y el porcentaje como numero: pg entrega
// NUMERIC como texto y la app lo lee como numero.
// ---------------------------------------------------------------------------
router.get('/retos', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    // Vigente: activo, no terminado (dia de Colombia) y no cancelado.
    const VIGENTE = `(r.activo = TRUE AND r.estado IN ('ACTIVO', 'PROGRAMADO') AND r.fecha_fin >= ${HOY})`;
    const { rows: retos } = await pool.query(
      `SELECT r.id_reto, r.nombre, r.descripcion,
              to_char(r.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
              to_char(r.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
              r.meta_asistencias, r.recompensa, r.segmento_elegible, r.estado AS estado_reto,
              rm.id_reto_miembro, rm.checkins_acumulados,
              rm.porcentaje_avance::float AS porcentaje_avance,
              rm.estado AS estado_participacion, rm.fecha_completado,
              (rm.id_reto_miembro IS NOT NULL) AS participa,
              COALESCE(rm.estado = 'COMPLETADO', FALSE) AS completado,
              ${VIGENTE} AS vigente
         FROM reto r
         LEFT JOIN reto_miembro rm
           ON rm.id_reto = r.id_reto AND rm.id_miembro = $1
        WHERE r.id_gimnasio = $2
          AND (${VIGENTE} OR rm.estado = 'COMPLETADO')
        ORDER BY COALESCE(rm.estado = 'COMPLETADO', FALSE),
                 rm.fecha_completado DESC NULLS LAST,
                 r.fecha_fin ASC, r.id_reto
        LIMIT 50`,
      [idMiembro, gymId]
    );
    return res.json({ retos });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/retos] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar los retos. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// POST /api/cliente/retos/:id/unirse
// El miembro se inscribe en un reto vigente (o programado) de su gimnasio si
// cae en el segmento elegible. Los ingresos que ya hizo dentro de las fechas
// del reto cuentan.
// ---------------------------------------------------------------------------
router.post('/retos/:id/unirse', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  const idReto = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(idReto) || idReto <= 0 || String(idReto) !== String(req.params.id)) {
    throw new AppError(400, 'Id de reto invalido.', 'VALIDATION_ERROR');
  }
  try {
    await sincronizarEstados(pool, gymId);
    const { rows } = await pool.query(
      `SELECT id_reto, nombre, segmento_elegible, estado
         FROM reto
        WHERE id_reto = $1 AND id_gimnasio = $2 AND activo = TRUE
          AND estado IN ('ACTIVO', 'PROGRAMADO') AND fecha_fin >= ${HOY}`,
      [idReto, gymId]
    );
    const reto = rows[0];
    if (!reto) throw new AppError(404, 'Ese reto ya no está disponible.', 'NOT_FOUND');

    if (!(await esElegible(pool, gymId, idMiembro, reto.segmento_elegible))) {
      throw new AppError(403,
        `Este reto es solo para: ${ETIQUETAS[reto.segmento_elegible] || reto.segmento_elegible}.`,
        'RETO_NO_ELEGIBLE');
    }

    const { rows: nuevo } = await pool.query(
      `INSERT INTO reto_miembro (id_reto, id_miembro) VALUES ($1, $2)
       ON CONFLICT (id_reto, id_miembro) DO NOTHING
       RETURNING id_reto_miembro`,
      [idReto, idMiembro]
    );
    if (nuevo.length === 0) throw new AppError(409, 'Ya estás inscrito en este reto.', 'RETO_YA_INSCRITO');

    // Si con los ingresos que ya tiene llega a la meta, el reto queda
    // completado y le llega el mensaje (y el aviso al gimnasio), una sola vez.
    const { fila, completado } = await recalcularYAvisar(pool, {
      idRetoMiembro: nuevo[0].id_reto_miembro, idReto, idMiembro, gymId,
    });
    return res.status(201).json({
      message: completado
        ? `Te uniste al reto «${reto.nombre}» y ya lo completaste con tus ingresos. ¡Felicitaciones!`
        : `Te uniste al reto «${reto.nombre}».`,
      participacion: fila,
      completado,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[POST /cliente/retos/unirse] Error:', err.message);
    throw new AppError(503, 'No pudimos inscribirte en el reto. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// Bandeja de mensajes del miembro (issue #46, RQF-12)
//   GET   /api/cliente/mensajes?limit=50   -> { mensajes, no_leidos }
//   PATCH /api/cliente/mensajes/:id/leido  -> marca uno como leido
//   PATCH /api/cliente/mensajes/leidos     -> marca todos como leidos
//
// Salen de la tabla notificacion con destinatario = 'MIEMBRO' (migracion
// 016): por ahora, el reto completado y el reto cancelado (lib/retos.js). Las
// filas del gimnasio (destinatario GIMNASIO: el acceso bloqueado o el aviso del
// reto para el administrador, que tambien llevan id_miembro) nunca se le
// muestran al miembro. Todo filtra por el miembro y el gimnasio del token: un
// mensaje ajeno responde 404, igual que uno que no existe (RQNF-05).
// ---------------------------------------------------------------------------
const DE_MIEMBRO = `id_gimnasio = $1 AND id_miembro = $2 AND destinatario = 'MIEMBRO'`;

async function contarNoLeidos(gymId, idMiembro) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM notificacion WHERE ${DE_MIEMBRO} AND leida = FALSE`,
    [gymId, idMiembro]
  );
  return rows[0].n;
}

router.get('/mensajes', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  const limit     = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  try {
    const [{ rows: mensajes }, noLeidos] = await Promise.all([
      pool.query(
        `SELECT id_notificacion AS id, tipo, titulo, mensaje, leida, fecha_creacion
           FROM notificacion
          WHERE ${DE_MIEMBRO}
          ORDER BY fecha_creacion DESC, id_notificacion DESC
          LIMIT $3`,
        [gymId, idMiembro, limit]
      ),
      contarNoLeidos(gymId, idMiembro),
    ]);
    return res.json({ mensajes, no_leidos: noLeidos });
  } catch (err) {
    console.error('[GET /cliente/mensajes] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tus mensajes. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

router.patch('/mensajes/leidos', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rowCount } = await pool.query(
      `UPDATE notificacion SET leida = TRUE WHERE ${DE_MIEMBRO} AND leida = FALSE`,
      [gymId, idMiembro]
    );
    return res.json({ message: 'Mensajes marcados como leidos.', marcados: rowCount, no_leidos: 0 });
  } catch (err) {
    console.error('[PATCH /cliente/mensajes/leidos] Error:', err.message);
    throw new AppError(503, 'No pudimos marcar tus mensajes. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

router.patch('/mensajes/:id/leido', asyncHandler(async (req, res) => {
  // Mismo tope que un INTEGER de PostgreSQL: mas grande responde 400, no 503.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');
  }
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rowCount } = await pool.query(
      `UPDATE notificacion SET leida = TRUE WHERE ${DE_MIEMBRO} AND id_notificacion = $3`,
      [gymId, idMiembro, id]
    );
    if (rowCount === 0) throw new AppError(404, 'Mensaje no encontrado.', 'NOT_FOUND');
    return res.json({ message: 'Mensaje marcado como leido.', no_leidos: await contarNoLeidos(gymId, idMiembro) });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[PATCH /cliente/mensajes/:id/leido] Error:', err.message);
    throw new AppError(503, 'No pudimos marcar el mensaje. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

// ---------------------------------------------------------------------------
// POST /api/cliente/logout
// El JWT es stateless, asi que el logout es solo una confirmacion para la UX.
// El cliente borra el token.
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => res.json({ message: 'Sesion cerrada' }));

// ===========================================================================
// RQNF-17 y RQNF-18: autorizaciones y contrato del miembro
// ===========================================================================
//   GET   /autorizaciones                 -> que autorizo, cuando, con que texto
//   PATCH /autorizaciones/datos-sensibles -> { otorgada: false } revoca (y borra
//                                            condiciones medicas y alergias);
//                                            { otorgada: true } la otorga (solo
//                                            un adulto: la de un menor la da su
//                                            representante en el gimnasio)
//   GET   /contrato                       -> su contrato de membresia (el mismo
//                                            texto que el envio por WhatsApp)
// Todo filtra por el miembro y el gimnasio del token: un miembro solo ve lo
// suyo. Van aqui, al final, para no tocar las rutas de arriba.
const {
  leerVigentes: leerAutorizacionesVigentes, leerHistorial: leerHistorialAutorizaciones,
  otorgada: autorizacionOtorgada, registrarAutorizacion, resumenAutorizaciones,
  esMenorDeEdad,
} = require('../lib/autorizaciones');
const { armarContrato, registrarEntregaApp } = require('../lib/contrato');

/**
 * PUT /me: si el miembro no ha autorizado el tratamiento de datos sensibles,
 * condiciones_medicas y alergias se guardan en NULL. Cambia `data` y devuelve
 * true si se descarto algo que el miembro escribio.
 */
async function descartarSensiblesSinAutorizacion(idMiembro, gymId, data) {
  const vigentes = await leerAutorizacionesVigentes(pool, idMiembro, gymId);
  if (autorizacionOtorgada(vigentes, 'DATOS_SENSIBLES')) return false;
  const escribio = Boolean((data.condiciones_medicas || '').trim() || (data.alergias || '').trim());
  data.condiciones_medicas = null;
  data.alergias = null;
  return escribio;
}

/** Miembro activo del token, con lo necesario para saber si es menor. */
async function miembroDelToken(db, req, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT id_miembro, id_gimnasio, tipo_documento,
            to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            representante_nombre, representante_parentesco
       FROM miembro
      WHERE id_miembro = $1 AND id_gimnasio = $2 AND activo = TRUE
      ${bloquear ? 'FOR UPDATE' : ''}`,
    [req.user.idMiembro, req.user.gymId]
  );
  if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
  return rows[0];
}

async function respuestaAutorizaciones(db, m) {
  const vigentes = await leerAutorizacionesVigentes(db, m.id_miembro, m.id_gimnasio);
  const historial = await leerHistorialAutorizaciones(db, m.id_miembro, m.id_gimnasio, 50);
  const menor = esMenorDeEdad(m);
  return {
    ...resumenAutorizaciones(vigentes, historial),
    menor_de_edad: menor,
    representante: menor && m.representante_nombre
      ? { nombre: m.representante_nombre, parentesco: m.representante_parentesco }
      : null,
    // En la app solo se puede cambiar la de datos sensibles; la de un menor
    // solo la puede otorgar su representante, en el gimnasio.
    puede_otorgar_datos_sensibles: !menor,
    puede_revocar_datos_sensibles: autorizacionOtorgada(vigentes, 'DATOS_SENSIBLES'),
  };
}

router.get('/autorizaciones', asyncHandler(async (req, res) => {
  try {
    const m = await miembroDelToken(pool, req);
    return res.json(await respuestaAutorizaciones(pool, m));
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[GET /cliente/autorizaciones] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tus autorizaciones. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
}));

const autorizacionSensiblesSchema = z.object({
  otorgada: z.boolean({
    required_error: 'Indica si otorgas (true) o revocas (false) la autorización.',
    invalid_type_error: 'Indica si otorgas (true) o revocas (false) la autorización.',
  }),
});

router.patch('/autorizaciones/datos-sensibles', asyncHandler(async (req, res) => {
  const parsed = autorizacionSensiblesSchema.safeParse(req.body || {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  const { otorgada } = parsed.data;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const m = await miembroDelToken(client, req, { bloquear: true });
    const vigentes = await leerAutorizacionesVigentes(client, m.id_miembro, m.id_gimnasio);
    const antes = autorizacionOtorgada(vigentes, 'DATOS_SENSIBLES');

    if (otorgada && esMenorDeEdad(m)) {
      throw new AppError(403, 'Eres menor de edad: esta autorización la debe dar tu representante legal en el gimnasio.', 'REPRESENTANTE_REQUERIDO');
    }

    let message = otorgada
      ? 'Ya habías autorizado el tratamiento de tus datos de salud.'
      : 'No tenías autorizado el tratamiento de tus datos de salud.';
    if (otorgada !== antes) {
      await registrarAutorizacion(client, {
        idMiembro: m.id_miembro, gymId: m.id_gimnasio, tipo: 'DATOS_SENSIBLES',
        otorgada, canal: 'APP', registradaPor: null,
      });
      message = otorgada
        ? 'Autorizaste el tratamiento de tus datos de salud.'
        : 'Revocaste la autorización: borramos tus condiciones médicas y alergias.';
    }
    // Sin autorizacion no se guardan: se borran tambien si venian de antes.
    if (!otorgada) {
      await client.query(
        `UPDATE miembro SET condiciones_medicas = NULL, alergias = NULL
          WHERE id_miembro = $1 AND id_gimnasio = $2`,
        [m.id_miembro, m.id_gimnasio]
      );
    }
    const cuerpo = await respuestaAutorizaciones(client, m);
    await client.query('COMMIT');
    return res.json({ message, cambio: otorgada !== antes, ...cuerpo });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err instanceof AppError) throw err;
    console.error('[PATCH /cliente/autorizaciones/datos-sensibles] Error:', err.message);
    throw new AppError(503, 'No pudimos guardar tu autorización. Intenta de nuevo.', 'DB_UNREACHABLE');
  } finally {
    if (client) client.release();
  }
}));

router.get('/contrato', asyncHandler(async (req, res) => {
  let c;
  try {
    c = await armarContrato(pool, req.user.idMiembro, req.user.gymId);
  } catch (err) {
    console.error('[GET /cliente/contrato] Error:', err.message);
    throw new AppError(503, 'No pudimos cargar tu contrato. Intenta de nuevo.', 'DB_UNREACHABLE');
  }
  if (!c || c.fila.activo === false) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
  if (c.faltantes.length > 0) {
    throw new AppError(404, 'Tu contrato aún no está completo: el gimnasio debe registrar tu plan con su precio y forma de pago.',
      'CONTRACT_INCOMPLETE', { faltantes: c.faltantes });
  }

  // Constancia de entrega en la app (RQNF-18). Si falla, igual se muestra.
  let entrega = null;
  try {
    entrega = await registrarEntregaApp(pool, {
      idMiembro: c.fila.id_miembro, gymId: c.fila.id_gimnasio, version: c.datos.version, contenido: c.texto,
    });
  } catch (err) {
    console.error('[GET /cliente/contrato] No se pudo registrar la entrega:', err.message);
  }

  return res.json({
    version: c.datos.version,
    gimnasio: c.datos.gimnasio.nombre,
    secciones: c.secciones,
    contrato: c.texto,
    entregado_en: entrega ? entrega.creado_en : null,
  });
}));

module.exports = router;
