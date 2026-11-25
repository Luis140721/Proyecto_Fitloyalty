# API de FitLoyalty (T6, ítem 12)

| Dato | Valor |
|---|---|
| Ítem de la lista T6 | 12: «README actualizado con sección de pruebas; API del 4.° backend documentada» |
| Código revisado | `develop` @ `1f28949` (2026-11-25) |
| Rutas documentadas | 94: las 92 rutas distintas de los routers de `backend/src/routes/` y las 2 de salud de `backend/src/index.js`. `GET /api/admin/diagnostics` está definida en `staff.js` y en `dashboard.js`; responde la de `staff.js`, que se monta primero |
| Cómo se sacó la lista | Cargando cada router de Express y leyendo su pila de rutas y middlewares, no a mano. Si se agrega una ruta, se agrega aquí en el mismo PR. |
| Relacionados | [Arquitectura](../arquitectura/ARQUITECTURA.md) · [Colección Postman con tests](../pruebas/postman/README.md) · [Matriz de casos](../pruebas/matriz-casos-prueba.md) |

## 1. Datos generales

| | Producción | Local (Docker) | Local (sin Docker) |
|---|---|---|---|
| URL base | `https://fitloyalty-api.onrender.com/api` | `http://localhost:5173/api` (nginx) | `http://localhost:3001/api` |

- **Formato:** JSON en el cuerpo y en la respuesta (`Content-Type: application/json`). La exportación del dashboard responde CSV.
- **CORS:** solo acepta los orígenes de la lista `FRONTEND_URL`, separados por coma (en producción, el panel de Vercel); otro origen responde 403 `CORS_BLOCKED`. Las peticiones sin origen (la app, Postman, curl) pasan.
- **Zona horaria:** el dashboard, los retos, los segmentos, las campañas y las tareas programadas usan la hora de Colombia (`America/Bogota`). El vencimiento del plan en el check-in se compara con la fecha del servidor (UTC en Render).

### Autenticación

Se envía el token en la cabecera `Authorization: Bearer <token>`.

| Token | Se obtiene con | Contenido | Vigencia | Sirve para |
|---|---|---|---|---|
| Personal del gimnasio | `POST /api/auth/login` | `id`, `name`, `email`, `gymId`, `role` (`admin` o `receptionist`) | `JWT_EXPIRES_IN` (24 h en `render.yaml`, 7 días en `docker-compose.yml`; 8 h si no está definida) | Todas las rutas del panel |
| Miembro | `POST /api/cliente/login` | `idMiembro`, `documento`, `gymId`, `role: cliente` | 30 días | `/api/cliente/*` (y `GET /api/billing/trial-status` y `POST /api/auth/logout`) |

En cada petición del personal el servidor vuelve a leer al usuario en la base: si lo desactivaron o le cambiaron el rol, el cambio aplica de inmediato, aunque su token siga vigente.

### Columnas de las tablas

- **Acceso:** 🌐 pública · 🔑 cualquier token del personal · 👑 solo administrador · 🧾 administrador o recepción · 📱 token del miembro · 🛠️ cabecera `X-Admin-Token`.
- **Prueba:** ⏳ exige que el periodo de prueba del gimnasio no haya vencido (`requireActiveTrial`). Si venció, responde `402 TRIAL_EXPIRED`.

### Errores

Casi todas las respuestas de error tienen la misma forma:

```json
{ "error": "Mensaje para mostrar al usuario", "code": "CODIGO_ESTABLE", "details": { "issues": [] } }
```

`details` aparece en la mayoría de los errores de validación, con la lista de campos que fallaron según el esquema `zod` de la ruta, y también en `CONTACTO_NO_PERMITIDO`, `FUERA_DE_HORARIO`, `CONTRACT_INCOMPLETE` y `REPRESENTANTE_REQUERIDO`. Excepciones: las rutas del contrato responden `{ ok: false, error }` sin `code`, `seed-supremo` no trae `code` y el 503 de `/api/health` no trae `error`.

