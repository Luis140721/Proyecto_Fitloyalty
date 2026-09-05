/**
 * routes/miembros.js
 *
 * CRUD de miembros (socios) del gimnasio del usuario autenticado.
 * Multi-tenant: todas las queries filtran por id_gimnasio.
 *
 *   GET    /api/admin/miembros         -> lista paginada + busqueda por nombre/doc
 *   POST   /api/admin/miembros         -> crea un miembro (genera codigo_qr)
 *   GET    /api/admin/miembros/:id     -> detalle
 *   PUT    /api/admin/miembros/:id     -> actualiza nombre/telefono/email/activo
 *   DELETE /api/admin/miembros/:id     -> soft-delete (activo = false)
 *   GET    /api/admin/miembros/lookup  -> busqueda por codigo_qr/documento (para checkin)
 *
 * Handlers async con asyncHandler para que cualquier rechazo llegue al
 * errorHandler central con respuesta consistente.
 */
const express = require('express');
const crypto  = require('crypto');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');
const { ULTIMO_PLAN } = require('../lib/planes');
const { telefonoWhatsapp, mensajeParaMiembro, enPalabras } = require('../lib/mensajes');
const { sendMemberQR } = require('../lib/email');
const QRCode = require('qrcode');

const router = express.Router();

// Clave secreta para cifrar QR (en producción debería estar en variables de entorno)
const QR_ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey';

// Función para cifrar el código QR
function encryptQrCode(qrCode) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(QR_ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(qrCode, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Función para descifrar el código QR
function decryptQrCode(encrypted) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(QR_ENCRYPTION_KEY, 'salt', 32);
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // Si falla el descifrado, retornar el texto original (para compatibilidad con QRs antiguos)
    return encrypted;
  }
}

