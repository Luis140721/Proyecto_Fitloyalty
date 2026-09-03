-- ============================================================================
-- migrations/004_extender_miembro_cobros.sql
--
-- Extiende la tabla miembro con campos para el formulario completo
-- y agrega tabla para gestionar planes y cobros detallados
-- ============================================================================

-- Campos adicionales para la tabla miembro
ALTER TABLE miembro 
ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) DEFAULT 'CC',
ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
ADD COLUMN IF NOT EXISTS codigo_pais_telefono VARCHAR(5) DEFAULT '+57',
ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100),
ADD COLUMN IF NOT EXISTS direccion TEXT,
ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(100),
ADD COLUMN IF NOT EXISTS telefono_emergencia VARCHAR(20),
ADD COLUMN IF NOT EXISTS condiciones_medicas TEXT,
ADD COLUMN IF NOT EXISTS alergias TEXT,
ADD COLUMN IF NOT EXISTS objetivo VARCHAR(50),
ADD COLUMN IF NOT EXISTS nivel_experiencia VARCHAR(30),
ADD COLUMN IF NOT EXISTS qr_imagen TEXT, -- Imagen del QR en base64
ADD COLUMN IF NOT EXISTS observaciones TEXT,
ADD COLUMN IF NOT EXISTS acepto_terminos BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS autorizo_datos BOOLEAN DEFAULT FALSE;

-- Tabla de configuración del gimnasio para planes y valores por defecto
CREATE TABLE IF NOT EXISTS config_gimnasio (
    id_config SERIAL PRIMARY KEY,
    id_gimnasio INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    
    -- Planes y precios por defecto
    plan_mensual_valor NUMERIC(10,2) DEFAULT 0,
    plan_trimestral_valor NUMERIC(10,2) DEFAULT 0,
    plan_semestral_valor NUMERIC(10,2) DEFAULT 0,
    plan_anual_valor NUMERIC(10,2) DEFAULT 0,
    plan_clases_suelta_valor NUMERIC(10,2) DEFAULT 0,
    plan_ilimitado_valor NUMERIC(10,2) DEFAULT 0,
    
    -- Configuración de recordatorios
    recordatorio_cobro_activo BOOLEAN DEFAULT TRUE,
    dias_recordatorio_default INTEGER DEFAULT 7,
    
    -- Configuración de días de prueba
    dias_prueba INTEGER DEFAULT 7,
    
    -- Metadatos
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uk_gimnasio_config UNIQUE (id_gimnasio)
);

-- Crear tabla para planes y cobros detallados por miembro
CREATE TABLE IF NOT EXISTS plan_cobro (
    id_plan_cobro SERIAL PRIMARY KEY,
    id_miembro INTEGER NOT NULL REFERENCES miembro(id_miembro) ON DELETE CASCADE,
    id_gimnasio INTEGER NOT NULL REFERENCES gimnasio(id_gimnasio) ON DELETE CASCADE,
    
    -- Información del plan
    tipo_plan VARCHAR(50) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    
    -- Información de cobros
    valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    valor_pagado NUMERIC(10,2) NOT NULL DEFAULT 0,
    metodo_pago VARCHAR(30) DEFAULT 'EFECTIVO',
    referencia_pago VARCHAR(100),
    estado_pago VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    
    -- Recordatorios
    proxima_fecha_cobro DATE,
    activar_recordatorio BOOLEAN DEFAULT FALSE,
    dias_recordatorio INTEGER DEFAULT 7,
    
    -- Metadatos
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por INTEGER REFERENCES usuario(id_usuario),
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_tipo_plan CHECK (tipo_plan IN ('MENSUAL','TRIMESTRAL','SEMESTRAL','ANUAL','CLASES_SUELTAS','ILIMITADO','OTRO')),
    CONSTRAINT chk_metodo_pago CHECK (metodo_pago IN ('EFECTIVO','TRANSFERENCIA','TARJETA','PSE','NEQUI','DAVIPLATA','OTRO')),
    CONSTRAINT chk_estado_pago CHECK (estado_pago IN ('PENDIENTE','PAGADO','PARCIAL'))
);

-- Índices para optimizar consultas de cobros
CREATE INDEX IF NOT EXISTS idx_plan_cobro_miembro ON plan_cobro(id_miembro);
CREATE INDEX IF NOT EXISTS idx_plan_cobro_gimnasio ON plan_cobro(id_gimnasio);
CREATE INDEX IF NOT EXISTS idx_plan_cobro_estado_pago ON plan_cobro(estado_pago);
CREATE INDEX IF NOT EXISTS idx_plan_cobro_fecha_fin ON plan_cobro(fecha_fin);
CREATE INDEX IF NOT EXISTS idx_plan_cobro_proxima_cobro ON plan_cobro(proxima_fecha_cobro) WHERE proxima_fecha_cobro IS NOT NULL;

-- Comentario para documentación
COMMENT ON TABLE plan_cobro IS 'Tabla para gestionar planes de membresía y cobros detallados por miembro';
COMMENT ON COLUMN plan_cobro.tipo_plan IS 'Tipo de plan: MENSUAL, TRIMESTRAL, SEMESTRAL, ANUAL, CLASES_SUELTAS, ILIMITADO, OTRO';
COMMENT ON COLUMN plan_cobro.estado_pago IS 'Estado del pago: PENDIENTE, PAGADO, PARCIAL';
COMMENT ON COLUMN plan_cobro.dias_recordatorio IS 'Días antes del vencimiento para enviar recordatorio de cobro';
