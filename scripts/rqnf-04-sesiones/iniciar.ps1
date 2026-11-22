# Levanta el entorno aislado de las sesiones de RQNF-04:
#   Postgres en Docker (127.0.0.1:5434) -> backend (3001) -> datos de prueba -> frontend (5173)
# y abre el navegador en el login. No usa produccion ni la base de desarrollo.
$ErrorActionPreference = 'Stop'
$Aqui = $PSScriptRoot
$Repo = Split-Path (Split-Path $Aqui -Parent) -Parent
$Contenedor = 'fl-rqnf04-db'

function Esperar-Url($url, $segundos) {
  for ($i = 0; $i -lt $segundos; $i++) {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { Start-Sleep 1 }
  }
  return $false
}

# 1. Docker Desktop
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Iniciando Docker Desktop...'
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
  if ($LASTEXITCODE -ne 0) { throw 'Docker no arranco. Abre Docker Desktop y vuelve a intentar.' }
}

# 2. Puertos libres
foreach ($puerto in 3001, 5173) {
  if (Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto $puerto esta ocupado. Cierra el backend/frontend de desarrollo (o corre detener.cmd) y vuelve a intentar."
  }
}

# 3. Base de datos (los datos se conservan entre sesiones en el volumen)
$existe = docker ps -a --filter "name=^$Contenedor$" --format '{{.Names}}'
if (-not $existe) {
  Write-Host 'Creando la base de datos de prueba...'
  docker run -d --name $Contenedor -p 127.0.0.1:5434:5432 `
    -v fitloyalty_rqnf04_pgdata:/var/lib/postgresql/data `
    -e POSTGRES_USER=rqnf04 -e POSTGRES_PASSWORD=rqnf04_local -e POSTGRES_DB=fitloyalty_rqnf04 `
    postgres:16.15-alpine | Out-Null
} else {
  docker start $Contenedor | Out-Null
}
for ($i = 0; $i -lt 30; $i++) {
  docker exec $Contenedor pg_isready -U rqnf04 -d fitloyalty_rqnf04 -h 127.0.0.1 *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep 1
}
Write-Host 'Base de datos lista.'

# 4. Backend en su propia ventana (aplica las migraciones al arrancar)
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle = 'FitLoyalty API - RQNF-04 (no cerrar)'; node '$Aqui\iniciar-backend.js'"
if (-not (Esperar-Url 'http://127.0.0.1:3001/api/healthz' 90)) { throw 'El backend no respondio. Revisa su ventana.' }
Write-Host 'Backend listo.'

# 5. Datos de prueba
node "$Aqui\preparar-datos.js"
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar los datos de prueba.' }

# 6. Frontend en su propia ventana
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle = 'FitLoyalty Web - RQNF-04 (no cerrar)'; Set-Location '$Repo\frontend'; `$env:VITE_API_BASE = 'http://localhost:3001/api'; npm run dev -- --port 5173 --strictPort"
if (-not (Esperar-Url 'http://localhost:5173' 90)) { throw 'El frontend no respondio. Revisa su ventana.' }

Write-Host ''
Write-Host 'Entorno listo. Entra con la cuenta de arriba y abre la pantalla Check-in.' -ForegroundColor Green
Write-Host 'Entre una sesion y otra corre limpiar-entre-sesiones.cmd y recarga la pagina (F5).'
Start-Process 'http://localhost:5173/login'
