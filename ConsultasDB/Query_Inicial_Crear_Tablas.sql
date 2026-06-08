BEGIN;

-- =========================================================
-- TABLA: gimnasio
-- =========================================================
CREATE TABLE gimnasio (
    id_gimnasio SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nit VARCHAR(20) UNIQUE,
    direccion VARCHAR(200),
    telefono VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    logo_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TABLA: usuario
-- =========================================================
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol VARCHAR(30) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acceso TIMESTAMP,
    debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE,
    foto_url TEXT,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    CHECK (rol IN ('ADMINISTRADOR', 'RECEPCIONISTA'))
);

-- =========================================================
-- TABLA: sesion
-- =========================================================
CREATE TABLE sesion (
    id_sesion SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL,
    token TEXT NOT NULL,
    ip VARCHAR(45),
    dispositivo VARCHAR(255),
    fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultima_actividad TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CHECK (estado IN ('ACTIVA', 'CERRADA', 'EXPIRADA'))
);

-- =========================================================
-- TABLA: miembro
-- =========================================================
CREATE TABLE miembro (
    id_miembro SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    documento VARCHAR(20) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(150),
    codigo_qr VARCHAR(100) NOT NULL,
    foto_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    UNIQUE (id_gimnasio, documento),
    UNIQUE (id_gimnasio, email),
    UNIQUE (id_gimnasio, codigo_qr)
);

-- =========================================================
-- TABLA: plan_membresia
-- =========================================================
CREATE TABLE plan_membresia (
    id_plan SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    duracion_dias INTEGER NOT NULL,
    precio NUMERIC(10,2) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    UNIQUE (id_gimnasio, nombre),
    CHECK (duracion_dias > 0),
    CHECK (precio >= 0)
);

-- =========================================================
-- TABLA: membresia
-- =========================================================
CREATE TABLE membresia (
    id_membresia SERIAL PRIMARY KEY,
    id_miembro INTEGER NOT NULL,
    id_plan INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(20) NOT NULL,
    fecha_pago DATE,
    estado_pago VARCHAR(20) NOT NULL DEFAULT 'PAGADO',
    observaciones TEXT,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    FOREIGN KEY (id_plan) REFERENCES plan_membresia(id_plan),
    CHECK (estado IN ('ACTIVA', 'VENCIDA', 'CONGELADA')),
    CHECK (estado_pago IN ('PENDIENTE', 'PAGADO', 'ANULADO')),
    CHECK (fecha_fin >= fecha_inicio)
);

-- =========================================================
-- TABLA: pago
-- =========================================================
CREATE TABLE pago (
    id_pago SERIAL PRIMARY KEY,
    id_membresia INTEGER NOT NULL,
    monto NUMERIC(10,2) NOT NULL,
    metodo_pago VARCHAR(30) NOT NULL,
    referencia_pago VARCHAR(100),
    fecha_pago TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'PAGADO',
    registrado_por INTEGER,
    FOREIGN KEY (id_membresia) REFERENCES membresia(id_membresia),
    FOREIGN KEY (registrado_por) REFERENCES usuario(id_usuario),
    CHECK (monto >= 0),
    CHECK (estado IN ('PAGADO', 'PENDIENTE', 'ANULADO'))
);

-- =========================================================
-- TABLA: congelacion_membresia
-- =========================================================
CREATE TABLE congelacion_membresia (
    id_congelacion SERIAL PRIMARY KEY,
    id_membresia INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    motivo TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    registrado_por INTEGER,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_membresia) REFERENCES membresia(id_membresia),
    FOREIGN KEY (registrado_por) REFERENCES usuario(id_usuario),
    CHECK (estado IN ('ACTIVA', 'FINALIZADA', 'CANCELADA')),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- =========================================================
-- TABLA: checkin
-- =========================================================
CREATE TABLE checkin (
    id_checkin SERIAL PRIMARY KEY,
    id_miembro INTEGER NOT NULL,
    id_gimnasio INTEGER NOT NULL,
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metodo VARCHAR(20) NOT NULL,
    id_usuario INTEGER,
    observacion TEXT,
    valido BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CHECK (metodo IN ('QR', 'CODIGOBARRAS', 'MANUAL'))
);

-- =========================================================
-- TABLA: configuracion_gimnasio
-- =========================================================
CREATE TABLE configuracion_gimnasio (
    id_configuracion SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL UNIQUE,
    umbral_alerta_amarilla INTEGER NOT NULL DEFAULT 7,
    umbral_alerta_roja INTEGER NOT NULL DEFAULT 15,
    dias_aviso_vencimiento INTEGER NOT NULL DEFAULT 7,
    horario_apertura TIME,
    horario_cierre TIME,
    canal_principal VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
    tiempo_inactividad_sesion_min INTEGER NOT NULL DEFAULT 30,
    actualizado_por INTEGER,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (actualizado_por) REFERENCES usuario(id_usuario),
    CHECK (canal_principal IN ('EMAIL', 'WHATSAPP')),
    CHECK (umbral_alerta_amarilla > 0),
    CHECK (umbral_alerta_roja > umbral_alerta_amarilla),
    CHECK (dias_aviso_vencimiento >= 0),
    CHECK (tiempo_inactividad_sesion_min > 0)
);

