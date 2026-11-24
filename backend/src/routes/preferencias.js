/**
 * routes/preferencias.js
 *
 * RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): aceptar o cancelar los mensajes
 * comerciales del gimnasio y elegir los canales. La constancia de cada cambio
 * es una fila de autorizacion_miembro de tipo MENSAJES_COMERCIALES
 * (lib/contacto-miembro.js, guardarComerciales).
 *
 *   App del miembro (token de cliente):
 *     GET   /api/cliente/preferencias   -> si acepta, por que canales, desde
 *                                          cuando y el texto que acepta
 *     PATCH /api/cliente/preferencias   -> { aceptaComerciales?, canalesAutorizados? }
 *                                          constancia con canal APP
 *   Enlace de baja, publico (va al final de cada mensaje comercial):
 *     GET  /api/baja/:token   -> a quien corresponde (solo el primer nombre y
 *                                el gimnasio) y si hoy acepta
 *     POST /api/baja/:token   -> deja de aceptar; constancia con canal ENLACE
 *
 *   El panel cambia la autorizacion en la ficha del miembro (PUT
 *   /api/admin/miembros/:id, routes/miembros.js), con canal PANEL.
 *
 * El GET del enlace no cambia nada: los programas que abren los enlaces para
 * mostrar una vista previa (WhatsApp, el correo) no dan de baja a nadie. La
 * baja la hace el boton de la pagina, con el POST.
 *
 * Un menor de edad puede cancelar los mensajes comerciales desde la app o con
 * el enlace, pero no aceptarlos: eso lo hace su representante legal en el
 * gimnasio (igual que la autorizacion de datos sensibles, RQNF-17).
 */
const express = require('express');
const { z } = require('zod');

const pool = require('../db/db');
const { authenticate, requireClient } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { formatZodError } = require('../lib/validators');
const { verificarTokenBaja } = require('../lib/baja-mensajes');
const { esMenorDeEdad, textoAutorizacion, VERSION_AUTORIZACIONES } = require('../lib/autorizaciones');
const { comercialesDe, preferenciasParaApi, guardarComerciales } = require('../lib/contacto-miembro');
const { TEXTO_HORARIO } = require('../lib/contacto-legal');

const router = express.Router();

const preferenciasSchema = z.object({
  aceptaComerciales: z.boolean({ invalid_type_error: 'aceptaComerciales debe ser verdadero o falso.' }).optional(),
  canalesAutorizados: z.array(z.enum(['WHATSAPP', 'EMAIL'], {
    errorMap: () => ({ message: 'Los canales pueden ser WHATSAPP o EMAIL.' }),
  })).max(2).optional(),
}).refine((v) => v.aceptaComerciales !== undefined || v.canalesAutorizados !== undefined, {
  message: 'Nada que actualizar.',
});

