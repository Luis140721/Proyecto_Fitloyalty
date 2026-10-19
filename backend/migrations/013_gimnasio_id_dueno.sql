-- ============================================================================
-- 013_gimnasio_id_dueno.sql
--
-- RQF-01 y RQF-22: el dueño del gimnasio queda guardado en gimnasio.id_dueno.
--
-- Hasta ahora el dueño se deducia como "el primer usuario del gimnasio"
-- (MIN(id_usuario)). Eso funciona con el signup, pero nada lo fija: si se
-- borra a mano la fila del dueño, o la herramienta suprema (admin.js) mueve un
-- usuario de gimnasio, el "dueño" pasa al siguiente id, aunque sea un
-- recepcionista. Con esta columna:
--   - el signup (auth.js) la llena con el admin que crea la cuenta;
--   - staff.js la usa para es_dueno y OWNER_PROTECTED, y el DELETE de la cuenta
--     (auth.js) para saber quien puede eliminarla;
--   - si queda en NULL (gimnasio creado por una semilla o dueño borrado), el
--     codigo usa el admin activo mas antiguo del gimnasio, nunca un
--     recepcionista.
--
-- ON DELETE SET NULL: borrar al dueño no bloquea nada y deja la columna en
-- NULL. El borrado de cuenta borra usuario antes que gimnasio, asi que tampoco
-- lo bloquea.
--
-- Idempotente (IF NOT EXISTS y solo llena las filas en NULL).
-- ============================================================================

ALTER TABLE gimnasio ADD COLUMN IF NOT EXISTS id_dueno INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gimnasio_id_dueno_fkey') THEN
        ALTER TABLE gimnasio
            ADD CONSTRAINT gimnasio_id_dueno_fkey
            FOREIGN KEY (id_dueno) REFERENCES usuario(id_usuario) ON DELETE SET NULL;
    END IF;
END $$;

-- Gimnasios que ya existen: el admin activo mas antiguo (en el signup es el
-- primero que se crea). usuario.id_rol no viene en ConsultasDB (en Neon se
-- agrego a mano), por eso se revisa que exista antes de usarla.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'id_rol') THEN
        UPDATE gimnasio g
           SET id_dueno = (SELECT MIN(u.id_usuario) FROM usuario u
                            WHERE u.id_gimnasio = g.id_gimnasio AND u.id_rol = 1 AND u.activo)
         WHERE g.id_dueno IS NULL;
    END IF;
END $$;

-- Usuarios antiguos de Neon sin id_rol: se mira la columna legacy usuario.rol,
-- si existe.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'rol') THEN
        UPDATE gimnasio g
           SET id_dueno = (SELECT MIN(u.id_usuario) FROM usuario u
                            WHERE u.id_gimnasio = g.id_gimnasio AND u.rol = 'ADMINISTRADOR' AND u.activo)
         WHERE g.id_dueno IS NULL;
    END IF;
END $$;