| Estado | Códigos comunes | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_JSON`, `QR_DINAMICO_VENCIDO`, `QR_ESTATICO_NO_PERMITIDO` | Datos de entrada inválidos o JSON mal formado |
| 401 | `AUTH_REQUIRED`, `TOKEN_INVALID`, `TOKEN_SIN_VENCIMIENTO`, `ACCOUNT_DISABLED`, `BAD_CREDENTIALS`, `BAD_PASSWORD` | Falta el token, no es válido o venció, la cuenta quedó desactivada con la sesión abierta, o las credenciales no coinciden (panel y app) |
| 402 | `TRIAL_EXPIRED` | Venció el periodo de prueba del gimnasio |
| 403 | `FORBIDDEN`, `CLIENT_ONLY`, `ACCOUNT_DISABLED` (en el login), `NO_GYM`, `CORS_BLOCKED` | El rol no alcanza, el token es de otro tipo, la cuenta está desactivada o el origen no está permitido |
| 404 | `NOT_FOUND`, `MEMBER_NOT_FOUND` | No existe, o es de otro gimnasio (no se distingue a propósito) |
| 409 | `CONTACTO_NO_PERMITIDO`, `QR_DINAMICO_SIN_SECRETO` | Choca con una regla de negocio (por ejemplo, la Ley 2300) |
| 410 | `INVITE_ALREADY_ACCEPTED`, `INVITE_REVOKED`, `INVITE_EXPIRED` | La invitación al equipo ya no sirve |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo demasiado grande |
| 429 | `RATE_LIMITED` | Se pasó el límite de intentos (tabla siguiente) |
| 500 | `INTERNAL_ERROR` | Error no controlado. En producción no muestra el detalle |
| 503 | `DB_UNREACHABLE` | La base de datos no respondió |

### Límites de intentos (por IP)

| Ruta | Límite |
|---|---|
| `POST /api/auth/login` | 5 por minuto |
| `POST /api/auth/forgot-password` | 3 por minuto |
| `POST /api/auth/verify-reset-code` | 5 cada 15 minutos |
| `POST /api/auth/reset-password` | 5 cada 15 minutos |
| `/api/auth/account` | 5 cada 15 minutos |
| `POST /api/cliente/login` | 10 por minuto |
| `/api/baja/*` | 20 por minuto |

## 2. Rutas

### Salud del servicio

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| GET | `/api/healthz` | 🌐 | Responde `{ status: "ok", uptime }` sin tocar la base. Es la que miden UptimeRobot y el workflow de disponibilidad |
| GET | `/api/health` | 🌐 | Hace `SELECT 1` en la base. `200 { status: "ok", db: "PostgreSQL conectado" }` o `503 DB_UNREACHABLE` |

### Autenticación del personal — `/api/auth`

| Método | Ruta | Acceso | Cuerpo | Qué hace |
|---|---|---|---|---|
| POST | `/api/auth/signup` | 🌐 | `gymName`, `gymPhone`, `ownerName`, `ownerEmail`, `password`, `gymEmail?` | Crea el gimnasio y su administrador (el dueño) con el periodo de prueba (`TRIAL_DAYS`) |
| POST | `/api/auth/login` | 🌐 | `email`, `password` | Devuelve `{ token, user, gym }`. `401 BAD_CREDENTIALS` si no coincide; `403 ACCOUNT_DISABLED` si la cuenta está desactivada |
| GET | `/api/auth/me` | 🔑 | — | Perfil del usuario y de su gimnasio |
| POST | `/api/auth/logout` | 🔑 | — | Cierre de sesión (el cliente borra el token) |
| POST | `/api/auth/forgot-password` | 🌐 | `email` | Envía por correo un código de recuperación de 15 minutos y anula los anteriores. Responde igual exista o no el correo |
| POST | `/api/auth/verify-reset-code` | 🌐 | `email`, `code` | Valida el código y devuelve `resetToken` para cambiar la contraseña |
| POST | `/api/auth/reset-password` | 🌐 | `password` y `resetToken` (o `email` y `code`) | Cambia la contraseña |
| DELETE | `/api/auth/account` | 🔑 | `password` | Elimina el gimnasio completo y sus datos. Solo el dueño, confirmando su contraseña: otro admin recibe `403 NOT_OWNER` y una contraseña equivocada, `403 WRONG_PASSWORD` |
| GET | `/api/auth/accept-invite/:token` | 🌐 | — | Muestra los datos de una invitación al equipo antes de aceptarla. Solo sirve mientras quien la creó siga siendo administrador activo del gimnasio |
| POST | `/api/auth/accept-invite` | 🌐 | `token`, `password` (mín. 6), `nombre?` | Crea la cuenta del invitado |

Reglas de la contraseña en el registro y en la recuperación: al menos 6 caracteres, al menos un número y sin espacios (`backend/src/lib/validators.js`). `accept-invite` solo exige los 6 caracteres.

### Miembros — `/api/admin/miembros`

| Método | Ruta | Acceso | Prueba | Qué hace |
|---|---|---|---|---|
| GET | `/api/admin/miembros` | 🧾 | ⏳ | Lista paginada. Consulta: `page` (desde 0), `pageSize` (1 a 100, 10 por defecto), `q` (búsqueda), `includeInactive=true` |
| POST | `/api/admin/miembros` | 🧾 | ⏳ | Crea el miembro, su plan, su QR y sus autorizaciones. Ver cuerpo abajo |
| GET | `/api/admin/miembros/lookup` | 🧾 | ⏳ | Búsqueda rápida para el check-in: `codigo` (QR) o `documento` |
| GET | `/api/admin/miembros/:id` | 🧾 | ⏳ | Detalle del miembro |
| PUT | `/api/admin/miembros/:id` | 🧾 | ⏳ | Actualiza los datos personales, de salud, la contraseña de la app y las autorizaciones (todos opcionales), más `activo`, `ciudad` y `codigo_pais_telefono`. No cambia el plan, los pagos, `acepto_terminos` ni `autorizo_datos`: esos campos se ignoran |
| DELETE | `/api/admin/miembros/:id` | 👑 | ⏳ | Baja lógica: el miembro queda inactivo |
| DELETE | `/api/admin/miembros/:id/permanent` | 👑 | ⏳ | Borra al miembro de forma permanente |
| GET | `/api/admin/miembros/:id/plan` | 🧾 | ⏳ | Plan vigente del miembro |
| PUT | `/api/admin/miembros/:id/plan` | 🧾 | ⏳ | Renueva o cambia el plan: `tipo_plan`, `fecha_inicio`, `fecha_fin`, `valor_total`, `valor_pagado`, `metodo_pago`, `referencia_pago?`, `proxima_fecha_cobro?` |
| POST | `/api/admin/miembros/:id/congelar` | 👑 | ⏳ | Congela la membresía: `motivo?` (máx. 200), `fecha_inicio?` (AAAA-MM-DD) |
| POST | `/api/admin/miembros/:id/descongelar` | 👑 | ⏳ | Descongela la membresía y corre la fecha de fin los días congelados |
| POST | `/api/admin/miembros/:id/contrato/enviar` | administrador | — | Envía el contrato al miembro por WhatsApp y deja la constancia |
| GET | `/api/admin/miembros/:id/contrato/preview` | administrador | — | Vista previa del contrato |
| GET | `/api/admin/miembros/:id/contrato/historial` | administrador | — | Envíos del contrato |

**Cuerpo de `POST /api/admin/miembros`** (resumen del esquema `createSchema`, `backend/src/routes/miembros.js`):

| Campo | Tipo | Notas |
|---|---|---|
| `nombre`, `documento`, `telefono` | texto | Obligatorios |
| `tipo_documento` | `CC`, `TI`, `NIT`, `CE`, `PP` | `CC` por defecto |
| `fecha_nacimiento` | AAAA-MM-DD | Si es menor de edad, se exigen los datos del representante y `autoriza_representante: true` |
| `tipo_plan` | `MENSUAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`, `CLASES_SUELTAS`, `ILIMITADO`, `OTRO` | `MENSUAL` por defecto |
| `fecha_inicio`, `fecha_fin`, `valor_total`, `valor_pagado` | texto | Fechas AAAA-MM-DD |
| `metodo_pago` | `EFECTIVO`, `TRANSFERENCIA`, `TARJETA`, `PSE`, `NEQUI`, `DAVIPLATA`, `OTRO` | |
| `estado_pago` | `PENDIENTE`, `PAGADO`, `PARCIAL` | |
| `acepto_terminos`, `autorizo_datos`, `autorizo_datos_sensibles` | booleano | Autorizaciones de la Ley 1581 |
| `acepta_mensajes_comerciales`, `canales_comerciales` | booleano, lista de `WHATSAPP` y `EMAIL` | Ley 2300: si acepta, debe elegir al menos un canal |
| `password`, `app_acceso` | texto (mín. 6), booleano | Acceso del miembro a la app |

### Check-in y asistencia

| Método | Ruta | Acceso | Prueba | Qué hace |
|---|---|---|---|---|
| POST | `/api/admin/checkin` | 🧾 | ⏳ | Registra un ingreso. Cuerpo: `codigo` (QR fijo o dinámico) o `documento`, `metodo` (`QR`, `MANUAL`, `CODIGOBARRAS`), `observacion?` (máx. 200) |
| GET | `/api/admin/checkin` | 🧾 | ⏳ | Últimos ingresos. Consulta: `limit` (1 a 200, 50 por defecto) y `dia=hoy` (solo los de hoy, hora de Colombia) |
| GET | `/api/asistencia` | 🧾 | — | Historial de asistencia del gimnasio |
| GET | `/api/vista/miembros-activos` | 🧾 | — | Lee la vista SQL `vista_miembros_activos` (paginada) |

**Respuestas de `POST /api/admin/checkin`:**

| Caso | Estado | Cuerpo |
|---|---|---|
| Ingreso registrado | 201 | `{ message: "Ingreso registrado.", duplicado: false, checkin, miembro, membresia, gamificacion, retos, mensaje_retos, qr_dinamico }` |
| Ya había entrado hace un momento | 200 | `{ duplicado: true, checkin, miembro, membresia }` (no se repite el registro) |
| Plan vencido o sin plan | 200 | `{ miembro: { estado: "VENCIDO" } }`. No hay ingreso; se avisa al administrador |
| Membresía congelada | 200 | `{ message, miembro: { estado: "CONGELADO" } }`. No hay ingreso; se avisa al administrador |
| QR dinámico vencido | 400 | `QR_DINAMICO_VENCIDO` |
| QR fijo con «Exigir QR dinámico» activo | 400 | `QR_ESTATICO_NO_PERMITIDO` |
| Miembro de otro gimnasio o inexistente | 404 | `MEMBER_NOT_FOUND` |

### Equipo del gimnasio

| Método | Ruta | Acceso | Prueba | Qué hace |
|---|---|---|---|---|
| GET | `/api/admin/staff` | 👑 | ⏳ | Lista el equipo |
| PATCH | `/api/admin/staff/:id` | 👑 | ⏳ | Cambia `nombre`, rol o `activo`. Nadie se desactiva ni se quita el rol a sí mismo, y la cuenta del dueño no se desactiva. Al desactivar o bajar de rol a un administrador se revocan sus invitaciones pendientes |
| POST | `/api/admin/staff/invite` | 👑 | ⏳ | Invita por correo: `email`, `nombre`, `rol` (`RECEPCIONISTA` por defecto o `ADMINISTRADOR`) |
| GET | `/api/admin/staff/invitations` | 👑 | ⏳ | Las últimas 100 invitaciones; `pendiente` dice cuáles siguen vigentes |
| POST | `/api/admin/staff/invitations/:id/revoke` | 👑 | ⏳ | Revoca una invitación |

### Dashboard, configuración y tareas

| Método | Ruta | Acceso | Prueba | Qué hace |
|---|---|---|---|---|
| GET | `/api/admin/dashboard` | 👑 | ⏳ | Métricas del gimnasio |
| GET | `/api/admin/dashboard/horas-pico` | 👑 | ⏳ | Ingresos por hora. Consulta: `periodo` = `hoy`, `semana` (7 días) o `mes` (30 días, por defecto) |
| GET | `/api/admin/dashboard/export` | 👑 | ⏳ | Descarga el resumen en CSV |
| GET | `/api/admin/diagnostics` | 👑 | — | Diagnóstico de la base para soporte (columnas reales y la consulta de prueba) |
| GET | `/api/admin/config` | 👑 | ⏳ | Configuración del gimnasio |
| PUT | `/api/admin/config` | 👑 | ⏳ | Precios de los planes, recordatorios de cobro, `dias_aviso_vencimiento` (0 a 30), `umbral_alerta_amarilla` y `umbral_alerta_roja` (días sin venir), `qr_dinamico_obligatorio`. Exigir el QR dinámico sin `QR_DINAMICO_SECRET` en producción responde `409 QR_DINAMICO_SIN_SECRETO` |
| GET | `/api/admin/hitos` | 👑 | ⏳ | Hitos de gamificación |
| POST | `/api/admin/hitos` | 👑 | ⏳ | Crea un hito: `nombre`, `tipo_hito` (`RACHA` o `TOTAL_ASISTENCIAS`), `valor_objetivo`, `mensaje`, `activo?` |
| PUT | `/api/admin/hitos/:id` | 👑 | ⏳ | Edita un hito. Un id que no es un entero positivo responde 400 |
| DELETE | `/api/admin/hitos/:id` | 👑 | ⏳ | Desactiva un hito; los logros de los miembros se conservan |
| GET | `/api/billing/trial-status` | 🔑 | — | Estado del periodo de prueba (días restantes, vencido o no) |
| POST | `/api/jobs/expiracion/run` | 👑 | — | Corre ya los avisos de vencimiento de su gimnasio. Cuerpo opcional: `{ dryRun: true }` para solo contar |
| GET | `/api/jobs/expiracion/preview` | 👑 | — | Lista a quién se avisaría en su gimnasio, sin enviar |
| POST | `/api/jobs/abandono/run` | 👑 | — | Corre ya las alertas de abandono del gimnasio |
| POST | `/api/admin/seed-supremo` | 🛠️ | — | Mantenimiento: crea o resetea la cuenta suprema. Exige `password` de al menos 12 caracteres y no la devuelve (desde el PR #125) |

### Notificaciones del panel

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| GET | `/api/admin/notificaciones` | 🧾 | Avisos de la campana: vencimientos, miembros en riesgo de abandono, accesos bloqueados y retos completados |
| POST | `/api/admin/notificaciones/acceso-bloqueado/:id/leida` | 🧾 | Marca como leído un aviso de acceso bloqueado |
| POST | `/api/admin/notificaciones/reto/:id/leida` | 🧾 | Marca como leído un aviso de reto completado |
| POST | `/api/admin/notificaciones/enviado` | 🧾 | Registra que se le escribió a un miembro: `idMiembro`, `canal` (`WHATSAPP` por defecto o `EMAIL`), `mensaje`, `tipo?`, `idAlerta?`, `antesDeAbrir?`. Antes revisa la Ley 2300; si no se puede contactar, responde `409 CONTACTO_NO_PERMITIDO` con el motivo y no guarda nada |

### Retos (RQF-12)

Todas: 👑 y ⏳.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/admin/retos` | Lista los retos |
| POST | `/api/admin/retos` | Crea un reto: `nombre` (3 a 100), `meta_asistencias` (1 a 1000), `fecha_inicio`, `fecha_fin` (no anterior a la de inicio), `segmento_elegible` (`TODOS`, `INACTIVOS`, `NUEVOS`, `PROXIMOS_A_VENCER`), `descripcion?`, `recompensa?` |
| PUT | `/api/admin/retos/:id` | Edita un reto (los mismos campos, opcionales) |
| POST | `/api/admin/retos/:id/cancelar` | Cancela el reto |
| GET | `/api/admin/retos/:id/participantes` | Participantes y su progreso |
| GET | `/api/admin/retos/:id/elegibles` | Cuántos miembros del segmento todavía no participan, y los primeros 50 |
| POST | `/api/admin/retos/:id/inscribir` | Inscribe miembros: `ids?` (hasta 5000; sin `ids`, todos los elegibles; los que no sean elegibles se ignoran). Los ingresos que ya hicieron dentro de las fechas cuentan. Un reto cancelado o terminado responde 409 |

### Campañas y plantillas (RQF-10)

Todas: 👑 y ⏳.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/admin/plantillas` | Plantillas de mensaje |
| POST | `/api/admin/plantillas` | Crea una plantilla: `nombre` (3 a 100), `contenido` (5 a 2000), `activa?` |
| PUT | `/api/admin/plantillas/:id` | Edita una plantilla |
| DELETE | `/api/admin/plantillas/:id` | Desactiva una plantilla |
| GET | `/api/admin/campanas` | Lista las campañas |
| GET | `/api/admin/campanas/segmento` | Cuenta a quién llegaría. Consulta: `segmento`, `dias?` |
| POST | `/api/admin/campanas` | Crea una campaña: `nombre` (3 a 150), `segmento`, `dias?` (0 a 365), `canal` (`WHATSAPP` por defecto o `EMAIL`), `id_plantilla?` o `mensaje?`, `tipo_disparo` (`MANUAL` o `PROGRAMADO`), `fecha_programada?` |
| PUT | `/api/admin/campanas/:id` | Edita una campaña |
| POST | `/api/admin/campanas/:id/ejecutar` | Envía la campaña ahora. Cada destinatario queda `ENVIADO`, `FALLIDO`, `OMITIDO` con su motivo (ver abajo) o `PENDIENTE` si es por WhatsApp y el servidor no lo tiene. Fuera del horario permitido responde 202: no crea destinatarios y la campaña queda programada para la siguiente franja |
| POST | `/api/admin/campanas/:id/reintentar` | Reintenta los destinatarios que siguen PENDIENTE (por ejemplo, si se cerró la franja horaria) |
| POST | `/api/admin/campanas/:id/cancelar` | Cancela la campaña |
| GET | `/api/admin/campanas/:id/destinatarios` | Destinatarios con su estado y motivo |
| POST | `/api/admin/campanas/:id/destinatarios/:idMiembro/enviado` | Deja constancia de un envío hecho a mano, con el texto que se le mostró al administrador |

**Motivos de un destinatario** (migración 018): `NO_AUTORIZA` (no aceptó mensajes comerciales o se dio de baja), `CANAL_NO_AUTORIZADO`, `FRECUENCIA` (ya se le escribió hoy, u otro canal esta semana), `FUERA_DE_HORARIO` (la franja se cerró en medio del envío: sigue pendiente y sale en la siguiente), `SIN_TELEFONO`, `SIN_CORREO`, `ERROR_ENVIO`.

**Horario permitido para escribir** (Ley 2300, `backend/src/lib/contacto-legal.js`): lunes a viernes de 7:00 a. m. a 7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m. Nunca domingos ni festivos.

### Enlace de baja (Ley 2300, art. 5)

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| GET | `/api/baja/:token` | 🌐 | Muestra el primer nombre del miembro y el gimnasio del enlace, sin más datos |
| POST | `/api/baja/:token` | 🌐 | Da de baja al miembro de los mensajes comerciales (queda una autorización nueva con canal `ENLACE`). Un enlace que no existe responde `404 ENLACE_INVALIDO` |

### App del miembro — `/api/cliente`

Todas, menos el login, exigen el token del miembro (📱). Cada consulta filtra por el `idMiembro` del token: un miembro nunca ve datos de otro.

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/cliente/login` | 🌐 Inicio de sesión: `telefono` (10 dígitos, empieza por 3), `password` (mín. 6). Devuelve el token del miembro y su gimnasio |
| POST | `/api/cliente/logout` | Cierre de sesión (la app borra el token) |
| GET | `/api/cliente/me` | Datos del miembro |
| PUT | `/api/cliente/me` | Edita solo `telefono`, `email`, `direccion`, `contacto_emergencia`, `telefono_emergencia`, `condiciones_medicas`, `alergias`, `objetivo` y `nivel_experiencia`. Un texto vacío no cambia el dato (el correo vacío lo quita). Sin la autorización de datos sensibles, condiciones y alergias quedan en NULL. No deja tocar el documento ni el QR |
| GET | `/api/cliente/qr` | QR fijo, los datos para calcular el QR dinámico sin internet (secreto, paso de 30 s y hora del servidor) y `solo_dinamico`, que dice si el gimnasio exige el dinámico |
| GET | `/api/cliente/membresia` | Plan vigente |
| GET | `/api/cliente/asistencia` | Últimos ingresos. Consulta: `limit` (1 a 100, 20 por defecto) |
| GET | `/api/cliente/gamificacion` | Hitos logrados y disponibles, y puntos |
| GET | `/api/cliente/retos` | Retos vigentes y su progreso |
| POST | `/api/cliente/retos/:id/unirse` | Se une a un reto, si está en su segmento |
| GET | `/api/cliente/mensajes` | Bandeja de mensajes del gimnasio. Consulta: `limit` (1 a 100, 50 por defecto) |
| PATCH | `/api/cliente/mensajes/:id/leido` | Marca un mensaje como leído |
| PATCH | `/api/cliente/mensajes/leidos` | Marca todos como leídos |
| GET | `/api/cliente/preferencias` | Si acepta mensajes comerciales, por qué canales y desde cuándo |
| PATCH | `/api/cliente/preferencias` | Cambia la aceptación: `aceptaComerciales?`, `canalesAutorizados?` (`WHATSAPP`, `EMAIL`) |
| GET | `/api/cliente/autorizaciones` | Autorizaciones vigentes (términos, datos, datos sensibles) |
| PATCH | `/api/cliente/autorizaciones/datos-sensibles` | Otorga o retira la autorización de datos sensibles: `otorgada` |
| GET | `/api/cliente/contrato` | Contrato del miembro |

## 3. Ejemplos

Las variables `$API` y `$TOKEN` se reemplazan por la URL base y el token.

```bash
# Iniciar sesión como personal
curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@fitloyalty.local","password":"admin12345"}'
# -> { "message": "Inicio de sesion exitoso", "token": "eyJ...", "user": {...}, "gym": {...} }

# Registrar un ingreso por documento
curl -s -X POST "$API/admin/checkin" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"documento":"<documento de un miembro>","metodo":"MANUAL"}'
# -> 201 { "message": "Ingreso registrado.", "duplicado": false, ... }

# Error de validación
curl -s -X POST "$API/admin/checkin" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}'
# -> 400 { "error": "codigo o documento requerido", "code": "VALIDATION_ERROR", "details": { "issues": [...] } }
```

Los usuarios de ejemplo son los de [Usuarios de prueba](../../README.md#usuarios-de-prueba), que se crean en local con `seed_dev.js` (crea el administrador y el gimnasio, no miembros: el documento del ejemplo es el de uno que crees en el panel). No usar cuentas reales.

## 4. Cómo se prueba esta API

- **Colección Postman** con tests automáticos para los casos de la matriz: [`docs/pruebas/postman/`](../pruebas/postman/README.md). Se corre con Newman contra la API de pruebas (`db-test`).
- **Pruebas unitarias y de integración** de las rutas en `backend/tests/` (Jest y Supertest); corren en el CI en cada PR, junto con el linter.
- Resultados: [reporte de ejecución](../pruebas/reporte-ejecucion-2026-11-22.md).
