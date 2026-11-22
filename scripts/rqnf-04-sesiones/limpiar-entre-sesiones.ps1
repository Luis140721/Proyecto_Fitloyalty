# Borra los ingresos (y los logros que generaron) del miembro de prueba 79123456,
# para que cada participante empiece desde el mismo estado. Solo toca la base
# aislada de las sesiones, nunca produccion.
$ErrorActionPreference = 'Stop'
$sql = @"
WITH m AS (SELECT id_miembro FROM miembro WHERE documento = '79123456'),
     h AS (DELETE FROM hito_miembro WHERE id_miembro IN (SELECT id_miembro FROM m) RETURNING 1),
     c AS (DELETE FROM checkin WHERE id_miembro IN (SELECT id_miembro FROM m) RETURNING 1)
SELECT (SELECT count(*) FROM c) AS ingresos_borrados, (SELECT count(*) FROM h) AS logros_borrados;
"@
docker exec fl-rqnf04-db psql -U rqnf04 -d fitloyalty_rqnf04 -c $sql
if ($LASTEXITCODE -ne 0) { throw 'No se pudo limpiar. ¿Esta corriendo el entorno (iniciar.cmd)?' }
Write-Host 'Listo. Recarga la pantalla Check-in (F5) antes de la siguiente sesion.' -ForegroundColor Green
