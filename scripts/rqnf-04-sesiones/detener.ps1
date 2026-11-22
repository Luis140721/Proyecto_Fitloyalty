# Detiene el backend, el frontend y la base de las sesiones de RQNF-04.
# Los datos de prueba se conservan; para borrarlos del todo:
#   docker rm -f fl-rqnf04-db; docker volume rm fitloyalty_rqnf04_pgdata
foreach ($puerto in 3001, 5173) {
  Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
docker stop fl-rqnf04-db *> $null
Write-Host 'Entorno detenido. Puedes cerrar las ventanas de la API y la Web.'
