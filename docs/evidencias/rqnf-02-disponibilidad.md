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
