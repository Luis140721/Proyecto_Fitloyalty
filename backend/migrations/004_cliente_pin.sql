-- ============================================================================
-- 004_cliente_pin.sql
--
-- Habilita login del MIEMBRO del gimnasio en la app móvil del cliente
-- (Flutter). Hasta ahora la tabla `miembro` no tenía credenciales: solo era
-- gestionada por admin/staff desde el panel web.
--
-- Esta migración agrega:
--   1. pin_hash      -> hash bcrypt del PIN de 4 dígitos que el admin asigna
--                       al crear/editar el miembro (Panel > Miembros > Editar).
--                       NULL = el miembro todavía no puede loguearse en la app.
--   2. pin_set_at    -> fecha en que se asignó el PIN (auditoría / reset).
--   3. app_acceso    -> booleano para apagar el acceso a la app sin borrar el
--                       miembro (ej. moroso reiterado, baja temporal).
--   4. Índice por (id_gimnasio, documento) para que el login sea O(log n)
--      incluso con miles de miembros.
--
-- IMPORTANTE: NO rompe datos existentes. Si tienes miembros ya creados,
-- quedan con pin_hash NULL = "el admin todavía no le asignó PIN".
-- ============================================================================

ALTER TABLE miembro
  ADD COLUMN IF NOT EXISTS pin_hash   TEXT,
  ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS app_acceso BOOLEAN NOT NULL DEFAULT TRUE;

-- Login del cliente es SIEMPRE documento + PIN dentro de su gimnasio.
-- Índice compuesto porque el endpoint /api/cliente/login filtra por ambos.
CREATE INDEX IF NOT EXISTS idx_miembro_gym_documento
  ON miembro (id_gimnasio, documento);
