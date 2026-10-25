# Evidencia RQNF-02: disponibilidad del backend

**Responsable:** Daniel

**Rama:** `docs/rqnf-02-disponibilidad`

**Servicio:** FitLoyalty API en Render

**URL monitoreada:** https://fitloyalty-api.onrender.com/api/healthz

**Frecuencia:** cada 5 minutos dentro del horario operativo (de 5:02 a 21:57,
hora de Colombia), más una corrida de calentamiento a las 4:50 que no cuenta

## Requisito

Texto de RQNF-02 en la matriz y en el documento de requisitos:

> El sistema debe garantizar una disponibilidad mínima del 99% durante el
> horario operativo del gimnasio (lunes a domingo, 5:00 a.m. – 10:00 p.m.).

La meta es, por tanto, **99 % o más** y solo se mide **de lunes a domingo, de
5:00 a 22:00 de Colombia** (UTC-5, sin horario de verano).

## Criterio de disponibilidad

Una comprobación cuenta como exitosa si el monitor externo recibe HTTP `200` y
el cuerpo contiene `"status":"ok"`. Los errores HTTP, tiempos de espera y
respuestas sin ese estado cuentan como fallos.

El porcentaje del período se calcula **solo con las corridas programadas de
medición**, que son las que GitHub titula «Medición de disponibilidad» y caen
dentro del horario operativo:

```text
mediciones exitosas / mediciones totales * 100
```

- **No cuentan** las corridas manuales («Comprobación manual (no cuenta)») ni
  el calentamiento de las 4:50 («Calentamiento (no cuenta)»).
- **Corridas descartadas:** GitHub puede retrasar o descartar corridas
  programadas cuando tiene mucha carga. Una corrida que no ocurrió achica la
  muestra, pero no cuenta como fallo ni como éxito. El número nominal es de
  204 mediciones por día (12 por hora durante 17 horas), unas 1.428 por semana;
  el reporte debe dar el número real de corridas.

El endpoint `/api/healthz` verifica que la API responda; no comprueba la
conexión a PostgreSQL. Por ello, este porcentaje representa disponibilidad de
la API, no disponibilidad de todos sus servicios dependientes.

## Monitor programado

El workflow [availability-monitor.yml](../../.github/workflows/availability-monitor.yml)
tiene dos horarios, en UTC:

| Cron (UTC) | Hora de Colombia | Corrida | ¿Cuenta? |
|---|---|---|---|
| `2-59/5 10-23,0-2 * * *` | 5:02, 5:07, …, 21:57, todos los días | «Medición de disponibilidad» (job «Comprobar API») | Sí |
| `50 9 * * *` | 4:50, todos los días | «Calentamiento (no cuenta)» | No |

- **Medición:** `GET` al endpoint con un tiempo máximo de 30 s. Pasa solo con
  HTTP `200` y `"status":"ok"`; los timeouts, errores HTTP y respuestas sin ese
  estado hacen fallar la corrida y quedan en el historial de GitHub Actions.
  El cron evita el minuto 0, que es cuando GitHub retrasa o descarta más
  corridas programadas.
- **Calentamiento:** despierta el servicio gratuito de Render antes de la
  primera medición, porque el arranque en frío tarda alrededor de un minuto,
  más que el tiempo máximo de la medición. Reintenta hasta 6 veces (60 s por
  intento y 20 s de espera) y siempre termina en verde: si la API no responde,
  deja un aviso en el log.
- **Manual:** se conserva la ejecución manual (`workflow_dispatch`) para
  probar el monitor; su corrida se titula «Comprobación manual (no cuenta)».
- No requiere secretos ni permisos (`permissions: {}`) y no usa acciones de
  terceros.

**Cómo contar.** En la pestaña Actions, filtrar el workflow «Monitor de
disponibilidad API» por evento `schedule` y por el título «Medición de
disponibilidad», y contar las corridas exitosas y fallidas del período. Con la
CLI de GitHub, por ejemplo:

```text
gh run list --workflow availability-monitor.yml --event schedule --limit 2000 \
  --json displayTitle,conclusion,createdAt
```

y quedarse con `displayTitle` igual a «Medición de disponibilidad».

**Estado:** implementado en la rama `docs/rqnf-02-disponibilidad`. GitHub solo
ejecuta los eventos `schedule` desde la rama predeterminada, así que el sondeo
periódico empezará después de integrar este workflow en `develop`.

**Consumo de horas de Render.** El plan gratuito da 750 horas de instancia al
mes por workspace y suspende el servicio tras 15 minutos sin tráfico. Con este
horario, el servicio queda despierto desde el calentamiento de las 4:50 hasta
unos 15 minutos después de la última medición de las 21:57: algo más de 17
horas al día, unas 530 horas al mes (entre 520 y 540, según el mes). Un sondeo
24/7 lo dejaría despierto unas 744 horas, casi todo el cupo; si hubiera otro
servicio gratuito en el mismo workspace, se agotaría.

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

Una vez integrado, el sondeo periódico genera tráfico regular durante el
horario operativo y reduce la probabilidad de que Render suspenda el servicio
gratuito por inactividad; el calentamiento de las 4:50 lo despierta antes de la
primera medición. El
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

## Criterio de estado de RQNF-02

| Estado | Condición |
|---|---|
| Pendiente | Mientras no haya historial de mediciones programadas (hoy). Un monitor sin datos no demuestra disponibilidad |
| Parcial | Al menos un día operativo completo (5:02 a 21:57) de mediciones programadas, con esta tabla llena. También si la medición de 7 días da menos de 99 % |
| Implementado | 7 días seguidos (una semana completa de lunes a domingo, unas 1.428 mediciones nominales) con 99 % o más de mediciones exitosas. Lo ideal son 30 días |

## Pendiente para completar D3

1. Integrar el workflow en `develop` para habilitar el cron.
2. Confirmar la primera medición programada y la hora de inicio del período.
3. Al cierre del período, contar las corridas «Medición de disponibilidad»
   exitosas y fallidas en GitHub Actions y calcular el porcentaje con la
   fórmula de esta evidencia, sin las corridas manuales ni el calentamiento.
4. Actualizar la tabla con el período, el número real de corridas y los
   conteos verificables del historial.
