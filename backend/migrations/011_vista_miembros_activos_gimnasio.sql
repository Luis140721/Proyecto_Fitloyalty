-- ============================================================================
-- 011_vista_miembros_activos_gimnasio.sql
--
-- RQNF-05 (aislamiento entre gimnasios): vista_miembros_activos no tenia
-- columna de gimnasio, asi que GET /api/vista/miembros-activos devolvia los
-- miembros (con telefono y correo) de TODOS los gimnasios. Se recrea la vista
-- con id_gimnasio para poder filtrar por el gimnasio del token.
--
-- Se hace DROP + CREATE (y no CREATE OR REPLACE) para que funcione sin
-- importar si la vista ya existia con otra forma o la creo otra migracion.
-- Nada mas depende de esta vista.
-- ============================================================================

DROP VIEW IF EXISTS vista_miembros_activos;

CREATE VIEW vista_miembros_activos AS
SELECT
    m.id_gimnasio,
    m.nombre,
    m.documento,
    m.telefono,
    m.email,
    m.codigo_qr,
    me.estado AS estado_membresia,
    me.fecha_inicio,
    me.fecha_fin,
    p.nombre AS plan
FROM miembro m
LEFT JOIN LATERAL (
    SELECT me2.id_membresia, me2.id_miembro, me2.id_plan,
           me2.fecha_inicio, me2.fecha_fin, me2.estado
      FROM membresia me2
     WHERE me2.id_miembro = m.id_miembro
     ORDER BY me2.fecha_fin DESC
     LIMIT 1
) me ON TRUE
LEFT JOIN plan_membresia p ON p.id_plan = me.id_plan
WHERE m.activo = TRUE;