/** Miembro activo, bloqueado si se va a escribir. */
async function leerMiembro(db, idMiembro, gymId, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT m.id_miembro, m.id_gimnasio, m.nombre, m.tipo_documento, m.activo,
            to_char(m.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            g.nombre AS gym_nombre
       FROM miembro m INNER JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
      WHERE m.id_miembro = $1 AND m.id_gimnasio = $2
      ${bloquear ? 'FOR UPDATE OF m' : ''}`,
    [idMiembro, gymId]
  );
  return rows[0] || null;
}

function respuestaApp(m, comerciales) {
  const menor = esMenorDeEdad(m);
  return {
    preferencias: preferenciasParaApi(comerciales),
    texto: textoAutorizacion('MENSAJES_COMERCIALES', VERSION_AUTORIZACIONES),
    version_actual: VERSION_AUTORIZACIONES,
    horario: TEXTO_HORARIO,
    menor_de_edad: menor,
    // La aceptacion de un menor la da su representante en el gimnasio.
    puede_aceptar: !menor,
  };
}

/** Transaccion con el miembro bloqueado: dos toques seguidos no duplican la constancia. */
async function enTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function errorDeBase(ruta, mensaje) {
  return (err) => {
    if (err instanceof AppError) throw err;
    console.error(`[${ruta}] Error:`, err.message);
    throw new AppError(503, mensaje, 'DB_UNREACHABLE');
  };
}

// ---------------------------------------------------------------------------
// App del miembro
// ---------------------------------------------------------------------------
const soloCliente = [authenticate, requireClient];

router.get('/cliente/preferencias', ...soloCliente, asyncHandler(async (req, res) => {
  const cuerpo = await (async () => {
    const m = await leerMiembro(pool, req.user.idMiembro, req.user.gymId);
    if (!m || m.activo === false) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    return respuestaApp(m, await comercialesDe(pool, m.id_miembro, m.id_gimnasio));
  })().catch(errorDeBase('GET /cliente/preferencias', 'No pudimos cargar tus preferencias. Intenta de nuevo.'));
  return res.json(cuerpo);
}));

router.patch('/cliente/preferencias', ...soloCliente, asyncHandler(async (req, res) => {
  const r = preferenciasSchema.safeParse(req.body || {});
  if (!r.success) throw new AppError(400, formatZodError(r.error), 'VALIDATION_ERROR');
  const cambios = r.data;

  const cuerpo = await enTransaccion(async (client) => {
    const m = await leerMiembro(client, req.user.idMiembro, req.user.gymId, { bloquear: true });
    if (!m || m.activo === false) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
    const antes = await comercialesDe(client, m.id_miembro, m.id_gimnasio);
    // Un menor no puede aceptar (ni agregar canales a lo que ya acepto su
    // representante); si puede cancelar en cualquier momento.
    const quiereAceptar = cambios.aceptaComerciales === true
      || (cambios.aceptaComerciales === undefined && antes.acepta_mensajes_comerciales
        && (cambios.canalesAutorizados || []).some((c) => !antes.canales_autorizados.includes(c)));
    if (quiereAceptar && esMenorDeEdad(m)) {
      throw new AppError(403, 'Eres menor de edad: los mensajes comerciales los acepta tu representante legal en el gimnasio. Cancelarlos sí lo puedes hacer aquí.', 'REPRESENTANTE_REQUERIDO');
    }
    const g = await guardarComerciales(client, {
      idMiembro: m.id_miembro, gymId: m.id_gimnasio,
      acepta: cambios.aceptaComerciales, canales: cambios.canalesAutorizados, origen: 'APP',
    });
    let message = 'No había cambios.';
    if (g.cambio) {
      message = g.despues.acepta_mensajes_comerciales
        ? (g.antes.acepta_mensajes_comerciales ? 'Guardamos tus canales.' : 'Aceptaste recibir mensajes comerciales del gimnasio.')
        : 'Listo: ya no recibirás mensajes comerciales del gimnasio.';
    }
    return { message, cambio: g.cambio, ...respuestaApp(m, g.despues) };
  }).catch(errorDeBase('PATCH /cliente/preferencias', 'No pudimos guardar tus preferencias. Intenta de nuevo.'));
  return res.json(cuerpo);
}));

// ---------------------------------------------------------------------------
// Enlace de baja (publico)
// ---------------------------------------------------------------------------
function datosDelToken(token) {
  const datos = verificarTokenBaja(token);
  if (!datos) throw new AppError(404, 'El enlace no es válido.', 'ENLACE_INVALIDO');
  return datos;
}

// Solo el primer nombre y el gimnasio: quien tenga el enlace no ve mas datos.
const paraBaja = (m, comerciales) => ({
  nombre: String(m.nombre || '').trim().split(/\s+/)[0],
  gimnasio: m.gym_nombre,
  aceptaComerciales: comerciales.acepta_mensajes_comerciales === true,
});

router.get('/baja/:token', asyncHandler(async (req, res) => {
  const { idMiembro, idGimnasio } = datosDelToken(req.params.token);
  const cuerpo = await (async () => {
    const m = await leerMiembro(pool, idMiembro, idGimnasio);
    if (!m) throw new AppError(404, 'El enlace no es válido.', 'ENLACE_INVALIDO');
    return paraBaja(m, await comercialesDe(pool, idMiembro, idGimnasio));
  })().catch(errorDeBase('GET /baja/:token', 'No pudimos cargar el enlace. Intenta de nuevo.'));
  return res.json(cuerpo);
}));

router.post('/baja/:token', asyncHandler(async (req, res) => {
  const { idMiembro, idGimnasio } = datosDelToken(req.params.token);
  const cuerpo = await enTransaccion(async (client) => {
    const m = await leerMiembro(client, idMiembro, idGimnasio, { bloquear: true });
    if (!m) throw new AppError(404, 'El enlace no es válido.', 'ENLACE_INVALIDO');
    const g = await guardarComerciales(client, {
      idMiembro, gymId: idGimnasio, acepta: false, origen: 'ENLACE',
    });
    return {
      message: g.cambio
        ? 'Listo: dejaste de recibir mensajes comerciales de este gimnasio.'
        : 'Ya no recibes mensajes comerciales de este gimnasio.',
      cambio: g.cambio,
      ...paraBaja(m, g.despues),
    };
  }).catch(errorDeBase('POST /baja/:token', 'No pudimos guardar tu baja. Intenta de nuevo.'));
  return res.json(cuerpo);
}));

module.exports = router;
