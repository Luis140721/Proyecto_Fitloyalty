/**
 * routes/cliente.js
 *
 * API para la APP MÓVIL DEL CLIENTE (Flutter).
 *
 * Endpoints (todos bajo /api/cliente):
 *   POST /login        -> documento + PIN -> JWT de cliente (30 dias)
 *   GET  /me           -> datos del miembro autenticado
 *   PUT  /me           -> actualizar telefono, email, contacto de emergencia
 *   GET  /qr           -> { codigo, imagenBase64 } para mostrar el QR
 *   GET  /membresia    -> plan vigente (plan_cobro activo)
 *   GET  /asistencia   -> ultimos check-ins del miembro (default 20)
 *   GET  /gamificacion -> hitos alcanzados + disponibles + puntos totales
 *   GET  /retos        -> retos activos en el gimnasio del miembro
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

const pool = require('../db/db');
const { authenticate, requireClient } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { generarTokenCliente, miembroSeguro } = require('../lib/auth-helpers');

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
// ---------------------------------------------------------------------------
const updateMeSchema = z.object({
  telefono:            z.string().regex(/^[3]\d{9}$/, 'Telefono debe ser 10 digitos y empezar por 3').optional(),
  email:               z.string().email('Correo invalido').optional().or(z.literal('')),
  direccion:           z.string().max(200).optional(),
  contacto_emergencia: z.string().max(120).optional(),
  telefono_emergencia: z.string().max(20).optional(),
  condiciones_medicas: z.string().max(2000).optional(),
  alergias:            z.string().max(500).optional(),
  objetivo:            z.string().max(200).optional(),
  nivel_experiencia:   z.enum(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO']).optional(),
});

router.put('/me', asyncHandler(async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0].message, 'VALIDATION_ERROR');
  }
  const data = parsed.data;
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
    return res.json({ message: 'Perfil actualizado.', miembro: miembroSeguro(rows[0]) });
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
      `SELECT codigo_qr, qr_imagen FROM miembro
        WHERE id_miembro = $1 AND id_gimnasio = $2 AND activo = TRUE`,
      [idMiembro, gymId]
    );
    if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    const { codigo_qr, qr_imagen } = rows[0];
    if (!codigo_qr) throw new AppError(404, 'Aun no tienes un QR asignado.', 'QR_NOT_ASSIGNED');

    return res.json({
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
// Retos activos en el gimnasio, con flag `participa` para los que ya esta
// inscrito el miembro.
//
// NOTA: la tabla `reto` NO tiene `meta` ni `premio`, tiene `meta_asistencias`
// y `recompensa`. `reto_miembro` no tiene `progreso` ni `completado` como
// boolean, tiene `checkins_acumulados`, `porcentaje_avance` y `estado`
// ('EN_CURSO' / 'COMPLETADO' / 'CANCELADO').
// ---------------------------------------------------------------------------
router.get('/retos', asyncHandler(async (req, res) => {
  const idMiembro = req.user.idMiembro;
  const gymId     = req.user.gymId;
  try {
    const { rows: retos } = await pool.query(
      `SELECT r.id_reto, r.nombre, r.descripcion, r.fecha_inicio, r.fecha_fin,
              r.meta_asistencias, r.recompensa, r.segmento_elegible, r.estado AS estado_reto,
              rm.id_reto_miembro, rm.checkins_acumulados, rm.porcentaje_avance,
              rm.estado AS estado_participacion, rm.fecha_completado,
              (rm.id_reto_miembro IS NOT NULL) AS participa,
              (rm.estado = 'COMPLETADO')      AS completado
         FROM reto r
         LEFT JOIN reto_miembro rm
           ON rm.id_reto = r.id_reto AND rm.id_miembro = $1
        WHERE r.id_gimnasio = $2
          AND r.activo = TRUE
          AND r.fecha_fin >= CURRENT_DATE
          AND r.estado IN ('ACTIVO', 'PROGRAMADO')
        ORDER BY r.fecha_fin ASC`,
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
// POST /api/cliente/logout
// El JWT es stateless, asi que el logout es solo una confirmacion para la UX.
// El cliente borra el token.
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => res.json({ message: 'Sesion cerrada' }));

module.exports = router;
