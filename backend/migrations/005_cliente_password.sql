-- ============================================================================
-- 005_cliente_password.sql
--
-- Cambia el login del cliente (app movil) de PIN de 4 digitos a
-- CONTRASENA. La contrasena es mas segura que un PIN y es lo que el
-- usuario decidio despues de probar la primera version.
--
-- Esta migracion agrega:
--   1. password_hash       -> hash bcrypt de la contrasena del miembro
--   2. password_set_at     -> fecha en que se asigno/cambio la contrasena
--
-- IMPORTANTE: NO borra pin_hash ni pin_set_at para mantener retrocompatibilidad
-- temporal. Una vez todos los miembros tengan contrasena, se podra hacer una
-- migracion 006 para limpiar las columnas de PIN.
--
-- El indice idx_miembro_gym_documento creado en la migracion 004 sigue siendo
-- util para busquedas por documento. Para login por telefono agregamos un
-- indice especifico.
-- ============================================================================

ALTER TABLE miembro
  ADD COLUMN IF NOT EXISTS password_hash   TEXT,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP;

-- Login del cliente es por telefono dentro de su gimnasio.
-- Indice compuesto porque el endpoint /api/cliente/login filtra por ambos.
CREATE INDEX IF NOT EXISTS idx_miembro_gym_telefono
  ON miembro (id_gimnasio, telefono);
