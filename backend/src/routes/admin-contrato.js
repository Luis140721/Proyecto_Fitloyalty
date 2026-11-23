/**
 * routes/admin-contrato.js
 *
 * Endpoint para que un admin de gimnasio envie el contrato de
 * membresia al miembro via WhatsApp (RQF-13). El texto lo genera
 * lib/mensajes#contratoMembresia con los datos reales de la base
 * (lib/contrato.js): precio total, forma de pago, vigencia, renovacion,
 * congelamiento, terminacion, datos del gimnasio y canal de PQR
 * (RQNF-18, Ley 1480 de 2011).
 *
 *   POST /api/admin/miembros/:id/contrato/enviar
 *     body: { version? }  (se ignora: se registra la version del texto que
 *                          de verdad se genero, CONTRATO_VERSION)
 *     auth: admin o admin_gimnasio
 *     response: { ok, exito, contrato_id, mensaje }
 *     409 CONTRACT_INCOMPLETE si a la base le falta algo que el contrato
 *     tiene que informar (plan, precio, forma de pago, fechas).
 *
 *   GET  /api/admin/miembros/:id/contrato/preview
 *     auth: admin o admin_gimnasio
 *     response: { contrato: '...texto...', secciones, faltantes }
 *     Solo muestra el texto, NO envia nada. Util para revisar antes
 *     de mandar.
 *
 *   GET  /api/admin/miembros/:id/contrato/historial
 *     auth: admin o admin_gimnasio
 *     response: { envios: [...] }
 *     Lista las entregas previas (WhatsApp y app), con el texto entregado.
 *
 * Cada envio se registra en la tabla `contrato_enviado`
 * (migraciones 008 y 020) para que el gym tenga constancia de que
 * entrego los terminos al miembro y de que texto le entrego.
 *
 * Aislamiento: el miembro se busca con el gimnasio del token; si es de
 * otro gimnasio la respuesta es 404, sin decir si existe.
 */

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const pool = require('../db/db');
const { telefonoWhatsapp, CONTRATO_VERSION } = require('../lib/mensajes');
const { armarContrato } = require('../lib/contrato');
const whatsapp = require('../lib/whatsapp');

const router = express.Router({ mergeParams: true });

// --- helpers ---------------------------------------------------------------

function idValido(req, res) {
    const idMiembro = parseInt(req.params.id, 10);
    if (!Number.isFinite(idMiembro) || idMiembro <= 0) {
        res.status(400).json({ ok: false, error: 'ID de miembro invalido' });
        return null;
    }
    return idMiembro;
}

/**
 * Telefono al que se manda el contrato. Si el miembro es menor de edad, el
 * contrato es con su representante legal (RQNF-17): solo va al telefono del
 * representante. Si no lo tiene registrado, no se manda al telefono del menor
 * (observacion 4 del #102): la ruta responde 400 y pide registrarlo.
 */
function telefonoDestino(fila) {
    if (fila.es_menor) {
        return {
            telefono: fila.representante_telefono
                ? telefonoWhatsapp(fila.representante_telefono, fila.codigo_pais_telefono)
                : null,
            a: 'representante',
        };
    }
    return { telefono: telefonoWhatsapp(fila.telefono, fila.codigo_pais_telefono), a: 'miembro' };
}

// --- POST enviar -----------------------------------------------------------