-- =========================================================
-- TABLA: alerta_abandono
-- =========================================================
CREATE TABLE alerta_abandono (
    id_alerta SERIAL PRIMARY KEY,
    id_miembro INTEGER NOT NULL,
    id_gimnasio INTEGER NOT NULL,
    dias_inactivo INTEGER NOT NULL,
    nivel VARCHAR(20) NOT NULL,
    fecha_alerta TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    fecha_gestion TIMESTAMP,
    id_usuario INTEGER,
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CHECK (nivel IN ('AMARILLA', 'ROJA')),
    CHECK (estado IN ('PENDIENTE', 'GESTIONADA', 'IGNORADA')),
    CHECK (dias_inactivo >= 0)
);

-- =========================================================
-- TABLA: canal_comunicacion
-- =========================================================
CREATE TABLE canal_comunicacion (
    id_canal SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    nombre_remitente VARCHAR(100),
    credenciales_json JSONB,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    CHECK (tipo IN ('EMAIL', 'WHATSAPP'))
);

-- =========================================================
-- TABLA: plantilla_mensaje
-- =========================================================
CREATE TABLE plantilla_mensaje (
    id_plantilla SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    contenido TEXT NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creada_por INTEGER,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario),
    UNIQUE (id_gimnasio, nombre)
);

-- =========================================================
-- TABLA: campana
-- =========================================================
CREATE TABLE campana (
    id_campana SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    segmento VARCHAR(50) NOT NULL,
    mensaje TEXT NOT NULL,
    id_plantilla INTEGER,
    tipo_disparo VARCHAR(20) NOT NULL,
    dias_inactividad INTEGER,
    fecha_programada TIMESTAMP,
    fecha_ejecucion TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADA',
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    creada_por INTEGER,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_plantilla) REFERENCES plantilla_mensaje(id_plantilla),
    FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario),
    CHECK (tipo_disparo IN ('AUTOMATICO', 'MANUAL', 'PROGRAMADO')),
    CHECK (estado IN ('PROGRAMADA', 'ENVIADA', 'CANCELADA')),
    CHECK (segmento IN ('INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER', 'ETIQUETA', 'TODOS'))
);

-- =========================================================
-- TABLA: campana_destinatario
-- =========================================================
CREATE TABLE campana_destinatario (
    id_campana_destinatario SERIAL PRIMARY KEY,
    id_campana INTEGER NOT NULL,
    id_miembro INTEGER NOT NULL,
    estado_envio VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    fecha_envio TIMESTAMP,
    FOREIGN KEY (id_campana) REFERENCES campana(id_campana),
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    UNIQUE (id_campana, id_miembro),
    CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'FALLIDO'))
);

-- =========================================================
-- TABLA: envio_mensaje
-- =========================================================
CREATE TABLE envio_mensaje (
    id_envio SERIAL PRIMARY KEY,
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
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    FOREIGN KEY (id_canal) REFERENCES canal_comunicacion(id_canal),
    FOREIGN KEY (id_alerta) REFERENCES alerta_abandono(id_alerta),
    FOREIGN KEY (id_campana) REFERENCES campana(id_campana),
    FOREIGN KEY (id_plantilla) REFERENCES plantilla_mensaje(id_plantilla),
    FOREIGN KEY (enviado_por) REFERENCES usuario(id_usuario),
    CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'FALLIDO'))
);

-- =========================================================
-- TABLA: hito_gamificacion
-- =========================================================
CREATE TABLE hito_gamificacion (
    id_hito SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo_hito VARCHAR(30) NOT NULL,
    valor_objetivo INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    UNIQUE (id_gimnasio, tipo_hito, valor_objetivo),
    CHECK (tipo_hito IN ('RACHA', 'TOTAL_ASISTENCIAS')),
    CHECK (valor_objetivo > 0)
);

-- =========================================================
-- TABLA: hito_miembro
-- =========================================================
CREATE TABLE hito_miembro (
    id_hito_miembro SERIAL PRIMARY KEY,
    id_hito INTEGER NOT NULL,
    id_miembro INTEGER NOT NULL,
    fecha_logro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mostrado_en_checkin BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (id_hito) REFERENCES hito_gamificacion(id_hito),
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    UNIQUE (id_hito, id_miembro)
);

-- =========================================================
-- TABLA: etiqueta_comportamiento
-- =========================================================
CREATE TABLE etiqueta_comportamiento (
    id_etiqueta SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    criterio TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    UNIQUE (id_gimnasio, nombre)
);

-- =========================================================
-- TABLA: miembro_etiqueta
-- =========================================================
CREATE TABLE miembro_etiqueta (
    id_miembro_etiqueta SERIAL PRIMARY KEY,
    id_miembro INTEGER NOT NULL,
    id_etiqueta INTEGER NOT NULL,
    fecha_asignacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    FOREIGN KEY (id_etiqueta) REFERENCES etiqueta_comportamiento(id_etiqueta),
    UNIQUE (id_miembro, id_etiqueta)
);

