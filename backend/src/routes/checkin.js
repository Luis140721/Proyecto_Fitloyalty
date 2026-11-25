/**
 * routes/checkin.js
 *
 * Check-in de miembros (asistencia al gimnasio).
 */
const express = require('express');
const crypto  = require('crypto');
const pool    = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { AppError } = require('../lib/errors');
const { requireActiveTrial } = require('../lib/trial');
const { ULTIMO_PLAN } = require('../lib/planes');
const { registrarAccesoBloqueado } = require('../lib/accesos');
const { calcularGamificacion } = require('../lib/gamificacion');
const { actualizarRetos, mensajeRetos } = require('../lib/retos');
const { leerToken, codigoValido } = require('../lib/qr-dinamico');
const { INICIO_HOY } = require('../lib/segmentos');
const { z } = require('zod');
const { formatZodError } = require('../lib/validators');

const router = express.Router();

const QR_ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY || 'FitLoyalty2024SecretKey';
const VENTANA_ANTIREBOTE_SEG = Number(process.env.CHECKIN_VENTANA_SEG || 90);

// scryptSync es deliberadamente lento (decenas de ms). Antes se ejecutaba en
// cada decifrado, y el check-in decifra el QR de CADA miembro del gimnasio:
// con cientos de miembros eso tardaba segundos (RQNF-01). La clave solo
// depende de QR_ENCRYPTION_KEY, asi que se deriva una vez.
const QR_KEY = crypto.scryptSync(QR_ENCRYPTION_KEY, 'salt', 32);

function decryptQrCode(encrypted) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = QR_KEY;
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
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

/**
 * Busca un ingreso del miembro dentro de la ventana del antirrebote y, si no
 * hay, guarda uno. Devuelve { repetido } o { nuevo }.
 *
 * Las dos consultas van en una transaccion que empieza con un bloqueo por
 * miembro (pg_advisory_xact_lock, se suelta solo con el COMMIT o el ROLLBACK).
 * Antes eran dos consultas sueltas: dos peticiones casi a la vez (dos
 * recepciones, o la camara y el teclado) pasaban las dos la busqueda antes de
 * que cualquiera insertara y quedaban dos ingresos (#80). Con el bloqueo, la
 * segunda espera el COMMIT de la primera y encuentra su ingreso. Un indice
 * unico no sirve: la ventana de 90 s es movil.
 */
