-- ============================================================================
-- 021_indices_como_produccion.sql
--
-- RQNF-05 (varios gimnasios sin perder rendimiento) y RQNF-10 (las migraciones
-- describen el esquema de produccion).
--
-- La base de produccion se creo con ConsultasDB/Query_Inicial_Crear_Tablas.sql,
-- que trae estos indices. Una base creada solo con backend/migrations (Docker,
-- la BD de pruebas, una instalacion nueva) no los tenia, y con muchos gimnasios
-- se nota: con 50 gimnasios de 200 miembros y 30 ingresos cada uno, la lista
-- de miembros tardaba 1,6 s y el dashboard 1,6 s; con los indices, 16 ms y
-- 44 ms de p95 (docs/evidencias/rqnf-05-escalabilidad.md).
--
-- Mismos nombres y columnas que en ConsultasDB. En produccion ya existen, asi
-- que IF NOT EXISTS no hace nada; en las demas bases se crean.
--
-- Cada CREATE INDEX bloquea las escrituras de su tabla hasta el COMMIT, aunque
-- no cree nada. Con lock_timeout, si una tabla esta ocupada al arrancar, la
-- migracion falla en vez de dejar en fila a las demas escrituras: el servidor
-- abre igual y la vuelve a intentar en el siguiente arranque.
-- ============================================================================

SET LOCAL lock_timeout = '5s';

-- Ultimo ingreso de cada miembro (lista de miembros, riesgo, rachas, retos).
CREATE INDEX IF NOT EXISTS idx_checkin_miembro_fecha ON checkin (id_miembro, fecha_hora DESC);
-- Ingresos del gimnasio por fecha (dashboard, horas pico, ingresos de hoy).
CREATE INDEX IF NOT EXISTS idx_checkin_gimnasio_fecha ON checkin (id_gimnasio, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_miembro_gimnasio ON miembro (id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_membresia_miembro ON membresia (id_miembro);
CREATE INDEX IF NOT EXISTS idx_alerta_miembro ON alerta_abandono (id_miembro);
CREATE INDEX IF NOT EXISTS idx_reto_gimnasio ON reto (id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_reto_miembro_reto ON reto_miembro (id_reto);
CREATE INDEX IF NOT EXISTS idx_sesion_usuario ON sesion (id_usuario);
