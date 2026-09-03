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
const { sendMemberQR } = require('../lib/email');

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
  genero: z.enum(['Masculino', 'Femenino', 'Otro', 'Prefiero no decir']).optional(),
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

const updateSchema = z.object({
  nombre:   z.string().min(2).optional(),
  telefono: z.string().min(7).optional(),
  email:    z.string().email().optional().or(z.literal('').transform(() => undefined)),
  activo:   z.boolean().optional(),
  qr_imagen: z.string().optional(),
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

    const where = ['id_gimnasio = $1'];
    const params = [gymId];
    if (!includeInactive) {
      where.push('activo = TRUE');
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      const i = params.length;
      where.push(`(LOWER(nombre) LIKE $${i} OR LOWER(documento) LIKE $${i} OR LOWER(COALESCE(email,'')) LIKE $${i} OR LOWER(codigo_qr) = LOWER($${i + 1}))`);
      params.push(q);
    }

    const offset = page * pageSize;
    try {
      const { rows } = await pool.query(
        `SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro
         FROM miembro
         WHERE ${where.join(' AND ')}
         ORDER BY nombre ASC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );
      const totalQ = await pool.query(
        `SELECT COUNT(*)::int AS total FROM miembro WHERE ${where.join(' AND ')}`,
        params
      );

      return res.json({ miembros: rows, total: totalQ.rows[0].total, page, pageSize });
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
      const { rows: miembroRows } = await pool.query(
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
          await sendMemberQR({
            to: data.email,
            memberName: data.nombre,
            gymName,
            qrCode: codigo_qr_cifrado,
            qrImageUrl: data.qr_imagen || null
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

      // Membresia actual
      const { rows: mem } = await pool.query(
        `SELECT m.estado, m.fecha_inicio, m.fecha_fin, p.nombre AS plan
         FROM membresia m
         LEFT JOIN plan_membresia p ON p.id_plan = m.id_plan
         WHERE m.id_miembro = $1
         ORDER BY m.fecha_fin DESC NULLS LAST
         LIMIT 1`,
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
        'SELECT id_miembro, nombre, documento, telefono, email, codigo_qr, activo, fecha_registro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
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

module.exports = router;