router.post(
    '/:id/contrato/enviar',
    authenticate,
    authorize('admin', 'admin_gimnasio'),
    asyncHandler(async (req, res) => {
        const idMiembro = idValido(req, res);
        if (!idMiembro) return;

        const c = await armarContrato(pool, idMiembro, req.user.gymId);
        if (!c) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        if (c.faltantes.length > 0) {
            return res.status(409).json({
                ok: false,
                code: 'CONTRACT_INCOMPLETE',
                error: `No se puede entregar el contrato: falta ${c.faltantes.join(', ')}.`,
                faltantes: c.faltantes,
            });
        }

        const destino = telefonoDestino(c.fila);
        const tel = destino.telefono;
        if (!tel) {
            return res.status(400).json({ ok: false, error: destino.a === 'representante'
                ? 'El miembro es menor de edad y su representante legal no tiene un telefono valido: registralo en la ficha del miembro. El contrato no se envia al telefono del menor.'
                : 'El miembro no tiene un telefono valido' });
        }

        const texto = c.texto;
        const version = CONTRATO_VERSION;

        // El cliente de WhatsApp es perezoso: se inicializa dentro de
        // sendWhatsAppText. Por eso NO se comprueba isWhatsAppReady() antes de
        // enviar (tras un reinicio siempre daria falso y el contrato nunca saldria);
        // si no esta listo, sendWhatsAppText lanza WHATSAPP_NO_LISTO y abajo se le
        // avisa al admin que escanee el QR de auth en los logs de Render.
        let exito = false;
        let errorMensaje = null;
        let noListo = false;
        try {
            await whatsapp.sendWhatsAppText(tel, texto);
            exito = true;
        } catch (err) {
            exito = false;
            noListo = err.code === 'WHATSAPP_NO_LISTO';
            errorMensaje = noListo
                ? 'Cliente WhatsApp no autenticado (QR sin escanear en logs de Render)'
                : (err.message || 'Error desconocido al enviar WhatsApp');
        }

        // Registrar auditoria, con el texto exacto que se intento entregar
        // (migracion 020: canal y contenido).
        const audit = await pool.query(`
            INSERT INTO contrato_enviado
                (id_miembro, id_gimnasio, enviado_por, telefono_destino,
                 plantilla_version, exito, error_mensaje, canal, contenido)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'WHATSAPP', $8)
            RETURNING id_contrato_enviado, creado_en
        `, [c.fila.id_miembro, c.fila.id_gimnasio, req.user.id || null,
            tel, version, exito, errorMensaje, texto]);

        res.json({
            ok: true,
            exito,
            contrato_id: audit.rows[0].id_contrato_enviado,
            creado_en: audit.rows[0].creado_en,
            telefono: tel,
            destinatario: destino.a,
            version,
            gimnasio_id: c.fila.id_gimnasio,
            mensaje: exito
                ? `Contrato enviado a ${tel}${destino.a === 'representante' ? ' (representante legal)' : ''}`
                : noListo
                    ? 'El cliente de WhatsApp no esta autenticado. Pide a un admin que escanee el QR de autenticacion desde los logs del servidor (Render > Logs). Una vez escaneado, re-envia el contrato.'
                    : `No se pudo enviar. ${errorMensaje || 'Verifica que el cliente de WhatsApp este autenticado en el servidor.'}`,
            cliente_listo: !noListo,
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
        const idMiembro = idValido(req, res);
        if (!idMiembro) return;
        const c = await armarContrato(pool, idMiembro, req.user.gymId);
        if (!c) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        res.json({
            ok: true,
            miembro: { id: c.fila.id_miembro, nombre: c.fila.nombre, telefono: c.fila.telefono },
            version: CONTRATO_VERSION,
            contrato: c.texto,
            secciones: c.secciones,
            faltantes: c.faltantes,
            longitud: c.texto.length,
        });
    })
);

// --- GET historial ---------------------------------------------------------

router.get(
    '/:id/contrato/historial',
    authenticate,
    authorize('admin', 'admin_gimnasio'),
    asyncHandler(async (req, res) => {
        const idMiembro = idValido(req, res);
        if (!idMiembro) return;
        const { rows: duenio } = await pool.query(
            'SELECT id_miembro FROM miembro WHERE id_miembro = $1 AND id_gimnasio = $2',
            [idMiembro, req.user.gymId]
        );
        if (duenio.length === 0) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        const { rows } = await pool.query(`
            SELECT ce.id_contrato_enviado, ce.canal, ce.telefono_destino, ce.plantilla_version,
                   ce.exito, ce.error_mensaje, ce.creado_en, ce.enviado_por, ce.contenido
              FROM contrato_enviado ce
              JOIN miembro m ON m.id_miembro = ce.id_miembro
             WHERE ce.id_miembro = $1 AND m.id_gimnasio = $2 AND ce.id_gimnasio = $2
             ORDER BY ce.creado_en DESC
             LIMIT 50
        `, [idMiembro, req.user.gymId]);
        res.json({ ok: true, total: rows.length, envios: rows });
    })
);

module.exports = router;
