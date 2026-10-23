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

## Configuración del monitor externo

- Proveedor recomendado: [UptimeRobot](https://uptimerobot.com/), cuyo plan
  gratuito anuncia comprobaciones cada 5 minutos y monitores HTTP y de
  palabras clave. La página de precios indica que las notificaciones no están
  disponibles en ese plan; confirmar las condiciones vigentes al configurarlo.
- Tipo: comprobación HTTP/HTTPS `GET`.
- URL: `https://fitloyalty-api.onrender.com/api/healthz`.
- Intervalo: 5 minutos.
- Timeout: 30 segundos.
- Condición de éxito: HTTP `200`; si el proveedor admite validación de
  contenido, exigir también `"status":"ok"`.
- Registrar alertas, comprobaciones y el intervalo del reporte.

**Estado de configuración:** proveedor recomendado, pero el monitor sigue
pendiente de activar en una cuenta externa. No se documentan credenciales ni
se supone acceso a una cuenta.

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

- Para un servicio gratuito, activar un monitor externo sobre
  `/api/healthz` con intervalo de 5 minutos. Esto genera tráfico regular y
  reduce la probabilidad de que Render suspenda el servicio por inactividad.
- Para evitar la suspensión sin depender de sondeos, cambiar el servicio a un
  plan de pago que no tenga suspensión por inactividad.
- El monitor debe registrar los `503` y timeouts como fallos; un monitor no
  garantiza disponibilidad durante despliegues, reinicios o incidentes.

La mitigación no está activa todavía: requiere acceso autorizado al panel de
un proveedor de monitoreo o que el dueño del servicio cambie su plan.

## Reporte del período

| Período | Comprobaciones | Exitosas | Fallidas | Disponibilidad |
|---|---:|---:|---:|---:|
| Pendiente de seleccionar/obtener desde el monitor externo | — | — | — | No calculable |

No hay datos históricos del monitor externo disponibles en este repositorio.
No se infiere disponibilidad para el tiempo anterior a la activación del
monitor.

## Pendiente para completar D3

1. Activar el monitor externo con la configuración anterior.
2. Confirmar la fecha/hora en que comenzó a recopilar datos.
3. Al cierre del período acordado, copiar desde el proveedor el intervalo,
   número de comprobaciones exitosas y totales, fallos/incidentes y porcentaje.
4. Actualizar la tabla con el reporte verificable o adjuntar un enlace/captura
   exportada del proveedor.
