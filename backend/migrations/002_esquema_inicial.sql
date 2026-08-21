-- ============================================================================
-- migrations/002_esquema_inicial.sql
--
-- Crea el esquema base de FitLoyalty (tablas núcleo). Idempotente.
-- Es la columna vertebral de la BD local en Docker Compose. En Render/Neon el
-- esquema ya existe; aqui usamos IF NOT EXISTS para que no falle.
--
-- Tablas:  gimnasio, usuario, miembro, membresia, checkin, plan_membresia,
--          configuracion_gimnasio, rol, campana, envio_mensaje, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gimnasio (
    id_gimnasio  SERIAL PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL,
    nit          VARCHAR(20)  UNIQUE,
    direccion    VARCHAR(200),
    telefono     VARCHAR(20)  NOT NULL,
    email        VARCHAR(150),
    logo_url     TEXT,
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at  TIMESTAMP,
    plan_activo    VARCHAR(20) NOT NULL DEFAULT 'TRIAL'
);

CREATE TABLE IF NOT EXISTS rol (
    id_rol       SERIAL PRIMARY KEY,
    nombre       VARCHAR(30) NOT NULL UNIQUE,
    descripcion  TEXT,
    activo       BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO rol (id_rol, nombre, activo) VALUES
    (1, 'ADMINISTRADOR',  TRUE),
    (2, 'RECEPCIONISTA',  TRUE),
    (3, 'ENTRENADOR',     TRUE)
ON CONFLICT (id_rol) DO NOTHING;
SELECT setval(pg_get_serial_sequence('rol','id_rol'), (SELECT MAX(id_rol) FROM rol));

CREATE TABLE IF NOT EXISTS usuario (
    id_usuario    SERIAL PRIMARY KEY,
    id_gimnasio   INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre        VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    rol           VARCHAR(30)  NOT NULL DEFAULT 'RECEPCIONISTA',
    id_rol        INTEGER      REFERENCES rol(id_rol),
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso TIMESTAMP,
    debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE,
    foto_url      TEXT,
    fecha_creacion TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usuario_gimnasio ON usuario(id_gimnasio);

CREATE TABLE IF NOT EXISTS plan_membresia (
    id_plan        SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    duracion_dias  INTEGER NOT NULL,
    precio         NUMERIC(10,2) NOT NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS miembro (
    id_miembro     SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre         VARCHAR(100) NOT NULL,
    documento      VARCHAR(20)  NOT NULL,
    telefono       VARCHAR(20),
    email          VARCHAR(150),
    codigo_qr      VARCHAR(100) NOT NULL,
    foto_url       TEXT,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membresia (
    id_membresia   SERIAL PRIMARY KEY,
    id_miembro     INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_plan        INTEGER NOT NULL REFERENCES plan_membresia(id_plan),
    fecha_inicio   DATE    NOT NULL,
    fecha_fin      DATE    NOT NULL,
    estado         VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA','VENCIDA','CONGELADA')),
    fecha_pago     DATE,
    estado_pago    VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado_pago IN ('PENDIENTE','PAGADO','ANULADO')),
    observaciones  TEXT,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checkin (
    id_checkin   SERIAL PRIMARY KEY,
    id_miembro   INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio  INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    fecha_hora   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metodo       VARCHAR(20) NOT NULL DEFAULT 'QR'
        CHECK (metodo IN ('QR','CODIGOBARRAS','MANUAL')),
    id_usuario   INTEGER REFERENCES usuario(id_usuario),
    observacion  TEXT,
    valido       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS configuracion_gimnasio (
    id_configuracion    SERIAL PRIMARY KEY,
    id_gimnasio         INTEGER NOT NULL UNIQUE REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    umbral_alerta_amarilla INTEGER NOT NULL DEFAULT 14,
    umbral_alerta_roja     INTEGER NOT NULL DEFAULT 3,
    dias_aviso_vencimiento INTEGER NOT NULL DEFAULT 7,
    horario_apertura    TIME,
    horario_cierre      TIME,
    canal_principal     VARCHAR(20) NOT NULL DEFAULT 'EMAIL'
        CHECK (canal_principal IN ('EMAIL','WHATSAPP')),
    tiempo_inactividad_sesion_min INTEGER NOT NULL DEFAULT 60,
    actualizado_por     INTEGER REFERENCES usuario(id_usuario),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sesion (
    id_sesion              SERIAL PRIMARY KEY,
    id_usuario             INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    token                  TEXT NOT NULL,
    ip                     VARCHAR(45),
    dispositivo            VARCHAR(255),
    fecha_inicio           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultima_actividad TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre           TIMESTAMP,
    estado                 VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA','CERRADA','EXPIRADA'))
);

CREATE TABLE IF NOT EXISTS password_reset (
    id_reset     SERIAL PRIMARY KEY,
    id_usuario   INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    code         VARCHAR(10) NOT NULL,
    expires_at   TIMESTAMP    NOT NULL,
    used         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pago (
    id_pago       SERIAL PRIMARY KEY,
    id_membresia  INTEGER NOT NULL REFERENCES membresia(id_membresia) ON DELETE CASCADE,
    fecha_pago    DATE NOT NULL,
    monto         NUMERIC(10,2) NOT NULL,
    estado        VARCHAR(20) NOT NULL DEFAULT 'PAGADO'
        CHECK (estado IN ('PENDIENTE','PAGADO','ANULADO')),
    metodo_pago   VARCHAR(30) NOT NULL DEFAULT 'EFECTIVO'
        CHECK (metodo_pago IN ('EFECTIVO','TARJETA','TRANSFERENCIA','NEQUI','DAVIPLATA')),
    referencia    VARCHAR(100),
    observaciones TEXT,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pago_membresia ON pago(id_membresia);

CREATE TABLE IF NOT EXISTS notificacion (
    id_notificacion SERIAL PRIMARY KEY,
    id_gimnasio     INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    id_usuario      INTEGER REFERENCES usuario(id_usuario),
    tipo            VARCHAR(30) NOT NULL,
    titulo          VARCHAR(200),
    mensaje         TEXT,
    leido           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plantilla_mensaje (
    id_plantilla   SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre         VARCHAR(100) NOT NULL,
    tipo           VARCHAR(30)  NOT NULL,
    asunto         VARCHAR(200),
    cuerpo         TEXT         NOT NULL,
    activa         BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campana (
    id_campana     SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre         VARCHAR(150) NOT NULL,
    tipo           VARCHAR(30)  NOT NULL,
    estado         VARCHAR(20)  NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','PROGRAMADA','ENVIADA','CANCELADA')),
    fecha_programada TIMESTAMP,
    fecha_envio    TIMESTAMP,
    creado_por     INTEGER REFERENCES usuario(id_usuario),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campana_destinatario (
    id_destinatario SERIAL PRIMARY KEY,
    id_campana      INTEGER NOT NULL REFERENCES campana(id_campana) ON DELETE CASCADE,
    id_miembro      INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    estado          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO','VISTO','CLICK')),
    UNIQUE (id_campana, id_miembro)
);

CREATE TABLE IF NOT EXISTS envio_mensaje (
    id_envio      SERIAL PRIMARY KEY,
    id_gimnasio   INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    id_campana    INTEGER REFERENCES campana(id_campana) ON DELETE SET NULL,
    id_miembro    INTEGER REFERENCES miembro(id_miembro) ON DELETE SET NULL,
    canal         VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP','SMS')),
    estado        VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO')),
    mensaje_error TEXT,
    fecha_envio   TIMESTAMP,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS congelacion_membresia (
    id_congelacion  SERIAL PRIMARY KEY,
    id_membresia    INTEGER NOT NULL REFERENCES membresia(id_membresia) ON DELETE CASCADE,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    motivo          TEXT,
    solicitada_por  INTEGER REFERENCES usuario(id_usuario),
    fecha_creacion  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerta_abandono (
    id_alerta        SERIAL PRIMARY KEY,
    id_gimnasio      INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    id_miembro       INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    nivel            VARCHAR(20) NOT NULL DEFAULT 'AMARILLA'
        CHECK (nivel IN ('AMARILLA','ROJA')),
    dias_inactividad INTEGER NOT NULL DEFAULT 0,
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    atendido_por     INTEGER REFERENCES usuario(id_usuario),
    fecha_creacion   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hito_gamificacion (
    id_hito     SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre      VARCHAR(120) NOT NULL,
    descripcion TEXT,
    puntos      INTEGER NOT NULL DEFAULT 0,
    icono       VARCHAR(50),
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hito_miembro (
    id_hito_miembro SERIAL PRIMARY KEY,
    id_miembro      INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_hito         INTEGER NOT NULL REFERENCES hito_gamificacion(id_hito) ON DELETE CASCADE,
    id_visita       INTEGER,
    puntos_otorgados INTEGER NOT NULL DEFAULT 0,
    fecha_otorgado  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_miembro, id_hito)
);

CREATE TABLE IF NOT EXISTS etiqueta_comportamiento (
    id_etiqueta   SERIAL PRIMARY KEY,
    id_gimnasio   INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre        VARCHAR(80) NOT NULL,
    color         VARCHAR(20),
    descripcion   TEXT,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS miembro_etiqueta (
    id_miembro_etiqueta SERIAL PRIMARY KEY,
    id_miembro          INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_etiqueta         INTEGER NOT NULL REFERENCES etiqueta_comportamiento(id_etiqueta) ON DELETE CASCADE,
    fecha_asignacion    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_miembro, id_etiqueta)
);

CREATE TABLE IF NOT EXISTS reto (
    id_reto        SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    nombre         VARCHAR(120) NOT NULL,
    descripcion    TEXT,
    fecha_inicio   DATE NOT NULL,
    fecha_fin      DATE NOT NULL,
    tipo           VARCHAR(30) NOT NULL DEFAULT 'CHECKINS',
    meta           INTEGER NOT NULL DEFAULT 1,
    premio         TEXT,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reto_miembro (
    id_reto_miembro SERIAL PRIMARY KEY,
    id_reto         INTEGER NOT NULL REFERENCES reto(id_reto) ON DELETE CASCADE,
    id_miembro      INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    progreso        INTEGER NOT NULL DEFAULT 0,
    completado      BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_completado TIMESTAMP,
    UNIQUE (id_reto, id_miembro)
);

CREATE TABLE IF NOT EXISTS canal_comunicacion (
    id_canal       SERIAL PRIMARY KEY,
    id_gimnasio    INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('EMAIL','WHATSAPP','SMS')),
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    configuracion   JSONB,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
