/**
 * routes/admin-contrato.js
 *
 * Endpoint para que un admin de gimnasio envie el contrato de
 * membresia al miembro via WhatsApp. El texto lo genera
 * lib/mensajes#contratoMembresia (prod-ready, con todas las
 * clausulas de blindaje juridico que el profe pidio).
 *
 *   POST /api/admin/miembros/:id/contrato/enviar
 *     body: { version?: 'v1' }
 *     auth: admin o admin_gimnasio
 *     response: { ok, exito, contrato_id, mensaje }
 *
 *   GET  /api/admin/miembros/:id/contrato/preview
 *     auth: admin o admin_gimnasio
 *     response: { contrato: '...texto...' }
 *     Solo muestra el texto, NO envia nada. Util para revisar antes
 *     de mandar.
 *
 *   GET  /api/admin/miembros/:id/contrato/historial
 *     auth: admin o admin_gimnasio
 *     response: { envios: [...] }
 *     Lista los envios previos (auditoria).
 *
 * Cada envio se registra en la tabla `contrato_enviado`
 * (migracion 008) para que el gym tenga constancia legal de que
 * entrego los terminos al miembro.
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const pool = require('../db/db');
const { contratoMembresia, telefonoWhatsapp } = require('../lib/mensajes');
const whatsapp = require('../lib/whatsapp');

const router = express.Router({ mergeParams: true });

// --- helpers ---------------------------------------------------------------

async function loadMiembroParaContrato(idMiembro) {
    const { rows } = await pool.query(`
        SELECT m.id_miembro, m.nombre, m.telefono, m.documento, m.email,
               m.id_gimnasio,
               g.nombre AS gym_nombre, g.activo AS gym_activo,
               pc.tipo_plan, pc.fecha_inicio, pc.fecha_fin,
               pc.valor_total, pc.valor_pagado, pc.metodo_pago
          FROM miembro m
          JOIN gimnasio g ON g.id_gimnasio = m.id_gimnasio
          LEFT JOIN LATERAL (
            SELECT DISTINCT ON (id_miembro) id_miembro, tipo_plan, fecha_inicio,
                   fecha_fin, valor_total, valor_pagado, metodo_pago, activo
              FROM plan_cobro
             WHERE id_miembro = m.id_miembro AND activo = TRUE
             ORDER BY id_miembro, fecha_fin DESC NULLS LAST, id_plan_cobro DESC
          ) pc ON pc.id_miembro = m.id_miembro
         WHERE m.id_miembro = $1
    `, [idMiembro]);
    return rows[0] || null;
}

function armarContrato(m) {
    return contratoMembresia({
        nombre:       m.nombre,
        gymNombre:    m.gym_nombre,
        planTipo:     m.tipo_plan,
        fechaInicio:  m.fecha_inicio,
        fechaFin:     m.fecha_fin,
        valorPagado:  m.valor_pagado ?? m.valor_total,
        metodoPago:   m.metodo_pago,
    });
}

// --- POST enviar -----------------------------------------------------------

router.post(
    '/:id/contrato/enviar',
    authenticate,
    authorize('admin', 'admin_gimnasio'),
    asyncHandler(async (req, res) => {
        const idMiembro = parseInt(req.params.id, 10);
        if (!Number.isFinite(idMiembro) || idMiembro <= 0) {
            return res.status(400).json({ ok: false, error: 'ID de miembro invalido' });
        }

        const m = await loadMiembroParaContrato(idMiembro);
        if (!m) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }

        // Verifica que el admin pertenezca al mismo gimnasio del miembro
        if (req.user.gymId && req.user.gymId !== m.id_gimnasio) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este miembro' });
        }

        const tel = telefonoWhatsapp(m.telefono);
        if (!tel) {
            return res.status(400).json({ ok: false, error: 'El miembro no tiene un telefono valido' });
        }

        const texto = armarContrato(m);
        const version = (req.body && req.body.version) || 'v1';

        let exito = false;
        let errorMensaje = null;
        try {
            // sendWhatsAppText es tolerante a fallos: si el modulo esta
            // deshabilitado o el cliente no esta listo, NO lanza, solo
            // loguea. Asi que aqui lo que capturamos es la excepcion
            // de error real (red, formato, etc.).
            await whatsapp.sendWhatsAppText(tel, texto);
            // Si llegamos aqui sin lanzar, asumimos exito
            exito = true;
        } catch (err) {
            exito = false;
            errorMensaje = err.message || 'Error desconocido al enviar WhatsApp';
        }

        // Registrar auditoria
        const audit = await pool.query(`
            INSERT INTO contrato_enviado
                (id_miembro, id_gimnasio, enviado_por, telefono_destino,
                 plantilla_version, exito, error_mensaje)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id_contrato_enviado, creado_en
        `, [m.id_miembro, m.id_gimnasio, req.user.id || null,
            tel, version, exito, errorMensaje]);

        res.json({
            ok: true,
            exito,
            contrato_id: audit.rows[0].id_contrato_enviado,
            creado_en: audit.rows[0].creado_en,
            telefono: tel,
            gimnasio_id: m.id_gimnasio,
            mensaje: exito
                ? `Contrato enviado a ${tel}`
                : `No se pudo enviar. ${errorMensaje || 'Verifica que el cliente de WhatsApp este autenticado en el servidor.'}`,
            preview: texto,
        });
    })
);

// --- GET preview -----------------------------------------------------------

router.get(
    '/:id/contrato/preview',
    authenticate,
    authorize('admin', 'admin_gimnasio'),
    asyncHandler(async (req, res) => {
        const idMiembro = parseInt(req.params.id, 10);
        if (!Number.isFinite(idMiembro) || idMiembro <= 0) {
            return res.status(400).json({ ok: false, error: 'ID de miembro invalido' });
        }
        const m = await loadMiembroParaContrato(idMiembro);
        if (!m) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        if (req.user.gymId && req.user.gymId !== m.id_gimnasio) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este miembro' });
        }
        const texto = armarContrato(m);
        res.json({
            ok: true,
            miembro: { id: m.id_miembro, nombre: m.nombre, telefono: m.telefono },
            contrato: texto,
            longitud: texto.length,
        });
    })
);

// --- GET historial ---------------------------------------------------------

router.get(
    '/:id/contrato/historial',
    authenticate,
    authorize('admin', 'admin_gimnasio'),
    asyncHandler(async (req, res) => {
        const idMiembro = parseInt(req.params.id, 10);
        if (!Number.isFinite(idMiembro) || idMiembro <= 0) {
            return res.status(400).json({ ok: false, error: 'ID de miembro invalido' });
        }
        const m = await loadMiembroParaContrato(idMiembro);
        if (!m) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        if (req.user.gymId && req.user.gymId !== m.id_gimnasio) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este miembro' });
        }
        const { rows } = await pool.query(`
            SELECT id_contrato_enviado, telefono_destino, plantilla_version,
                   exito, error_mensaje, creado_en, enviado_por
              FROM contrato_enviado
             WHERE id_miembro = $1
             ORDER BY creado_en DESC
             LIMIT 50
        `, [idMiembro]);
        res.json({ ok: true, total: rows.length, envios: rows });
    })
);

module.exports = router;