const createSchema = z.object({
  // Datos personales
  nombre:    z.string().min(2, 'El nombre es requerido'),
  tipo_documento: z.enum(['CC', 'TI', 'NIT', 'CE', 'PP']).default('CC'),
  documento: z.string().min(4, 'El documento es requerido'),
  fecha_nacimiento: z.string().optional(),
  // El select de genero puede quedar en "Seleccionar...", que llega como
  // cadena vacia: se traduce a "sin dato" en vez de romper la validacion.
  genero: z.enum(['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  telefono:  z.string().min(7, 'El telefono es requerido'),
  email:     z.string().email().optional().or(z.literal('').transform(() => undefined)),
  direccion: z.string().optional(),
  // Salud y emergencia
  contacto_emergencia: z.string().optional(),
  telefono_emergencia: z.string().optional(),
  condiciones_medicas: z.string().optional(),
  alergias: z.string().optional(),
  // Plan y cobros
  tipo_plan: z.enum(['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO']).default('MENSUAL'),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  valor_total: z.string().optional(),
  valor_pagado: z.string().default('0'),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO']).default('EFECTIVO'),
  referencia_pago: z.string().optional(),
  estado_pago: z.enum(['PENDIENTE', 'PAGADO', 'PARCIAL']).default('PENDIENTE'),
  proxima_fecha_cobro: z.string().optional(),
  activar_recordatorio: z.boolean().default(false),
  dias_recordatorio: z.number().default(7),
  // Info adicional
  objetivo: z.string().optional(),
  nivel_experiencia: z.string().optional(),
  observaciones: z.string().optional(),
  // Términos
  acepto_terminos: z.boolean().default(false),
  autorizo_datos: z.boolean().default(false),
  activo: z.boolean().default(true),
  qr_imagen: z.string().optional(), // Imagen del QR en base64
});

/**
 * Campos editables de un miembro.
 *
 * Antes solo aceptaba nombre, telefono, email, activo y qr_imagen: el resto
 * del formulario se enviaba pero zod lo descartaba en silencio, asi que el
 * usuario creia haber guardado y no se guardaba nada. Ahora se aceptan todas
 * las columnas de datos del miembro.
 *
 * Quedan FUERA a proposito:
 *   - id_miembro / id_gimnasio: identidad, no se tocan.
 *   - codigo_qr: lo genera el servidor; cambiarlo invalidaria el QR impreso
 *     que el miembro ya tiene.
 *   - fecha_registro: es un hecho historico.
 *
 * Las cadenas vacias se convierten a null para no guardar "" en columnas
 * opcionales.
 */
const vacioANull = (schema) =>
  schema.optional().or(z.literal('').transform(() => null)).nullable();

const updateSchema = z.object({
  nombre:    z.string().min(2).optional(),
  documento: z.string().min(3).optional(),
  telefono:  z.string().min(7).optional(),
  email:     z.string().email().optional().or(z.literal('').transform(() => null)).nullable(),
  activo:    z.boolean().optional(),
  qr_imagen: z.string().optional(),

  // Datos personales
  tipo_documento:       vacioANull(z.string().max(10)),
  fecha_nacimiento:     vacioANull(z.string()),
  genero:               vacioANull(z.string().max(20)),
  codigo_pais_telefono: vacioANull(z.string().max(5)),
  ciudad:               vacioANull(z.string().max(100)),
  direccion:            vacioANull(z.string()),

  // Salud y emergencia
  contacto_emergencia:  vacioANull(z.string().max(100)),
  telefono_emergencia:  vacioANull(z.string().max(20)),
  condiciones_medicas:  vacioANull(z.string()),
  alergias:             vacioANull(z.string()),

  // Perfil de entrenamiento
  objetivo:             vacioANull(z.string().max(50)),
  nivel_experiencia:    vacioANull(z.string().max(30)),
  observaciones:        vacioANull(z.string()),
});

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

function genQrCode(gymId) {
  // 8 chars legibles, sin ambiguedades (sin 0/O/1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FL-${gymId}-${out}`;
}

function calcularFechaFin(tipoPlan, fechaInicio) {
  if (!fechaInicio) return null;
  const inicio = new Date(fechaInicio);
  let dias = 30; // Por defecto mensual
  
  switch (tipoPlan.toUpperCase()) {
    case 'MENSUAL':
      dias = 30;
      break;
    case 'TRIMESTRAL':
      dias = 90;
      break;
    case 'SEMESTRAL':
      dias = 180;
      break;
    case 'ANUAL':
      dias = 365;
      break;
    case 'CLASES_SUELTAS':
    case 'ILIMITADO':
    default:
      dias = 30;
  }
  
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + dias);
  return fin.toISOString().split('T')[0];
}

function determinarEstadoPago(valorTotal, valorPagado) {
  const total = parseFloat(valorTotal) || 0;
  const pagado = parseFloat(valorPagado) || 0;
  
  if (pagado >= total) return 'PAGADO';
  if (pagado > 0) return 'PARCIAL';
  return 'PENDIENTE';
}

function calcularProximaFechaCobro(fechaFin) {
  if (!fechaFin) return null;
  const fin = new Date(fechaFin);
  const proxima = new Date(fin);
  proxima.setDate(proxima.getDate() + 1); // Un día después de que vence
  return proxima.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// GET /api/admin/miembros  (paginado + busqueda)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
    const q = (req.query.q || '').trim();
    const includeInactive = req.query.includeInactive === 'true';

    const where = ['m.id_gimnasio = $1'];
    const params = [gymId];
    if (!includeInactive) {
      where.push('m.activo = TRUE');
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const i = params.length;
      where.push(`(LOWER(m.nombre) LIKE $${i} OR LOWER(m.documento) LIKE $${i} OR LOWER(COALESCE(m.email,'')) LIKE $${i} OR LOWER(m.codigo_qr) = LOWER($${i + 1}))`);
      params.push(q);
    }

    const offset = page * pageSize;
    try {
      /*
       * El estado de cada miembro (al dia / vence pronto / vencido / en
       * riesgo) se calcula aqui, en la misma consulta. Antes la lista devolvia
       * solo los datos del miembro y el front esperaba unas banderas que nadie
       * mandaba, asi que TODOS salian "al dia" y los filtros de arriba no
       * encontraban a nadie.
       *
       * Los umbrales son los del gimnasio: los mismos que usan los avisos de
       * la campana, para que las dos pantallas nunca se contradigan.
       */
      const { rows: cfg } = await pool.query(
        `SELECT
           COALESCE(cg.dias_recordatorio_default, cn.dias_aviso_vencimiento, 7)::int AS dias_aviso,
           COALESCE(cn.umbral_alerta_amarilla, 15)::int AS dias_riesgo
         FROM (SELECT 1) x
         LEFT JOIN config_gimnasio cg       ON cg.id_gimnasio = $1
         LEFT JOIN configuracion_gimnasio cn ON cn.id_gimnasio = $1`,
        [gymId]
      );
      const diasAviso  = cfg[0]?.dias_aviso  ?? 7;
      const diasRiesgo = cfg[0]?.dias_riesgo ?? 15;

      const { rows } = await pool.query(
        `SELECT m.id_miembro, m.nombre, m.documento, m.telefono, m.email,
                m.codigo_qr, m.activo, m.fecha_registro,
                pc.tipo_plan, pc.fecha_fin, pc.estado_pago,
                -- Vencido: el plan ya paso de fecha. Un plan que vence hoy
                -- todavia sirve hoy, por eso la comparacion es estricta.
                (pc.fecha_fin IS NOT NULL AND pc.fecha_fin < CURRENT_DATE) AS vencido,
                (pc.fecha_fin IS NOT NULL
                 AND pc.fecha_fin >= CURRENT_DATE
                 AND pc.fecha_fin <= CURRENT_DATE + ($${params.length + 1} || ' days')::interval) AS "vencePronto",
                -- En riesgo: lleva mucho sin aparecer, o nunca ha entrado.
                (ult.ultima IS NULL
                 OR ult.ultima < NOW() - ($${params.length + 2} || ' days')::interval) AS "enRiesgo",
                ult.ultima AS ultimo_ingreso,
                (CURRENT_DATE - pc.fecha_fin)::int          AS dias_vencido,
                (pc.fecha_fin - CURRENT_DATE)::int          AS dias_para_vencer,
                (CURRENT_DATE - ult.ultima::date)::int      AS dias_sin_venir,
                m.codigo_pais_telefono
           FROM miembro m
           LEFT JOIN LATERAL (
             SELECT p.tipo_plan, p.fecha_fin, p.estado_pago
               FROM plan_cobro p
              WHERE p.id_miembro = m.id_miembro AND p.activo = TRUE
              ORDER BY p.fecha_fin DESC NULLS LAST, p.id_plan_cobro DESC
              LIMIT 1
           ) pc ON TRUE
           LEFT JOIN LATERAL (
             SELECT MAX(c.fecha_hora) AS ultima
               FROM checkin c WHERE c.id_miembro = m.id_miembro
           ) ult ON TRUE
          WHERE ${where.join(' AND ')}
          ORDER BY m.nombre ASC
          LIMIT ${pageSize} OFFSET ${offset}`,
        [...params, diasAviso, diasRiesgo]
      );
      const totalQ = await pool.query(
        `SELECT COUNT(*)::int AS total FROM miembro m WHERE ${where.join(' AND ')}`,
        params
      );

      /*
       * A cada miembro que haya que contactar se le adjunta el telefono y el
       * mensaje ya redactado, para poder escribirle desde la misma lista sin
       * tener que abrir la campana. Es el mismo texto que usa la campana,
       * porque sale del mismo helper.
       */
      const { rows: gimnasio } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const nombreGym = gimnasio[0]?.nombre || 'tu gimnasio';

      const miembros = rows.map((m) => {
        const motivo = m.vencido ? 'vencida' : m.vencePronto ? 'por-vencer' : m.enRiesgo ? 'riesgo' : null;
        if (!motivo) return { ...m, whatsapp: null };

        const dato = motivo === 'vencida'    ? enPalabras(m.dias_vencido, 'pasado')
                   : motivo === 'por-vencer' ? enPalabras(m.dias_para_vencer, 'futuro')
                   :                           enPalabras(m.dias_sin_venir, 'plano');

        return {
          ...m,
          whatsapp: {
            motivo,
            telefono: telefonoWhatsapp(m.telefono, m.codigo_pais_telefono),
            mensaje: mensajeParaMiembro(motivo, nombreGym, m.nombre, dato),
          },
        };
      });

      return res.json({ miembros, total: totalQ.rows[0].total, page, pageSize });
    } catch (err) {
      console.error('[GET /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos listar los miembros. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/admin/miembros
// ---------------------------------------------------------------------------
router.post(
  '/admin/miembros',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(createSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    
    const data = parsed.data;
    const gymId = req.user.gymId;

    try {
      // Duplicados por gimnasio (solo verificar miembros activos)
      const { rows: dupDoc } = await pool.query(
        'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND documento = $2 AND activo = TRUE',
        [gymId, data.documento]
      );
      if (dupDoc.length > 0) throw new AppError(409, 'Ya existe un miembro activo con ese documento.', 'MEMBER_DOC_TAKEN');

      if (data.email) {
        const { rows: dupMail } = await pool.query(
          'SELECT id_miembro FROM miembro WHERE id_gimnasio = $1 AND LOWER(email) = $2 AND activo = TRUE',
          [gymId, data.email.toLowerCase()]
        );
        if (dupMail.length > 0) throw new AppError(409, 'Ya existe un miembro activo con ese correo.', 'MEMBER_EMAIL_TAKEN');
      }

      // Generar codigo_qr unico (reintentar si choca)
      let codigo_qr;
      for (let i = 0; i < 5; i += 1) {
        const candidate = genQrCode(gymId);
        const { rows } = await pool.query('SELECT 1 FROM miembro WHERE codigo_qr = $1', [candidate]);
        if (rows.length === 0) { codigo_qr = candidate; break; }
      }
      if (!codigo_qr) throw new AppError(500, 'No se pudo generar un codigo QR unico. Reintenta.', 'QR_GENERATION_FAILED');

      // Cifrar el código QR para mayor seguridad
      const codigo_qr_cifrado = encryptQrCode(codigo_qr);

      // Calcular fechas y estado de pago automáticamente si no se proporcionan
      const fechaInicio = data.fecha_inicio || new Date().toISOString().split('T')[0];
      const fechaFin = data.fecha_fin || calcularFechaFin(data.tipo_plan, fechaInicio);
      const estadoPago = data.estado_pago || determinarEstadoPago(data.valor_total, data.valor_pagado);
      const proximaFechaCobro = data.proxima_fecha_cobro || calcularProximaFechaCobro(fechaFin);

      // Insertar miembro con todos los campos (guardar código QR cifrado)
      console.log('[POST /admin/miembros] Intentando insertar miembro con datos:', {
        gymId,
        nombre: data.nombre,
        tipo_documento: data.tipo_documento,
        documento: data.documento,
        telefono: data.telefono,
        email: data.email
      });
      
      let miembroRows;
      try {
        const result = await pool.query(
          `INSERT INTO miembro (
            id_gimnasio, nombre, tipo_documento, documento, fecha_nacimiento, genero,
            telefono, email, direccion,
            contacto_emergencia, telefono_emergencia, condiciones_medicas, alergias,
            objetivo, nivel_experiencia, observaciones,
            acepto_terminos, autorizo_datos, codigo_qr, qr_imagen
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen, activo, fecha_registro`,
          [
            gymId, 
            data.nombre.trim(), 
            data.tipo_documento, 
            data.documento, 
            data.fecha_nacimiento || null, 
            data.genero || null,
            data.telefono, 
            data.email || null, 
            data.direccion || null,
            data.contacto_emergencia || null, 
            data.telefono_emergencia || null, 
            data.condiciones_medicas || null, 
            data.alergias || null,
            data.objetivo || null, 
            data.nivel_experiencia || null, 
            data.observaciones || null,
            data.acepto_terminos, 
            data.autorizo_datos, 
            codigo_qr_cifrado,
            data.qr_imagen || null
          ]
        );
        miembroRows = result.rows;
        console.log('[POST /admin/miembros] Miembro insertado exitosamente:', miembroRows[0]);
      } catch (dbErr) {
        console.error('[POST /admin/miembros] Error en INSERT de miembro:', dbErr);
        console.error('[POST /admin/miembros] Detalles del error:', {
          message: dbErr.message,
          code: dbErr.code,
          detail: dbErr.detail,
          hint: dbErr.hint,
          table: dbErr.table,
          column: dbErr.column
        });
        throw new AppError(500, 'No pudimos crear el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
      }

      const miembroId = miembroRows[0].id_miembro;

      // Insertar plan y cobros
      const valorTotal = parseFloat(data.valor_total) || 0;
      const valorPagado = parseFloat(data.valor_pagado) || 0;

      await pool.query(
        `INSERT INTO plan_cobro (
          id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin,
          valor_total, valor_pagado, metodo_pago, referencia_pago, estado_pago,
          proxima_fecha_cobro, activar_recordatorio, dias_recordatorio
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          miembroId,
          gymId,
          data.tipo_plan,
          fechaInicio,
          fechaFin,
          valorTotal,
          valorPagado,
          data.metodo_pago,
          data.referencia_pago || null,
          estadoPago,
          proximaFechaCobro,
          data.activar_recordatorio,
          data.dias_recordatorio
        ]
      );

      // Obtener nombre del gimnasio para el email
      const { rows: gymRows } = await pool.query(
        'SELECT nombre FROM gimnasio WHERE id_gimnasio = $1',
        [gymId]
      );
      const gymName = gymRows[0]?.nombre || 'tu gimnasio';

      // Enviar email con el QR si el miembro tiene email
      if (data.email) {
        try {
          // Generar imagen del QR en base64 para el correo
          let qrImageUrl = null;
          try {
            qrImageUrl = await QRCode.toDataURL(codigo_qr);
          } catch (qrErr) {
            console.error('[POST /admin/miembros] Error generando imagen QR:', qrErr.message);
          }
          
          await sendMemberQR({
            to: data.email,
            memberName: data.nombre,
            gymName,
            qrCode: codigo_qr, // Enviar código descifrado para que sea legible
            qrImageUrl: qrImageUrl
          });
        } catch (emailErr) {
          console.error('[POST /admin/miembros] Error enviando email:', emailErr.message);
          // No fallar el registro si el email falla
        }
      }

      return res.status(201).json({ 
        message: 'Miembro creado.', 
        miembro: miembroRows[0],
        qr_data: codigo_qr_cifrado,
        plan_cobro: {
          tipo_plan: data.tipo_plan,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          valor_total: valorTotal,
          valor_pagado: valorPagado,
          estado_pago: estadoPago,
          proxima_fecha_cobro: proximaFechaCobro
        }
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/miembros] Error:', err.message);
      throw new AppError(503, 'No pudimos crear el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/lookup?codigo=QR-FL-1-XXXX  (para checkin)
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/lookup',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const codigo = (req.query.codigo || '').trim();
    const documento = (req.query.documento || '').trim();
    if (!codigo && !documento) throw new AppError(400, 'codigo o documento requerido', 'VALIDATION_ERROR');

    const where = ['id_gimnasio = $1', 'activo = TRUE'];
    const params = [gymId];
    if (codigo)    { params.push(codigo);    where.push(`codigo_qr = $${params.length}`); }
    if (documento) { params.push(documento); where.push(`documento = $${params.length}`); }

    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr
         FROM miembro WHERE ${where.join(' AND ')} LIMIT 1`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

      // Plan vigente (vive en plan_cobro, no en la tabla membresia).
      const { rows: mem } = await pool.query(
        `SELECT estado_pago AS estado, fecha_inicio, fecha_fin,
                INITCAP(LOWER(tipo_plan)) AS plan
           FROM ${ULTIMO_PLAN} pc
          WHERE pc.id_miembro = $1`,
        [rows[0].id_miembro]
      );

      return res.json({ miembro: rows[0], membresia: mem[0] || null });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/lookup] Error:', err.message);
      throw new AppError(503, 'No pudimos buscar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.get(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    try {
      const { rows } = await pool.query(
        /* Trae TODAS las columnas editables. Si faltara alguna, el formulario
           de edicion la precargaria vacia y al guardar la borraria. */
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen,
                activo, fecha_registro, tipo_documento, fecha_nacimiento, genero,
                codigo_pais_telefono, ciudad, direccion, contacto_emergencia,
                telefono_emergencia, condiciones_medicas, alergias, objetivo,
                nivel_experiencia, observaciones
           FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2`,
        [id, gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[GET /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/admin/miembros/:id
// ---------------------------------------------------------------------------
router.put(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(updateSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    const campos = [];
    const params = [];
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      params.push(k === 'email' && v ? v.toLowerCase() : v);
      campos.push(`${k} = $${params.length}`);
    }
    if (campos.length === 0) throw new AppError(400, 'Nada que actualizar', 'VALIDATION_ERROR');

    params.push(id);
    const idIdx = params.length;
    params.push(req.user.gymId);
    const gymIdx = params.length;

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET ${campos.join(', ')}
         WHERE id_miembro = $${idIdx} AND id_gimnasio = $${gymIdx}
         RETURNING id_miembro, nombre, documento, telefono, email, codigo_qr, qr_imagen, activo, fecha_registro`,
        params
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro actualizado.', miembro: rows[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[PUT /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos actualizar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/miembros/:id  (soft delete)
// ---------------------------------------------------------------------------
router.delete(
  '/admin/miembros/:id',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');

    try {
      const { rows } = await pool.query(
        `UPDATE miembro SET activo = FALSE
         WHERE id_miembro = $1 AND id_gimnasio = $2 AND activo = TRUE
         RETURNING id_miembro`,
        [id, req.user.gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado o ya estaba inactivo', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro desactivado.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/miembros/:id] Error:', err.message);
      throw new AppError(503, 'No pudimos desactivar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// DELETE /api/admin/miembros/:id/permanent (hard delete - eliminación permanente)
// ---------------------------------------------------------------------------
router.delete(
  '/admin/miembros/:id/permanent',
  authenticate,
  authorize('admin'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'Id invalido', 'VALIDATION_ERROR');
    const gymId = req.user.gymId;

    try {
      const { rows } = await pool.query(
        'DELETE FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2 RETURNING id_miembro',
        [id, gymId]
      );
      if (rows.length === 0) throw new AppError(404, 'Miembro no encontrado', 'MEMBER_NOT_FOUND');
      return res.json({ message: 'Miembro eliminado permanentemente.' });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[DELETE /admin/miembros/:id/permanent] Error:', err.message);
      throw new AppError(503, 'No pudimos eliminar el miembro. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET  /api/admin/miembros/:id/plan   -> plan vigente del miembro
// PUT  /api/admin/miembros/:id/plan   -> cambia o renueva el plan
// ---------------------------------------------------------------------------

const planSchema = z.object({
  tipo_plan: z.enum(['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CLASES_SUELTAS', 'ILIMITADO', 'OTRO']),
  fecha_inicio: z.string().min(10),
  fecha_fin: z.string().min(10),
  valor_total: z.coerce.number().min(0),
  valor_pagado: z.coerce.number().min(0),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'PSE', 'NEQUI', 'DAVIPLATA', 'OTRO']),
  referencia_pago: z.string().max(80).optional().or(z.literal('')),
  proxima_fecha_cobro: z.string().optional().or(z.literal('')),
});

router.get(
  '/admin/miembros/:id/plan',
  authenticate,
  authorize('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pc.id_plan_cobro, pc.tipo_plan, pc.fecha_inicio, pc.fecha_fin,
              pc.valor_total, pc.valor_pagado, pc.metodo_pago, pc.referencia_pago,
              pc.estado_pago, pc.proxima_fecha_cobro
         FROM plan_cobro pc
         INNER JOIN miembro m ON m.id_miembro = pc.id_miembro
        WHERE pc.id_miembro = $1 AND m.id_gimnasio = $2 AND pc.activo = TRUE
        ORDER BY pc.fecha_fin DESC NULLS LAST, pc.id_plan_cobro DESC
        LIMIT 1`,
      [req.params.id, req.user.gymId]
    );
    return res.json({ plan: rows[0] || null });
  })
);

router.put(
  '/admin/miembros/:id/plan',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(planSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    const d = parsed.data;
    const gymId = req.user.gymId;

    if (new Date(d.fecha_fin) < new Date(d.fecha_inicio)) {
      throw new AppError(400, 'El vencimiento no puede ser anterior al inicio.', 'VALIDATION_ERROR');
    }
    if (d.valor_pagado > d.valor_total) {
      throw new AppError(400, 'Lo pagado no puede superar el valor del plan.', 'VALIDATION_ERROR');
    }

    // El miembro tiene que ser de ESTE gimnasio: el id llega por la URL y no
    // se puede confiar en el.
    const { rows: duenio } = await pool.query(
      'SELECT id_miembro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
      [req.params.id, gymId]
    );
    if (duenio.length === 0) throw new AppError(404, 'Miembro no encontrado.', 'MEMBER_NOT_FOUND');

    // El estado del pago se deduce de los valores; no lo manda el cliente.
    const estado = d.valor_pagado >= d.valor_total && d.valor_total > 0
      ? 'PAGADO'
      : d.valor_pagado > 0 ? 'PARCIAL' : 'PENDIENTE';

    const { rows: actual } = await pool.query(
      `SELECT id_plan_cobro FROM plan_cobro
        WHERE id_miembro = $1 AND activo = TRUE
        ORDER BY fecha_fin DESC NULLS LAST, id_plan_cobro DESC LIMIT 1`,
      [req.params.id]
    );

    let plan;
    if (actual.length > 0) {
      const { rows } = await pool.query(
        `UPDATE plan_cobro
            SET tipo_plan = $1, fecha_inicio = $2, fecha_fin = $3, valor_total = $4,
                valor_pagado = $5, metodo_pago = $6, referencia_pago = $7,
                estado_pago = $8, proxima_fecha_cobro = $9,
                actualizado_por = $10, fecha_actualizacion = NOW()
          WHERE id_plan_cobro = $11
        RETURNING *`,
        [d.tipo_plan, d.fecha_inicio, d.fecha_fin, d.valor_total, d.valor_pagado,
         d.metodo_pago, d.referencia_pago || null, estado, d.proxima_fecha_cobro || null,
         req.user.id, actual[0].id_plan_cobro]
      );
      plan = rows[0];
    } else {
      // Un miembro creado antes de que existiera el plan de cobro no tiene
      // fila: en ese caso se crea en vez de fallar.
      const { rows } = await pool.query(
        `INSERT INTO plan_cobro
           (id_miembro, id_gimnasio, tipo_plan, fecha_inicio, fecha_fin, valor_total,
            valor_pagado, metodo_pago, referencia_pago, estado_pago, proxima_fecha_cobro,
            activo, actualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
        RETURNING *`,
        [req.params.id, gymId, d.tipo_plan, d.fecha_inicio, d.fecha_fin, d.valor_total,
         d.valor_pagado, d.metodo_pago, d.referencia_pago || null, estado,
         d.proxima_fecha_cobro || null, req.user.id]
      );
      plan = rows[0];
    }

    return res.json({ message: 'Plan actualizado.', plan });
  })
);

module.exports = router;