async function registrarSinRepetir({ idMiembro, gymId, metodo, idUsuario, observacion }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('checkin'), $1)", [idMiembro]);

    const { rows: repetido } = await client.query(
      `SELECT id_checkin, fecha_hora, metodo
         FROM checkin
        WHERE id_miembro = $1
          AND id_gimnasio = $2
          AND fecha_hora > NOW() - ($3 || ' seconds')::interval
        ORDER BY fecha_hora DESC
        LIMIT 1`,
      [idMiembro, gymId, VENTANA_ANTIREBOTE_SEG]
    );
    if (repetido.length > 0) {
      await client.query('COMMIT');
      return { repetido: repetido[0] };
    }

    const { rows } = await client.query(
      `INSERT INTO checkin (id_miembro, id_gimnasio, metodo, id_usuario, observacion, valido)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_checkin, fecha_hora, metodo`,
      [idMiembro, gymId, metodo, idUsuario, observacion || null, true]
    );
    await client.query('COMMIT');
    return { nuevo: rows[0] };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

    // QR dinamico de la app (FLD<id>T<8 digitos>): se reconoce antes de
    // intentar descifrar, porque no es un QR fijo.
    const dinamico = codigo ? leerToken(codigo) : null;
    if (dinamico) metodo = 'QR';

    try {
      let miembro;

      if (dinamico) {
        const { rows } = await pool.query(
          `SELECT id_miembro, nombre, documento, codigo_qr, qr_imagen FROM miembro
            WHERE id_gimnasio = $1 AND activo = TRUE AND id_miembro = $2 LIMIT 1`,
          [gymId, dinamico.idMiembro]
        );
        miembro = rows[0];
        if (!miembro) throw new AppError(404, 'Miembro no encontrado en este gimnasio.', 'MEMBER_NOT_FOUND');
        if (!codigoValido({ idMiembro: miembro.id_miembro, codigoQr: miembro.codigo_qr, codigo: dinamico.codigo })) {
          throw new AppError(400,
            'Este QR ya venció. Pide al miembro que abra la app y muestre el código que tiene ahora en pantalla.',
            'QR_DINAMICO_VENCIDO');
        }
      } else if (codigo) {
        // El gimnasio puede exigir el QR dinamico: entonces el fijo (impreso,
        // en una captura o reenviado) ya no sirve para entrar.
        let soloDinamico = false;
        try {
          const { rows: gym } = await pool.query(
            'SELECT qr_dinamico_obligatorio FROM gimnasio WHERE id_gimnasio = $1',
            [gymId]
          );
          soloDinamico = !!(gym[0] && gym[0].qr_dinamico_obligatorio === true);
        } catch (_) {
          soloDinamico = false;
        }
        if (soloDinamico) {
          throw new AppError(400,
            'Este gimnasio solo acepta el QR que cambia en la app del miembro. El QR fijo o una captura ya no sirven; también puedes registrar con el documento.',
            'QR_ESTATICO_NO_PERMITIDO');
        }

        codigo = decryptQrCode(codigo);
        // CORRECCIÓN: Se quitó "estado" del SELECT porque no existe en la tabla
        const { rows: directMatch } = await pool.query(
          `SELECT id_miembro, nombre, documento, codigo_qr, qr_imagen FROM miembro 
           WHERE id_gimnasio = $1 AND activo = TRUE AND codigo_qr = $2 LIMIT 1`,
          [gymId, codigo]
        );
        
        if (directMatch.length > 0) {
          miembro = directMatch[0];
        } else {
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

      const { rows: mem } = await pool.query(
        `SELECT tipo_plan, fecha_fin, estado_pago, congelado_desde FROM ${ULTIMO_PLAN} pc
          WHERE pc.id_miembro = $1`,
        [miembro.id_miembro]
      );
      const m = mem[0];
      const sinMembresia = !m;
      const membresiaCongelada = !!(m && m.congelado_desde);
      const membresiaVencida = !!(m && m.fecha_fin && new Date(m.fecha_fin) < new Date(new Date().toDateString()));

      // Una membresia congelada no entra, y se le dice que es por eso (no por vencida):
      // aunque su fecha_fin ya haya pasado, la congelacion corre el vencimiento al descongelar.
      if (membresiaCongelada) {
        await registrarAccesoBloqueado(pool, {
          gymId,
          idMiembro: miembro.id_miembro,
          nombre: miembro.nombre,
          motivo: 'CONGELADA',
        });
        return res.status(200).json({
          message: 'Tu membresía está congelada. Pide en recepción que la reactiven para poder ingresar.',
          miembro: {
            id: miembro.id_miembro,
            nombre: miembro.nombre,
            documento: miembro.documento,
            estado: 'CONGELADO',
          },
        });
      }

      // --- INICIO DEL BLOQUEO ABSOLUTO ---
      // Si la base de datos detecta fecha vencida o que no tiene plan, cortamos el acceso
      if (membresiaVencida || sinMembresia) {
        // Avisa al administrador por la campana (RQF-06). No frena la respuesta.
        await registrarAccesoBloqueado(pool, {
          gymId,
          idMiembro: miembro.id_miembro,
          nombre: miembro.nombre,
          motivo: sinMembresia ? 'SIN_PLAN' : 'VENCIDA',
        });
        return res.status(200).json({
          miembro: {
            id: miembro.id_miembro,
            nombre: miembro.nombre,
            documento: miembro.documento,
            estado: 'VENCIDO' // Le enviamos al front la palabra exacta para que active la alerta
          }
        });
      }
      // --- FIN DEL BLOQUEO ABSOLUTO ---

      const { repetido, nuevo } = await registrarSinRepetir({
        idMiembro: miembro.id_miembro,
        gymId,
        metodo,
        idUsuario: req.user.id,
        observacion,
      });

      if (repetido) {
        return res.status(200).json({
          message: `${miembro.nombre} ya registro su ingreso hace un momento.`,
          duplicado: true,
          checkin: repetido,
          miembro: {
            id: miembro.id_miembro,
            nombre: miembro.nombre,
            documento: miembro.documento,
            codigo_qr: decryptQrCode(miembro.codigo_qr),
            qr_imagen: miembro.qr_imagen,
          },
          membresia: m || null,
          advertencia: null,
        });
      }

      // Racha y hitos (RQF-11). No frena el ingreso: si falla, devuelve null.
      const gamificacion = await calcularGamificacion(pool, { gymId, idMiembro: miembro.id_miembro });

      // Retos (RQF-12): inscribe en los de segmento TODOS, suma la asistencia y
      // avisa si se completo alguno. No frena el ingreso: si falla, devuelve [].
      const retos = await actualizarRetos(pool, { gymId, idMiembro: miembro.id_miembro, nombreMiembro: miembro.nombre });

      return res.status(201).json({
        message: 'Ingreso registrado.',
        duplicado: false,
        checkin: nuevo,
        gamificacion,
        retos,
        mensaje_retos: mensajeRetos(retos),
        qr_dinamico: !!dinamico,
        miembro: { 
          id: miembro.id_miembro, 
          nombre: miembro.nombre, 
          documento: miembro.documento,
          codigo_qr: decryptQrCode(miembro.codigo_qr),
          qr_imagen: miembro.qr_imagen
        },
        membresia: m || null,
        advertencia: null,
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
//   ?dia=hoy -> solo los ingresos de hoy (dia de Colombia): "Ingresos de hoy"
// ---------------------------------------------------------------------------
router.get(
  '/admin/checkin',
  authenticate,
  authorize('admin', 'receptionist'),
  requireActiveTrial(pool),
  asyncHandler(async (req, res) => {
    const gymId = req.user.gymId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const soloHoy = req.query.dia === 'hoy' ? `AND c.fecha_hora >= ${INICIO_HOY}` : '';

    try {
      const { rows } = await pool.query(
        `SELECT c.id_checkin, c.fecha_hora, c.metodo, c.valido, c.observacion,
                m.id_miembro, m.nombre, m.documento, m.codigo_qr
         FROM checkin c
         INNER JOIN miembro m ON m.id_miembro = c.id_miembro
         WHERE c.id_gimnasio = $1 ${soloHoy}
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
module.exports.decryptQrCode = decryptQrCode; // expuesto para pruebas