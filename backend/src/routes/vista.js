/**
 * routes/vista.js -- Endpoints que consumen VISTAS SQL (criterio C6)
 *
 *   GET /api/vista/miembros-activos  -> Lista desde la vista vista_miembros_activos
 *
 * La vista ya esta definida en la base de datos (ver Query_Inicial_Crear_Tablas.sql)
 * y NO expone columnas de ID: trae nombre, documento, telefono, email, codigo_qr,
 * estado de la membresia, fechas y plan. Justo lo que pide el instructor:
 * "todos los campos excepto el ID".
 */
const express = require('express');
const pool    = require('../db/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// --------------------------------------------------------------------------
// GET /api/vista/miembros-activos
// --------------------------------------------------------------------------
/**
 * Devuelve el resultado de la VISTA vista_miembros_activos.
 * Demostramos que el listado sale de una vista SQL, no de una tabla directa.
 */
router.get('/miembros-activos', async (req, res) => {
  const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
  const pageSize = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isNaN(pageSize) ? 10 : Math.min(Math.max(pageSize, 1), 100);
  const offset = page * limit;

  try {
    const totalQuery = await pool.query('SELECT COUNT(*)::int AS total FROM vista_miembros_activos');
    const resultado = await pool.query(
      `SELECT nombre,
              documento,
              telefono,
              email,
              codigo_qr,
              estado_membresia,
              fecha_inicio,
              fecha_fin,
              plan
       FROM vista_miembros_activos
       ORDER BY nombre ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      miembros: resultado.rows,
      total: totalQuery.rows[0].total,
      page,
      pageSize: limit,
    });

  } catch (err) {
    console.error('[GET /vista/miembros-activos] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
