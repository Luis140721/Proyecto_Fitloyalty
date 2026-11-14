-- ============================================================================
-- 014_notificacion_envio_como_produccion.sql
--
-- RQNF-10: una base creada solo con migraciones (Docker) debe quedar igual a
-- produccion en las tablas que el codigo escribe. notificacion y envio_mensaje
-- se crearon en la 002 con otra forma que la de ConsultasDB, que es la de
-- produccion:
--
--   notificacion   Docker: leido, sin id_miembro, titulo VARCHAR(200) y
--                  mensaje opcionales, sin CHECK de tipo, FK con CASCADE.
--                  Produccion: leida, id_miembro (FK), titulo VARCHAR(150) y
--                  mensaje NOT NULL, CHECK de tipo, FK sin CASCADE.
--   envio_mensaje  Docker: canal (texto), mensaje_error, fecha_creacion.
--                  Produccion: id_canal (FK a canal_comunicacion, NOT NULL),
--                  mensaje_copiado NOT NULL, id_alerta, id_plantilla,
--                  enviado_por, id_miembro NOT NULL, indice idx_envio_miembro.
--
-- Con esto el aviso de acceso bloqueado (PR #23) funciona tambien en Docker,
-- y Docker falla igual que produccion donde el codigo todavia no coincide con
-- el esquema real (issue #24: POST /admin/notificaciones/enviado escribe
-- envio_mensaje.canal, que en produccion no existe).
--
-- Como se hace:
--   - Solo se toca una tabla si tiene la forma de Docker: una columna vieja, le
--     falta una de produccion, o tiene a la vez una FK con CASCADE/SET NULL y
--     una columna opcional que en produccion es NOT NULL (ConsultasDB no usa
--     ninguna de las dos). En una base tipo produccion no cambia nada.
--   - La tabla se reconstruye con el DDL exacto de ConsultasDB (mismo orden de
--     columnas y mismos nombres de restricciones), reusando su secuencia, para
--     que pg_dump --schema-only salga identico al de produccion.
--   - No se pierden datos:
--       * notificacion: las filas se copian a la tabla nueva. Lo que no cabe
--         en las reglas de produccion se ajusta (un tipo fuera del CHECK pasa
--         a SISTEMA, un titulo vacio pasa a 'Notificacion', se corta a 150) y
--         la copia exacta queda en notificacion_docker.
--       * envio_mensaje: las filas de Docker no tienen id_canal y esta
--         migracion no crea canales (decision de Luis), asi que no caben en la
--         tabla nueva y quedan completas en envio_mensaje_docker. Si la tabla
--         ya tenia id_canal y mensaje_copiado (una base de produccion alterada
--         a mano, por ejemplo con una columna canal agregada), las filas que
--         cumplen las reglas de la tabla nueva pasan a ella con su mismo id, y
--         solo las demas van a envio_mensaje_docker.
--     Las tablas *_docker solo se crean si les toca alguna fila, y tienen FK a
--     gimnasio con ON DELETE CASCADE para que el borrado de cuenta (Ley 1581)
--     las limpie.
--   - Las columnas viejas de Docker (canal, mensaje_error, fecha_creacion de
--     envio_mensaje; leido de notificacion) no siguen en las tablas: ningun
--     codigo las lee, y el unico que las escribe es el de /enviado (issue #24),
--     que en produccion ya falla.
--
-- Idempotente: una vez reconstruidas, las tablas tienen la forma de
-- produccion y una segunda corrida no hace nada. No depende de 009 a 013.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notificacion
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    forma_docker BOOLEAN;
    filas        INTEGER;
    ajustadas    INTEGER;
    secuencia    TEXT;
    expr_miembro TEXT;
    expr_leida   TEXT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'notificacion' AND column_name = 'leido')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'notificacion' AND column_name = 'leida')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'notificacion' AND column_name = 'id_miembro')
        -- Docker a medio alinear (por ejemplo, con id_miembro y leida agregados a
        -- mano): FK con CASCADE y titulo opcional, dos cosas que produccion no tiene.
        OR (EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'public.notificacion'::regclass AND contype = 'f' AND confdeltype = 'c')
            AND EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'notificacion'
                           AND column_name = 'titulo' AND is_nullable = 'YES'))
      INTO forma_docker;

    IF NOT forma_docker THEN
        RAISE NOTICE '[014] notificacion ya tiene la forma de produccion: sin cambios.';
        RETURN;
    END IF;

    SELECT count(*) INTO filas FROM notificacion;

    -- Expresiones para copiar segun las columnas que tenga la tabla vieja.
    expr_miembro := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                       WHERE table_schema = 'public' AND table_name = 'notificacion' AND column_name = 'id_miembro')
                         THEN 'id_miembro' ELSE 'NULL::integer' END;
    expr_leida := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_schema = 'public' AND table_name = 'notificacion' AND column_name = 'leida')
                       THEN 'leida' ELSE 'leido' END;

    CREATE TEMP TABLE _notificacion_vieja ON COMMIT DROP AS SELECT * FROM notificacion;
    IF filas > 0 THEN
        CREATE TABLE notificacion_docker AS SELECT * FROM notificacion;
        ALTER TABLE notificacion_docker
            ADD CONSTRAINT notificacion_docker_id_gimnasio_fkey
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE;
    END IF;

    -- La secuencia se conserva (y con ella el ultimo id) para la tabla nueva.
    secuencia := pg_get_serial_sequence('public.notificacion', 'id_notificacion');
    IF secuencia IS NOT NULL THEN
        EXECUTE format('ALTER SEQUENCE %s OWNED BY NONE', secuencia);
    END IF;
    DROP TABLE notificacion;
    IF secuencia IS NULL THEN
        CREATE SEQUENCE notificacion_id_notificacion_seq AS integer;
        secuencia := 'public.notificacion_id_notificacion_seq';
    END IF;

    -- DDL de ConsultasDB/Query_Inicial_Crear_Tablas.sql
    EXECUTE format($ddl$
        CREATE TABLE notificacion (
            id_notificacion INTEGER NOT NULL DEFAULT nextval(%L::regclass),
            id_gimnasio INTEGER NOT NULL,
            id_usuario INTEGER,
            id_miembro INTEGER,
            tipo VARCHAR(30) NOT NULL,
            titulo VARCHAR(150) NOT NULL,
            mensaje TEXT NOT NULL,
            leida BOOLEAN NOT NULL DEFAULT FALSE,
            fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id_notificacion),
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
            FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
            FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
            CHECK (tipo IN ('ALERTA', 'RETO', 'CAMPANA', 'SISTEMA'))
        )$ddl$, secuencia);
    EXECUTE format('ALTER SEQUENCE %s OWNED BY notificacion.id_notificacion', secuencia);

    EXECUTE format($cp$
        INSERT INTO notificacion (id_notificacion, id_gimnasio, id_usuario, id_miembro, tipo,
                                  titulo, mensaje, leida, fecha_creacion)
        SELECT id_notificacion, id_gimnasio, id_usuario, %s,
               CASE WHEN tipo IN ('ALERTA', 'RETO', 'CAMPANA', 'SISTEMA') THEN tipo ELSE 'SISTEMA' END,
               LEFT(COALESCE(NULLIF(titulo, ''), 'Notificacion'), 150),
               COALESCE(mensaje, titulo, ''),
               COALESCE(%s, FALSE),
               COALESCE(fecha_creacion, CURRENT_TIMESTAMP)
          FROM _notificacion_vieja$cp$, expr_miembro, expr_leida);

    SELECT count(*) INTO ajustadas FROM _notificacion_vieja
     WHERE tipo NOT IN ('ALERTA', 'RETO', 'CAMPANA', 'SISTEMA')
        OR titulo IS NULL OR titulo = '' OR length(titulo) > 150 OR mensaje IS NULL;
    IF filas > 0 THEN
        RAISE NOTICE '[014] notificacion reconstruida como en produccion: % filas copiadas, % ajustadas (copia exacta en notificacion_docker).',
            filas, ajustadas;
    ELSE
        RAISE NOTICE '[014] notificacion reconstruida como en produccion (estaba vacia).';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- envio_mensaje
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    forma_docker BOOLEAN;
    filas        INTEGER;
    pasadas      INTEGER := 0;
    con_prod     BOOLEAN;
    secuencia    TEXT;
    e_alerta     TEXT;
    e_campana    TEXT;
    e_plantilla  TEXT;
    e_enviado    TEXT;
    e_estado     TEXT;
    e_fecha      TEXT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'canal')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_canal')
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'mensaje_copiado')
        -- Docker a medio alinear: FK con CASCADE o SET NULL y fecha_envio
        -- opcional, dos cosas que produccion no tiene.
        OR (EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'public.envio_mensaje'::regclass AND contype = 'f' AND confdeltype IN ('c', 'n'))
            AND EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'envio_mensaje'
                           AND column_name = 'fecha_envio' AND is_nullable = 'YES'))
      INTO forma_docker;

    IF NOT forma_docker THEN
        RAISE NOTICE '[014] envio_mensaje ya tiene la forma de produccion: sin cambios.';
        RETURN;
    END IF;

    SELECT count(*) INTO filas FROM envio_mensaje;

    -- Si la tabla vieja ya tiene id_canal y mensaje_copiado (produccion alterada
    -- a mano), las filas que cumplen las reglas de la tabla nueva (NOT NULL,
    -- CHECK de estado y FK) pasan a ella con su mismo id. Las demas, y todas las
    -- de Docker, quedan completas en envio_mensaje_docker.
    con_prod := EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_canal')
            AND EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'mensaje_copiado');

    CREATE TEMP TABLE _envio_viejo ON COMMIT DROP AS SELECT * FROM envio_mensaje;
    CREATE TEMP TABLE _envio_pasa (id_envio INTEGER PRIMARY KEY) ON COMMIT DROP;
    IF con_prod THEN
        -- Columnas opcionales: la de la tabla vieja si existe; si no, NULL (o el
        -- default de estado). Sin fecha_envio no hay fecha que pasar.
        e_alerta    := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_alerta')
                            THEN 'v.id_alerta' ELSE 'NULL::integer' END;
        e_campana   := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_campana')
                            THEN 'v.id_campana' ELSE 'NULL::integer' END;
        e_plantilla := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'id_plantilla')
                            THEN 'v.id_plantilla' ELSE 'NULL::integer' END;
        e_enviado   := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'enviado_por')
                            THEN 'v.enviado_por' ELSE 'NULL::integer' END;
        e_estado    := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'estado')
                            THEN 'v.estado' ELSE '''PENDIENTE''' END;
        e_fecha     := CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'envio_mensaje' AND column_name = 'fecha_envio')
                            THEN 'v.fecha_envio' ELSE 'NULL::timestamp' END;
        EXECUTE format($sel$
            INSERT INTO _envio_pasa (id_envio)
            SELECT v.id_envio FROM _envio_viejo v
             WHERE v.id_envio IS NOT NULL AND v.id_gimnasio IS NOT NULL AND v.id_miembro IS NOT NULL
               AND v.id_canal IS NOT NULL AND v.mensaje_copiado IS NOT NULL
               AND %1$s IN ('PENDIENTE', 'ENVIADO', 'FALLIDO') AND %2$s IS NOT NULL
               AND EXISTS (SELECT 1 FROM gimnasio g WHERE g.id_gimnasio = v.id_gimnasio)
               AND EXISTS (SELECT 1 FROM miembro m WHERE m.id_miembro = v.id_miembro)
               AND EXISTS (SELECT 1 FROM canal_comunicacion c WHERE c.id_canal = v.id_canal)
               AND (%3$s IS NULL OR EXISTS (SELECT 1 FROM alerta_abandono a WHERE a.id_alerta = %3$s))
               AND (%4$s IS NULL OR EXISTS (SELECT 1 FROM campana c WHERE c.id_campana = %4$s))
               AND (%5$s IS NULL OR EXISTS (SELECT 1 FROM plantilla_mensaje p WHERE p.id_plantilla = %5$s))
               AND (%6$s IS NULL OR EXISTS (SELECT 1 FROM usuario u WHERE u.id_usuario = %6$s))$sel$,
            e_estado, e_fecha, e_alerta, e_campana, e_plantilla, e_enviado);
        SELECT count(*) INTO pasadas FROM _envio_pasa;
    END IF;

    IF filas > pasadas THEN
        CREATE TABLE envio_mensaje_docker AS
            SELECT e.* FROM envio_mensaje e
             WHERE NOT EXISTS (SELECT 1 FROM _envio_pasa p WHERE p.id_envio = e.id_envio);
        ALTER TABLE envio_mensaje_docker
            ADD CONSTRAINT envio_mensaje_docker_id_gimnasio_fkey
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE;
    END IF;

    secuencia := pg_get_serial_sequence('public.envio_mensaje', 'id_envio');
    IF secuencia IS NOT NULL THEN
        EXECUTE format('ALTER SEQUENCE %s OWNED BY NONE', secuencia);
    END IF;
    DROP TABLE envio_mensaje;
    IF secuencia IS NULL THEN
        CREATE SEQUENCE envio_mensaje_id_envio_seq AS integer;
        secuencia := 'public.envio_mensaje_id_envio_seq';
    END IF;

    -- DDL de ConsultasDB/Query_Inicial_Crear_Tablas.sql
    EXECUTE format($ddl$
        CREATE TABLE envio_mensaje (
            id_envio INTEGER NOT NULL DEFAULT nextval(%L::regclass),
            id_gimnasio INTEGER NOT NULL,
            id_miembro INTEGER NOT NULL,
            id_canal INTEGER NOT NULL,
            id_alerta INTEGER,
            id_campana INTEGER,
            id_plantilla INTEGER,
            mensaje_copiado TEXT NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
            fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            enviado_por INTEGER,
            PRIMARY KEY (id_envio),
            FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
            FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
            FOREIGN KEY (id_canal) REFERENCES canal_comunicacion(id_canal),
            FOREIGN KEY (id_alerta) REFERENCES alerta_abandono(id_alerta),
            FOREIGN KEY (id_campana) REFERENCES campana(id_campana),
            FOREIGN KEY (id_plantilla) REFERENCES plantilla_mensaje(id_plantilla),
            FOREIGN KEY (enviado_por) REFERENCES usuario(id_usuario),
            CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'FALLIDO'))
        )$ddl$, secuencia);
    EXECUTE format('ALTER SEQUENCE %s OWNED BY envio_mensaje.id_envio', secuencia);
    CREATE INDEX IF NOT EXISTS idx_envio_miembro ON envio_mensaje(id_miembro);

    IF pasadas > 0 THEN
        EXECUTE format($cp$
            INSERT INTO envio_mensaje (id_envio, id_gimnasio, id_miembro, id_canal, id_alerta, id_campana,
                                       id_plantilla, mensaje_copiado, estado, fecha_envio, enviado_por)
            SELECT v.id_envio, v.id_gimnasio, v.id_miembro, v.id_canal, %3$s, %4$s, %5$s,
                   v.mensaje_copiado, %1$s, %2$s, %6$s
              FROM _envio_viejo v JOIN _envio_pasa p ON p.id_envio = v.id_envio$cp$,
            e_estado, e_fecha, e_alerta, e_campana, e_plantilla, e_enviado);
        -- Que la secuencia siga despues del mayor id copiado (si es la misma de
        -- antes, ya va mas adelante y no cambia).
        EXECUTE format('SELECT setval(%L, GREATEST((SELECT max(id_envio) FROM envio_mensaje), (SELECT last_value FROM %s)))',
                       secuencia, secuencia);
    END IF;

    IF filas = 0 THEN
        RAISE NOTICE '[014] envio_mensaje reconstruida como en produccion (estaba vacia).';
    ELSIF pasadas = filas THEN
        RAISE NOTICE '[014] envio_mensaje reconstruida como en produccion: las % filas pasaron a la tabla nueva con su mismo id.',
            filas;
    ELSIF pasadas > 0 THEN
        RAISE NOTICE '[014] envio_mensaje reconstruida como en produccion: % filas pasaron a la tabla nueva con su mismo id y % que no cumplen sus reglas quedaron en envio_mensaje_docker.',
            pasadas, filas - pasadas;
    ELSIF con_prod THEN
        RAISE NOTICE '[014] envio_mensaje reconstruida como en produccion: ninguna de las % filas cumple las reglas de la tabla nueva; quedaron en envio_mensaje_docker.',
            filas;
    ELSE
        RAISE NOTICE '[014] envio_mensaje reconstruida como en produccion: % filas de Docker guardadas en envio_mensaje_docker (les falta id_canal o mensaje_copiado, asi que no caben en la tabla nueva).',
            filas;
    END IF;
END $$;