-- =========================================================
-- TABLA: reto
-- =========================================================
CREATE TABLE reto (
    id_reto SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    meta_asistencias INTEGER NOT NULL,
    recompensa VARCHAR(200),
    segmento_elegible VARCHAR(50) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADO',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    creado_por INTEGER,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (creado_por) REFERENCES usuario(id_usuario),
    CHECK (meta_asistencias > 0),
    CHECK (segmento_elegible IN ('TODOS', 'INACTIVOS', 'NUEVOS', 'PROXIMOS_A_VENCER', 'ETIQUETA')),
    CHECK (estado IN ('PROGRAMADO', 'ACTIVO', 'COMPLETADO', 'CANCELADO')),
    CHECK (fecha_fin >= fecha_inicio)
);

-- =========================================================
-- TABLA: reto_miembro
-- =========================================================
CREATE TABLE reto_miembro (
    id_reto_miembro SERIAL PRIMARY KEY,
    id_reto INTEGER NOT NULL,
    id_miembro INTEGER NOT NULL,
    fecha_inscripcion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'EN_CURSO',
    checkins_acumulados INTEGER NOT NULL DEFAULT 0,
    porcentaje_avance NUMERIC(5,2) NOT NULL DEFAULT 0,
    fecha_completado TIMESTAMP,
    FOREIGN KEY (id_reto) REFERENCES reto(id_reto),
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    UNIQUE (id_reto, id_miembro),
    CHECK (estado IN ('EN_CURSO', 'COMPLETADO', 'CANCELADO')),
    CHECK (checkins_acumulados >= 0),
    CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100)
);

-- =========================================================
-- TABLA: notificacion
-- =========================================================
CREATE TABLE notificacion (
    id_notificacion SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL,
    id_usuario INTEGER,
    id_miembro INTEGER,
    tipo VARCHAR(30) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
    CHECK (tipo IN ('ALERTA', 'RETO', 'CAMPANA', 'SISTEMA'))
);

-- =========================================================
-- TABLA: auditoria
-- =========================================================
CREATE TABLE auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_gimnasio INTEGER,
    tabla_afectada VARCHAR(100) NOT NULL,
    id_registro INTEGER,
    accion VARCHAR(20) NOT NULL,
    id_usuario INTEGER,
    detalle JSONB,
    fecha_evento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gimnasio) REFERENCES gimnasio(id_gimnasio),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PROCESO'))
);

-- =========================================================
-- INDICES
-- =========================================================
CREATE INDEX idx_usuario_gimnasio ON usuario(id_gimnasio);
CREATE INDEX idx_sesion_usuario ON sesion(id_usuario);
CREATE INDEX idx_miembro_gimnasio ON miembro(id_gimnasio);
CREATE INDEX idx_membresia_miembro ON membresia(id_miembro);
CREATE INDEX idx_pago_membresia ON pago(id_membresia);
CREATE INDEX idx_checkin_miembro_fecha ON checkin(id_miembro, fecha_hora DESC);
CREATE INDEX idx_checkin_gimnasio_fecha ON checkin(id_gimnasio, fecha_hora DESC);
CREATE INDEX idx_alerta_miembro ON alerta_abandono(id_miembro);
CREATE INDEX idx_envio_miembro ON envio_mensaje(id_miembro);
CREATE INDEX idx_campana_gimnasio ON campana(id_gimnasio);
CREATE INDEX idx_reto_gimnasio ON reto(id_gimnasio);
CREATE INDEX idx_reto_miembro_reto ON reto_miembro(id_reto);
CREATE INDEX idx_auditoria_tabla_fecha ON auditoria(tabla_afectada, fecha_evento DESC);

-- =========================================================
-- VISTA SQL
-- =========================================================
CREATE OR REPLACE VIEW vista_miembros_activos AS
SELECT
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
    SELECT *
    FROM membresia me2
    WHERE me2.id_miembro = m.id_miembro
    ORDER BY me2.fecha_fin DESC
    LIMIT 1
) me ON TRUE
LEFT JOIN plan_membresia p ON p.id_plan = me.id_plan
WHERE m.activo = TRUE;

-- =========================================================
-- FUNCION REPORTE DE ASISTENCIA
-- =========================================================
CREATE OR REPLACE FUNCTION sp_reporte_asistencia(
    p_id_gimnasio INTEGER,
    p_fecha_inicio DATE,
    p_fecha_fin DATE
)
RETURNS TABLE (
    miembro VARCHAR(100),
    documento VARCHAR(20),
    fecha DATE,
    hora TIME,
    metodo VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.nombre,
        m.documento,
        c.fecha_hora::DATE,
        c.fecha_hora::TIME,
        c.metodo
    FROM checkin c
    INNER JOIN miembro m ON m.id_miembro = c.id_miembro
    WHERE c.id_gimnasio = p_id_gimnasio
      AND c.fecha_hora::DATE BETWEEN p_fecha_inicio AND p_fecha_fin
    ORDER BY c.fecha_hora DESC;
END;
$$;

COMMIT;