# Registra en GitHub Issues la severidad y el estado de los defectos de
# docs/pruebas/defectos.md, y crea el issue del defecto D-10 (CP-12).
#
# Requisitos (una vez):
#   winget install GitHub.cli
#   gh auth login
#
# Uso, desde la raiz del repo:
#   powershell -ExecutionPolicy Bypass -File docs/pruebas/registrar-defectos.ps1
#
# Se puede correr mas de una vez: las etiquetas se crean con --force y el issue
# de D-10 solo se crea si no existe uno con el mismo titulo.
$ErrorActionPreference = 'Stop'
# Lee bien las tildes que devuelve gh (etiquetas como «severidad: crítica»).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Repo = 'Luis140721/Proyecto_Fitloyalty'

gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'Primero inicia sesion: gh auth login' }

# 1. Etiquetas de severidad y estado
$etiquetas = @(
  @('severidad: crítica', 'b60205', 'Pérdida o corrupción de datos, o la función principal no se puede usar'),
  @('severidad: alta',    'd93f0b', 'Una función principal falla o deja datos inconsistentes, con alternativa'),
  @('severidad: media',   'fbca04', 'Una función secundaria falla o un error se reporta mal'),
  @('severidad: baja',    'c2e0c6', 'Cosmético o de mensajes, sin efecto en los datos'),
  @('estado: abierto',       'ededed', 'Detectado, sin corrección todavía'),
  @('estado: en corrección', '1d76db', 'Hay un PR que lo corrige, sin fusionar'),
  @('estado: corregido',     '5319e7', 'Corrección fusionada, falta re-ejecutar la prueba'),
  @('estado: verificado',    '0e8a16', 'La prueba de regresión se re-ejecutó y pasa')
)
foreach ($e in $etiquetas) {
  gh label create $e[0] --repo $Repo --color $e[1] --description $e[2] --force | Out-Null
}
Write-Host 'Etiquetas listas.'

function Set-Defecto($numero, $severidad, $estado) {
  $actual = gh issue view $numero --repo $Repo --json labels --jq '.labels[].name'
  $quitar = @($actual | Where-Object { $_ -like 'severidad:*' -or $_ -like 'estado:*' })
  $argumentos = @('issue', 'edit', $numero, '--repo', $Repo, '--add-label', "bug,severidad: $severidad,estado: $estado")
  foreach ($q in $quitar) {
    if ($q -ne "severidad: $severidad" -and $q -ne "estado: $estado") { $argumentos += @('--remove-label', $q) }
  }
  gh @argumentos | Out-Null
  Write-Host "#$numero -> severidad: $severidad, estado: $estado"
}

# 2. Severidad y estado de los defectos registrados (D-01 a D-09)
Set-Defecto 24  'alta'  'verificado'
Set-Defecto 80  'alta'  'verificado'
Set-Defecto 87  'alta'  'abierto'
Set-Defecto 95  'alta'  'corregido'
Set-Defecto 89  'media' 'abierto'
Set-Defecto 98  'media' 'abierto'
Set-Defecto 99  'media' 'abierto'
Set-Defecto 111 'media' 'abierto'
Set-Defecto 88  'baja'  'abierto'

# 3. D-10: el issue del caso CP-12
$titulo = 'El alta de miembro con un nombre de 101 caracteres responde 503 en vez de 400'
# Se filtra el titulo aqui y no con --search: PowerShell 5.1 parte las comillas
# internas al pasarlas a gh.
$existe = gh issue list --repo $Repo --state all --label bug --limit 200 --json number,title |
  ConvertFrom-Json | Where-Object { $_.title -eq $titulo } | Select-Object -First 1 -ExpandProperty number
if (-not $existe) {
  $cuerpo = @'
**Detectado por:** caso CP-12 de `docs/pruebas/matriz-casos-prueba.md`, colección Postman ejecutada con Newman el 2026-11-22 sobre `develop` (`f3a1a71`), en el ambiente de pruebas (PostgreSQL 16, `127.0.0.1:5433`).

**Pasos**
1. Iniciar sesión como administrador.
2. `POST /api/admin/miembros` con `nombre` de 101 caracteres (por ejemplo `"N" * 101`), `documento` y `telefono` válidos.

**Esperado:** 400 `VALIDATION_ERROR` («El nombre no puede tener más de 100 caracteres»), sin consultar la base.
**Obtenido:** 503 `DB_UNREACHABLE` («No pudimos crear el miembro. Intenta de nuevo.»). PostgreSQL rechaza el valor porque `miembro.nombre` es `VARCHAR(100)`, y la ruta convierte el error en 503 (ver también #99).

**Severidad:** media: no se pierden datos, pero la persona ve un error de conexión falso y reintenta sin éxito.

**Corrección:** el PR #83 (Santiago) valida el largo de `nombre`, `documento`, `telefono` y `email`. Re-ejecutado CP-01 a CP-14 contra la rama del PR (`9e2e061`): CP-12 responde 400 y los otros 13 casos siguen pasando. Falta fusionar el #83 y re-ejecutar la colección en `develop`.

Detalle del ciclo: `docs/pruebas/defectos.md` (D-10).
'@
  $url = gh issue create --repo $Repo --title $titulo --body $cuerpo --label 'bug,severidad: media,estado: en corrección'
  Write-Host "D-10 creado: $url"
} else {
  Set-Defecto $existe 'media' 'en corrección'
  Write-Host "D-10 ya existia: #$existe"
}

# 4. Comentario de verificación en #95 (una sola vez)
$marca = 'Verificación del 2026-11-22 (docs/pruebas/defectos.md, D-04)'
$comentarios = gh issue view 95 --repo $Repo --json comments --jq '.comments[].body'
if (-not ($comentarios -match [regex]::Escape($marca))) {
  $texto = @"
$marca

El alta ya guarda miembro, plan y autorizaciones en una sola transacción desde el #102. Lo verifiqué con la prueba de integración nueva ``backend/tests/integracion/alta-miembro-atomica.test.js``, que hace fallar el INSERT en ``plan_cobro`` con un trigger de la BD de pruebas:

- Si falla el plan, el API no responde 201 y no quedan miembro, plan ni autorizaciones.
- Al quitar la falla, el reintento con el mismo documento crea el miembro (ya no choca con el 409).

Resultado en ``develop`` (``f3a1a71``): 2 de 2. Propongo cerrar este issue cuando se fusione el PR que trae la prueba.
"@
  gh issue comment 95 --repo $Repo --body $texto | Out-Null
  Write-Host 'Comentario de verificación agregado en #95.'
}

Write-Host ''
Write-Host 'Listo. Revisa: https://github.com/Luis140721/Proyecto_Fitloyalty/issues?q=label%3Abug' -ForegroundColor Green
