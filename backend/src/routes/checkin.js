/**
 * routes/checkin.js
 *
 * Check-in de miembros (asistencia al gimnasio).
 *
 *   POST /api/admin/checkin   -> registra una entrada (manual o por codigo QR)
 *   GET  /api/admin/checkin   -> historial reciente del gimnasio
 *
 * Handlers con asyncHandler: cualquier rechazo va al errorHandler central.
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

const router = express.Router();

// Clave secreta para descifrar QR (debe ser la misma que en miembros.js)
const QR_ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey';

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

const checkinSchema = z.object({
  codigo:    z.string().optional(),
  documento: z.string().optional(),
  metodo:    z.enum(['QR', 'MANUAL', 'CODIGOBARRAS']).default('MANUAL'),
  observacion: z.string().max(200).optional(),
}).refine((d) => Boolean(d.codigo || d.documento), { message: 'codigo o documento requerido', path: ['codigo'] });

function parse(schema, payload) {
  const result = schema.safeParse(payload || {});
  if (!result.success) return { ok: false, status: 400, error: formatZodError(result.error), issues: result.error.issues };
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// POST /api/admin/checkin
// ---------------------------------------------------------------------------
router.post(
  '/admin/checkin',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const parsed = parse(checkinSchema, req.body);
    if (!parsed.ok) throw new AppError(parsed.status, parsed.error, 'VALIDATION_ERROR', { issues: parsed.issues });
    let { codigo, documento, metodo, observacion } = parsed.data;
    const gymId = req.user.gymId;

    // Descifrar el código QR si está cifrado
    if (codigo) {
      codigo = decryptQrCode(codigo);
    }

    try {
      let miembro;
      
      if (codigo) {
        // Para búsqueda por código QR, necesitamos comparar con el valor descifrado
        // Primero intentamos buscar directamente (por si es un código antiguo sin cifrar)
        const { rows: directMatch } = await pool.query(
          `SELECT id_miembro, nombre, documento, codigo_qr, qr_imagen FROM miembro 
           WHERE id_gimnasio = $1 AND activo = TRUE AND codigo_qr = $2 LIMIT 1`,
          [gymId, codigo]
        );
        
        if (directMatch.length > 0) {
          miembro = directMatch[0];
        } else {
          // Si no encontramos con el código original, buscar todos y descifrar para comparar
          const { rows: allMembers } = await pool.query(
            `SELECT id_miembro, nombre, documento, codigo_qr, qr_imagen FROM miembro 
             WHERE id_gimnasio = $1 AND activo = TRUE`,
            [gymId]
          );
          
          const decryptedMatch = allMembers.find(m => {
            try {
              const decrypted = decryptQrCode(m.codigo_qr);
              return decrypted === codigo;
            } catch (e) {
              return false;
            }
          });
          
          if (decryptedMatch) {
            miembro = decryptedMatch;
          }
        }
        
        if (!miembro) throw new AppError(404, 'Miembro no encontrado en este gimnasio.', 'MEMBER_NOT_FOUND');
      } else if (documento) {
        const { rows: miembros } = await pool.query(
          `SELECT id_miembro, nombre, documento, codigo_qr, qr_imagen FROM miembro 
           WHERE id_gimnasio = $1 AND activo = TRUE AND documento = $2 LIMIT 1`,
          [gymId, documento]
        );
        miembro = miembros[0];
        if (!miembro) throw new AppError(404, 'Miembro no encontrado en este gimnasio.', 'MEMBER_NOT_FOUND');
      } else {
        throw new AppError(400, 'codigo o documento requerido', 'VALIDATION_ERROR');
      }

      // PROTECCIÓN SIMPLE: Bloquear solo duplicados muy cercanos (5 segundos)
      const { rows: recentCheckins } = await pool.query(
        `SELECT id_checkin, fecha_hora 
         FROM checkin 
         WHERE id_miembro = $1 AND id_gimnasio = $2
         AND fecha_hora > NOW() - INTERVAL '5 seconds'
         ORDER BY fecha_hora DESC 
         LIMIT 1`,
        [miembro.id_miembro, gymId]
      );

      if (recentCheckins.length > 0) {
        const timeSinceLastCheckin = Math.floor((new Date() - new Date(recentCheckins[0].fecha_hora)) / 1000);
        console.log(`⏸️ Check-in reciente detectado: hace ${timeSinceLastCheckin}s`);
        throw new AppError(429, `Espera ${5 - timeSinceLastCheckin} segundos antes de escanear nuevamente.`, 'RECENT_CHECKIN');
      }

      // Validar membresia activa
      const { rows: mem } = await pool.query(
        `SELECT estado, fecha_fin FROM membresia
         WHERE id_miembro = $1
         ORDER BY fecha_fin DESC NULLS LAST LIMIT 1`,
        [miembro.id_miembro]
      );
      const m = mem[0];
      const hoy = new Date();
      const sinMembresia = !m;
      const membresiaVencida = m && (m.estado !== 'ACTIVA' || new Date(m.fecha_fin) < hoy);

      const { rows } = await pool.query(
        `INSERT INTO checkin (id_miembro, id_gimnasio, metodo, id_usuario, observacion, valido)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_checkin, fecha_hora, metodo`,
        [miembro.id_miembro, gymId, metodo, req.user.id, observacion || null, !membresiaVencida]
      );

      return res.status(201).json({
        message: membresiaVencida ? 'Membresia no activa. Ingreso registrado con aviso.' : 'Ingreso registrado.',
        checkin: rows[0],
        miembro: { 
          id: miembro.id_miembro, 
          nombre: miembro.nombre, 
          documento: miembro.documento,
          codigo_qr: decryptQrCode(miembro.codigo_qr),
          qr_imagen: miembro.qr_imagen
        },
        membresia: m || null,
        advertencia: sinMembresia ? 'sin-membresia' : membresiaVencida ? 'membresia-vencida' : null,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('[POST /admin/checkin] Error:', err.message);
      throw new AppError(503, 'No pudimos registrar el ingreso. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/admin/checkin  (historial reciente)
// ---------------------------------------------------------------------------
router.get(
  '/admin/checkin',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    try {
      const { rows } = await pool.query(
        `SELECT c.id_checkin, c.fecha_hora, c.metodo, c.valido, c.observacion,
                m.id_miembro, m.nombre, m.documento, m.codigo_qr
         FROM checkin c
         INNER JOIN miembro m ON m.id_miembro = c.id_miembro
         WHERE c.id_gimnasio = $1
         ORDER BY c.fecha_hora DESC
         LIMIT ${limit}`,
        [gymId]
      );
      return res.json({ checkins: rows });
    } catch (err) {
      console.error('[GET /admin/checkin] Error:', err.message);
      throw new AppError(503, 'No pudimos cargar el historial. Intenta de nuevo.', 'DB_UNREACHABLE');
    }
  })
);

module.exports = router;