# Evidencia RQNF-02: disponibilidad del backend

**Responsable:** Daniel

**Rama:** `docs/rqnf-02-disponibilidad`

**Servicio:** FitLoyalty API en Render

**URL monitoreada:** https://fitloyalty-api.onrender.com/api/healthz

**Frecuencia requerida:** cada 5 minutos

## Criterio de disponibilidad

Una comprobación cuenta como exitosa si el monitor externo recibe HTTP `200` y
el cuerpo contiene `"status":"ok"`. Los errores HTTP, tiempos de espera y
respuestas sin ese estado cuentan como fallos.

El porcentaje del período se calcula así:

```text
comprobaciones exitosas / comprobaciones totales * 100
```

El endpoint `/api/healthz` verifica que la API responda; no comprueba la
conexión a PostgreSQL. Por ello, este porcentaje representa disponibilidad de
la API, no disponibilidad de todos sus servicios dependientes.

## Monitor programado

El workflow [availability-monitor.yml](../../.github/workflows/availability-monitor.yml)
consulta el endpoint con `GET` cada 5 minutos y también admite ejecución
manual. La comprobación se considera exitosa solo si recibe HTTP `200` y el
cuerpo contiene `"status":"ok"`; los timeouts, errores HTTP y respuestas sin
ese estado hacen fallar la ejecución y quedan visibles en el historial de
GitHub Actions. No requiere secretos ni permisos de escritura del repositorio.

**Estado:** implementado en la rama `docs/rqnf-02-disponibilidad`. GitHub solo
ejecuta los eventos `schedule` desde la rama predeterminada, así que el sondeo
periódico empezará después de integrar este workflow en `develop`. La hora del
cron es UTC; las ejecuciones programadas pueden retrasarse por carga de GitHub.
El historial de ejecuciones de Actions es la fuente para recopilar los datos
del período; una ejecución manual debe excluirse del cálculo.

## Comprobación manual inicial

| Fecha y hora (Colombia, UTC-5) | Resultado | Respuesta |
|---|---|---|
| 2026-10-22, aproximadamente 20:57 | Exitosa, HTTP `200` | `{"status":"ok","uptime":47.553987914}` |

Esta fue una solicitud manual puntual. **No es un sondeo periódico ni permite
calcular un porcentaje de disponibilidad.**

### Sondeo manual posterior

El 2026-10-22, una solicitud de comprobación recibió HTTP `503`. Una solicitud
posterior al mismo endpoint respondió HTTP `200`:
`{"status":"ok","uptime":455.581668157}`. La hora exacta de cada solicitud no
quedó registrada.

Estas solicitudes fueron puntuales, no son comprobaciones programadas. El
`503` se conserva como una respuesta observada, pero sin datos horarios del
proveedor no se puede determinar la duración del incidente ni calcular la
disponibilidad del período.

## Diagnóstico y comprobación posterior

El 2026-10-22 a las 23:20 (hora Colombia), las dos comprobaciones siguientes
respondieron correctamente:

| Endpoint | Resultado | Respuesta |
|---|---|---|
| `/api/healthz` | HTTP `200` | `{"status":"ok","uptime":54.910691458}` |
| `/api/health` | HTTP `200` | PostgreSQL conectado |

El estado público de Render indicó “All Systems Operational” y no mostró
incidentes sin resolver durante esta revisión.

**Causa probable del `503`:** el comportamiento es compatible con una
reactivación en frío de un web service gratuito de Render. La documentación
actual de Render indica que los servicios web gratuitos se suspenden tras 15
minutos sin tráfico y pueden tardar alrededor de un minuto en volver a estar
disponibles. El proceso respondió con uptime de aproximadamente 55 segundos
en la verificación posterior, lo que confirma que acababa de iniciar; por sí
solo, este dato no demuestra la causa. No se tuvo acceso al panel de Render
para verificar el plan de cómputo o los eventos del servicio.

La API y PostgreSQL estaban sanos al momento de la comprobación posterior.
No se identificó un defecto que corregir en el handler de salud.

### Mitigación

Una vez integrado, el sondeo periódico genera tráfico regular y reduce la
probabilidad de que Render suspenda el servicio gratuito por inactividad. El
workflow registra los `503`, otros errores HTTP y timeouts como ejecuciones
fallidas, pero no garantiza disponibilidad durante despliegues, reinicios o
incidentes. GitHub Actions no ofrece por sí mismo notificaciones externas
configuradas por este workflow.

## Reporte del período

| Período | Comprobaciones | Exitosas | Fallidas | Disponibilidad |
|---|---:|---:|---:|---:|
| Pendiente de integración y recopilación de datos de Actions | — | — | — | No calculable |

Todavía no hay historial del monitor programado. No se infiere disponibilidad
para el tiempo anterior a su primera ejecución programada.

## Pendiente para completar D3

1. Integrar el workflow en `develop` para habilitar el cron.
2. Confirmar la primera ejecución programada exitosa y la hora de inicio del
   período de medición.
3. Al cierre del período acordado, contar las ejecuciones programadas
   exitosas y fallidas en GitHub Actions y calcular el porcentaje con la
   fórmula de esta evidencia; excluir ejecuciones manuales.
4. Actualizar la tabla con el período y los conteos verificables del historial.
