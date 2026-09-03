-- ============================================================================
-- migrations/005_fix_missing_columns.sql
--
-- Migración de emergencia para agregar columnas que faltan de la 004
-- ============================================================================
-- Agregar columna qr_imagen si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'miembro' AND column_name = 'qr_imagen'
    ) THEN
        ALTER TABLE miembro ADD COLUMN qr_imagen TEXT;
    END IF;
END $$;

-- Crear tabla config_gimnasio si no existe
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
