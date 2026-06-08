-- =========================================================
-- FITLOYALTY - MEGA QUERY DE PRUEBAS
-- Ejecutar bloque por bloque o todo de una vez
-- =========================================================


-- =========================================================
-- 1. CONTEO GENERAL DE TODAS LAS TABLAS
-- =========================================================
SELECT 'gimnasio'                AS tabla, COUNT(*) AS registros FROM gimnasio
UNION ALL SELECT 'usuario',                COUNT(*) FROM usuario
UNION ALL SELECT 'sesion',                 COUNT(*) FROM sesion
UNION ALL SELECT 'miembro',                COUNT(*) FROM miembro
UNION ALL SELECT 'plan_membresia',         COUNT(*) FROM plan_membresia
UNION ALL SELECT 'membresia',              COUNT(*) FROM membresia
UNION ALL SELECT 'pago',                   COUNT(*) FROM pago
UNION ALL SELECT 'congelacion_membresia',  COUNT(*) FROM congelacion_membresia
UNION ALL SELECT 'checkin',                COUNT(*) FROM checkin
UNION ALL SELECT 'configuracion_gimnasio', COUNT(*) FROM configuracion_gimnasio
UNION ALL SELECT 'alerta_abandono',        COUNT(*) FROM alerta_abandono
UNION ALL SELECT 'canal_comunicacion',     COUNT(*) FROM canal_comunicacion
UNION ALL SELECT 'plantilla_mensaje',      COUNT(*) FROM plantilla_mensaje
UNION ALL SELECT 'campana',                COUNT(*) FROM campana
UNION ALL SELECT 'campana_destinatario',   COUNT(*) FROM campana_destinatario
UNION ALL SELECT 'envio_mensaje',          COUNT(*) FROM envio_mensaje
UNION ALL SELECT 'hito_gamificacion',      COUNT(*) FROM hito_gamificacion
UNION ALL SELECT 'hito_miembro',           COUNT(*) FROM hito_miembro
UNION ALL SELECT 'etiqueta_comportamiento',COUNT(*) FROM etiqueta_comportamiento
UNION ALL SELECT 'miembro_etiqueta',       COUNT(*) FROM miembro_etiqueta
UNION ALL SELECT 'reto',                   COUNT(*) FROM reto
UNION ALL SELECT 'reto_miembro',           COUNT(*) FROM reto_miembro
UNION ALL SELECT 'notificacion',           COUNT(*) FROM notificacion
UNION ALL SELECT 'auditoria',              COUNT(*) FROM auditoria
ORDER BY tabla;