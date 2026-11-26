-- ============================================================================
-- 017_mensajes_comerciales.sql
--
-- RQNF-16 (Ley 2300 de 2023, arts. 2 y 5): aceptacion explicita de los
-- mensajes comerciales y canales por los que el miembro los autoriza.
--
-- La aceptacion es una autorizacion mas del miembro: una fila de
-- autorizacion_miembro (migracion 019) de tipo MENSAJES_COMERCIALES, que la
-- 019 ya dejo reservado. Asi tiene el mismo historial que las demas (fecha,
-- version del texto, canal y quien la registro) y nunca se modifica: aceptar,
-- cambiar los canales o darse de baja agrega otra fila, y la vigente es la
-- ultima.
--
-- Con esta migracion:
--   - autorizacion_miembro.canales_autorizados: por donde acepta los mensajes
--     comerciales (art. 2): WHATSAPP y/o EMAIL. Solo se llena en las filas de
--     MENSAJES_COMERCIALES; una aceptacion sin ningun canal no se admite.
--   - autorizacion_miembro.canal admite ENLACE, ademas de PANEL y APP: la baja
--     con el enlace que va al final de cada mensaje comercial (art. 5).
--
-- Miembros que ya existen: no tienen fila de MENSAJES_COMERCIALES, y sin fila
-- el sistema entiende que NO aceptan mensajes comerciales. No se inventa
-- ninguna aceptacion: la ley exige que sea explicita.
--
-- Orden de las migraciones: corren en orden alfabetico, asi que en una base
-- nueva esta (017) corre ANTES que la 019, que crea autorizacion_miembro; en
-- una base que ya tenia la 019 corre despues. Para que el resultado sea el
-- mismo en los dos casos, aqui se crea la tabla con el mismo DDL de la 019 si
-- todavia no existe (la 019 la encuentra hecha: CREATE TABLE IF NOT EXISTS) y
-- luego se aplican los cambios sobre la tabla, exista desde antes o no.
--
-- Idempotente. Corre igual sobre ConsultasDB y sobre las migraciones de Docker.
-- ============================================================================

-- Mismo DDL de la 019 (sin cambios): solo si la tabla no existe todavia.
CREATE TABLE IF NOT EXISTS autorizacion_miembro (
    id_autorizacion  SERIAL PRIMARY KEY,
    id_miembro       INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio      INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    tipo             VARCHAR(30) NOT NULL,
    otorgada         BOOLEAN NOT NULL,
    version_texto    VARCHAR(20) NOT NULL,
    canal            VARCHAR(10) NOT NULL,
    registrada_por   INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
    detalle          JSONB,
    fecha            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_autorizacion_tipo CHECK (tipo IN (
        'TERMINOS', 'TRATAMIENTO_DATOS', 'DATOS_SENSIBLES',
        'REPRESENTANTE_MENOR', 'MENSAJES_COMERCIALES')),
    CONSTRAINT ck_autorizacion_canal CHECK (canal IN ('PANEL', 'APP'))
);

ALTER TABLE autorizacion_miembro ADD COLUMN IF NOT EXISTS canales_autorizados VARCHAR(20)[];

DO $$
BEGIN
    -- El canal ENLACE: la baja desde el enlace de los mensajes comerciales.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.autorizacion_miembro'::regclass
                      AND conname = 'ck_autorizacion_canal'
                      AND pg_get_constraintdef(oid) LIKE '%ENLACE%') THEN
        ALTER TABLE autorizacion_miembro DROP CONSTRAINT IF EXISTS ck_autorizacion_canal;
        ALTER TABLE autorizacion_miembro
            ADD CONSTRAINT ck_autorizacion_canal CHECK (canal IN ('PANEL', 'APP', 'ENLACE'));
    END IF;

    -- Solo WhatsApp y correo.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.autorizacion_miembro'::regclass
                      AND conname = 'ck_autorizacion_canales') THEN
        ALTER TABLE autorizacion_miembro
            ADD CONSTRAINT ck_autorizacion_canales
            CHECK (canales_autorizados IS NULL
                   OR canales_autorizados <@ ARRAY['WHATSAPP', 'EMAIL']::varchar(20)[]);
    END IF;

    -- Aceptar mensajes comerciales exige al menos un canal.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.autorizacion_miembro'::regclass
                      AND conname = 'ck_autorizacion_comerciales_canal') THEN
        ALTER TABLE autorizacion_miembro
            ADD CONSTRAINT ck_autorizacion_comerciales_canal
            CHECK (tipo <> 'MENSAJES_COMERCIALES' OR otorgada = FALSE
                   OR COALESCE(cardinality(canales_autorizados), 0) > 0);
    END IF;
END $$;
