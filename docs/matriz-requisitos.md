# Matriz de trazabilidad de requisitos

> Generada desde los mismos datos que `docs/avance-requisitos.xlsx` (la fuente con fórmulas es el Excel).
> Código verificado: `main` @ `54b19fa` · Fecha: 2026-10-16 · Requisitos: `Documentación/Proyecto FitLoyalty.docx`.

Escala: **Implementado = 1**, **Parcial = 0,5** (lo principal funciona pero falta alguna parte), **No implementado = 0**, **Sin evidencia = 0** (no hay código, prueba ni medición que lo respalde).

## Resumen

**Alcance actualizado (RQF-01..16, RQNF-01..09)**

| Alcance | Total | Implementados | Parciales | No implementados | Sin evidencia | Puntos | Avance |
|---|---:|---:|---:|---:|---:|---:|---:|
| RF | 16 | 7 | 6 | 3 | 0 | 10,0 | **62,5 %** |
| RNF | 9 | 4 | 3 | 0 | 2 | 5,5 | **61,1 %** |
| Global | 25 | 11 | 9 | 3 | 2 | 15,5 | **62,0 %** |

**Alcance original del documento (RQF-01..12, RQNF-01..08)**

| Alcance | Total | Implementados | Parciales | No implementados | Sin evidencia | Puntos | Avance |
|---|---:|---:|---:|---:|---:|---:|---:|
| RF | 12 | 3 | 6 | 3 | 0 | 6,0 | **50,0 %** |
| RNF | 8 | 3 | 3 | 0 | 2 | 4,5 | **56,3 %** |
| Global | 20 | 6 | 9 | 3 | 2 | 10,5 | **52,5 %** |

## Requisitos funcionales

| Código | Módulo | Origen | Estado | Evidencia verificada | Lo que falta / observación | HU |
|---|---|---|---|---|---|---|
| **RQF-01** | Gestión de Usuarios | Original | **Parcial** | Crear (por invitación), listar personal y revocar invitaciones: staff.js:109, :198, :227, :329; aceptar la invitación crea la cuenta: staff.js:384. Roles diferenciados: authorize('admin') en staff.js:112 y miembros.js:667 frente a authorize('admin', 'receptionist') en checkin.js:57. | Editar y eliminar o desactivar cuentas de personal existentes: no hay PUT/DELETE en /api/admin/staff ni acciones en StaffPage.jsx. | HU-01, HU-02, HU-03, HU-04, HU-53 |
| **RQF-02** | Gestión de Usuarios | Original | **Parcial** | POST /api/auth/login compara con bcrypt y emite JWT (auth.js:200, :231); cierre manual (auth.js:295, AuthContext.jsx:95); límite de 5 intentos por minuto (index.js:63, :79). | Cierre automático por inactividad (no existe en frontend ni backend). Hallazgo: el JWT del personal no expira, generarToken no aplica JWT_EXPIRES_IN (auth-helpers.js:102-113). | HU-05, HU-06 |
| **RQF-03** | Gestión de Miembros | Original | **Implementado** | POST /api/admin/miembros rechaza documento o correo duplicados (miembros.js:357-369) y genera un código QR único (:371-379); editar con PUT (:607); desactivar con activo = FALSE (:664-675); pantalla MiembrosPage.jsx:627, :919, :442. | Observación: al editar no se vuelven a validar duplicados de documento o correo (criterio 2 de HU-09). | HU-07, HU-08, HU-09, HU-10 |
| **RQF-04** | Gestión de Miembros | Original | **Parcial** | Cálculo automático de fecha_fin según el plan (miembros.js:185, :382); estado vencido / por vencer contra la fecha actual (miembros.js:276-284); renovación del plan (miembros.js:754). | Estado Congelada: la tabla congelacion_membresia existe (migración 002:217) pero ninguna ruta ni pantalla la usa. | HU-11, HU-12, HU-13, HU-35..HU-40 |
| **RQF-05** | Check-in y Asistencia | Original | **Implementado** | Campo con autoFocus que recibe la lectura del lector HID tipo teclado y envía con Enter (CheckinPage.jsx:221-223, :329-331); lectura por cámara (CheckinPage.jsx:66); POST /api/admin/checkin inserta el ingreso (checkin.js:54, :167-172); fecha_hora DEFAULT CURRENT_TIMESTAMP (migración 002:100). | — | HU-14, HU-32, HU-33, HU-34 |
| **RQF-06** | Check-in y Asistencia | Original | **Parcial** | Valida el último plan y responde VENCIDO sin registrar el ingreso (checkin.js:116-136); la pantalla muestra «Acceso denegado» (CheckinPage.jsx:133-143). | Notificar al administrador del intento bloqueado: el intento no se guarda y la campana (notificaciones.js:96-108) solo lista membresías vencidas, no accesos denegados. | HU-15 |
| **RQF-07** | Dashboard | Original | **Parcial** | GET /api/admin/dashboard: miembros activos (dashboard.js:123, :146), entradas de hoy (:128) y próximos vencimientos a 30 días (:204); listado en DashboardPage.jsx:446-473. | Gráfica de horas pico (la gráfica agrupa por día de la semana, dashboard.js:189) y actualización automática (el panel se carga una sola vez, DashboardPage.jsx:165-179). | HU-16, HU-41, HU-42, HU-43 |
| **RQF-08** | Alertas de Abandono | Original | **Parcial** | Lista de miembros sin ingresar en N días calculada al consultar: campana de avisos (notificaciones.js:125-137; umbral del gimnasio, 15 por defecto, :38 y :66), dashboard (dashboard.js:161, :182) y filtro «En riesgo» de miembros (miembros.js:263, MiembrosPage.jsx:939). | Ejecución diaria del motor (el scheduler solo programa vencimientos, scheduler.js:46), los dos niveles Amarilla / Roja, registro en alerta_abandono (tabla sin uso) y pantalla para configurar el umbral (el dashboard usa 15 días fijos). | HU-17, HU-18, HU-44 |
| **RQF-09** | Alertas de Abandono | Original | **Implementado** | Botón de WhatsApp con el mensaje armado para miembros en riesgo (MenuNotificaciones.jsx:86-90, MiembrosPage.jsx:796-802); POST /api/admin/notificaciones/enviado guarda canal, estado ENVIADO y fecha en envio_mensaje (notificaciones.js:188-224). | Observación: solo WhatsApp por enlace wa.me; el estado no confirma la entrega y el correo no se usa para retención. | HU-19, HU-20, HU-52 |
| **RQF-10** | Campañas | Original | **No implementado** | Solo existen las tablas campana, campana_destinatario y plantilla_mensaje (migración 002:171-202); ninguna ruta ni pantalla las usa. | Todo el módulo: rutas de API, programación de envíos, segmentos y pantalla. | HU-21..HU-24, HU-45, HU-46 |
| **RQF-11** | Gamificación | Original | **No implementado** | La app del miembro lee hitos y su estado (cliente.js:340-381, gamificacion_screen.dart), pero ningún archivo calcula rachas ni escribe hito_miembro; los datos que existen vienen del script ConsultasDB/Poblar_Tablas.sql:384-419. | Cálculo de rachas en cada check-in, otorgar hitos, mensaje en la pantalla de check-in y configuración de hitos por el administrador. | HU-25, HU-26, HU-27, HU-47, HU-48 |
| **RQF-12** | Gamificación | Original | **No implementado** | La app lista los retos activos con el progreso guardado (cliente.js:392-418), pero no hay ruta ni pantalla para crear retos, el check-in no actualiza reto_miembro y no hay aviso al completar; los retos existentes vienen de ConsultasDB/Poblar_Tablas.sql:456-490. | CRUD de retos para el administrador, actualización del progreso en cada check-in y notificación al completar. | HU-28..HU-31, HU-49, HU-50 |
| **RQF-13** | Gestión de Miembros | Nuevo | **Implementado** | POST /api/admin/miembros/:id/contrato/enviar con control de gimnasio (admin-contrato.js:76-92) y registro en contrato_enviado (admin-contrato.js:109-114, migración 008); vista previa e historial por API (:167, :195); botón «Enviar contrato» (MiembrosPage.jsx:855-880, :1735). | Observación: depende de que la sesión de WhatsApp del servidor esté autenticada; si no lo está, informa el error y no envía. | HU-54 |
| **RQF-14** | Gestión de Miembros | Nuevo | **Implementado** | Cron diario a las 9:00 a.m. America/Bogota (scheduler.js:46); selección de planes por vencer y control de duplicados (expiracion.js:43, :74, :94, :117); 0 días desactiva el aviso (expiracion.js:151); POST /api/jobs/expiracion/run y GET /api/jobs/expiracion/preview (jobs.js:27, :38); migraciones 006 y 007. | Observación: los días de anticipación (gimnasio.dias_aviso_vencimiento) no tienen pantalla; se definen en la base de datos. | HU-55 |
| **RQF-15** | Suscripción SaaS | Nuevo | **Implementado** | POST /api/auth/signup crea gimnasio y administrador con trial_ends_at (auth.js:100, :126-138); TRIAL_DAYS = 14 (trial.js:17, render.yaml); requireActiveTrial responde 402 TRIAL_EXPIRED (trial.js:52-74) en miembros, check-in, dashboard, configuración y personal; días restantes en el panel (AdminLayout.jsx:155). | Observación: comentarios desactualizados dicen 7 días (auth.js:6, :98; trial.js:7). No hay activación de plan pago. | HU-56 |
| **RQF-16** | App Móvil del Miembro | Nuevo | **Implementado** | POST /api/cliente/login con teléfono y contraseña bcrypt (cliente.js:51, :88) y JWT de 30 días (auth-helpers.js:145); rutas protegidas con requireClient (cliente.js:112); /qr, /membresia, /asistencia y PUT /me (cliente.js:227, :259, :292, :171); app Flutter: login_screen.dart, qr_tab.dart, plan_tab.dart, asistencia_screen.dart; token en FlutterSecureStorage (api_client.dart:41). | Observación: la app no tiene pruebas automatizadas reales (widget_test.dart es una prueba mínima de arranque). | HU-57, HU-58 |

## Requisitos no funcionales

| Código | Categoría | Origen | Estado | Evidencia verificada | Lo que falta / observación | HU |
|---|---|---|---|---|---|---|
| **RQNF-01** | Rendimiento | Original | **Sin evidencia** | No hay medición registrada. | Medir y documentar (p. ej. 30 check-ins contra el entorno desplegado, tiempo de respuesta de POST /api/admin/checkin). Riesgo: si el QR no coincide directo, checkin.js:83-101 descifra en memoria los QR de todos los miembros del gimnasio. | — |
| **RQNF-02** | Disponibilidad | Original | **Sin evidencia** | Existen /api/healthz y /api/health (index.js:101, :103), pero no hay monitoreo ni reporte de disponibilidad. | Monitor externo sobre /api/healthz con reporte del período; el plan gratuito de Render suspende el servicio por inactividad (scheduler.js:9-10). | — |
| **RQNF-03** | Seguridad | Original | **Implementado** | bcrypt.hash / compare en registro, login, restablecimiento e invitación (auth.js:145, :231, :447; staff.js:431) y para miembros (miembros.js:388, :625; cliente.js:88); API de producción por HTTPS (frontend/src/api.js:26) y frontend en Vercel con HTTPS. | Observación: la clave de cifrado del QR tiene un valor por defecto en el código (miembros.js:36, checkin.js:19). | — |
| **RQNF-04** | Usabilidad | Original | **Parcial** | Registro manual en 2 interacciones: escribir el documento y pulsar «Registrar» (CheckinPage.jsx:333, :341-347); el código QR se envía con Enter (CheckinPage.jsx:221-223). | Prueba de usabilidad documentada con personal sin formación técnica (p. ej. 3 personas, conteo de interacciones y tiempo). | — |
| **RQNF-05** | Escalabilidad | Original | **Implementado** | Cada gimnasio nuevo se crea por registro, sin tocar código (auth.js:100, :134); las consultas filtran por el id_gimnasio del token (p. ej. miembros.js:358, checkin.js:76, dashboard.js:123, notificaciones.js:199); el contrato verifica el gimnasio (admin-contrato.js:92). | Observación: no hay prueba de carga que respalde «sin degradación del rendimiento». | — |
| **RQNF-06** | Compatibilidad | Original | **Parcial** | Aplicación web React / Vite servida por Vercel que solo requiere navegador (frontend/package.json, vercel.json); QA responsive a 375 px (Evidencias_Sustentacion/QA_Responsive_375px.md). | Prueba documentada en Chrome, Firefox y Edge (lista de verificación de las pantallas principales con capturas). | — |
| **RQNF-07** | Mantenibilidad | Original | **Parcial** | Capas en backend/src (routes, lib, middleware, jobs, db) y diagrama de arquitectura en el documento (sección 8). Cobertura medida el 2026-10-16: 0 % en routes/checkin.js y routes/notificaciones.js, 1,48 % de líneas en todo el backend; 23 pruebas, 2 fallan. | Script «test» en backend/package.json, pruebas de check-in y alertas hasta ≥ 70 % y corregir las 2 pruebas que fallan. | — |
| **RQNF-08** | Portabilidad | Original | **Implementado** | backend/Dockerfile (node:24-alpine, multietapa), frontend/Dockerfile + nginx.conf y docker-compose.yml; despliegue en la nube en Render y Vercel (render.yaml, vercel.json). | Observación: no se verificó la construcción de la imagen (Docker Desktop apagado) y Render usa el entorno Node nativo, no el contenedor. Sugerencia: agregar docker build al CI. | — |
| **RQNF-09** | Mantenibilidad | Nuevo | **Implementado** | .github/workflows/ci.yml corre en pull_request y en push a main (:3-6): el job rama valida el nombre de la rama en cada PR (:13-26), backend npm ci + node --check (:42-44) y frontend npm ci + build (:58-59); ejecución exitosa en main 8acab31 (pestaña Actions). | Observación: el CI todavía no corre pruebas ni mide cobertura. | — |

## Ruta para llegar al 80 % (la decide Luis)

| # | Acción | Requisito | Responsable | Esfuerzo | Suma | Avance acumulado |
|---:|---|---|---|---|---:|---:|
| 1 | Medir el tiempo del check-in en el entorno desplegado y documentarlo | RQNF-01 | Luis o Santiago | Bajo | 1,0 | 66,0 % |
| 2 | Prueba de usabilidad del check-in manual con 3 personas sin formación técnica | RQNF-04 | Luis | Bajo | 0,5 | 68,0 % |
| 3 | Lista de verificación con capturas en Chrome, Firefox y Edge | RQNF-06 | Luis | Bajo | 0,5 | 70,0 % |
| 4 | Cierre de sesión por inactividad en el frontend y expiración real del JWT | RQF-02 | Santiago | Bajo | 0,5 | 72,0 % |
| 5 | Gráfica de horas pico y refresco automático del dashboard | RQF-07 | Santiago | Bajo | 0,5 | 74,0 % |
| 6 | Registrar el acceso bloqueado y mostrarlo en la campana del administrador | RQF-06 | Santiago | Bajo | 0,5 | 76,0 % |
| 7 | Editar y desactivar cuentas del personal | RQF-01 | Santiago | Medio | 0,5 | 78,0 % |
| 8 | Congelar y descongelar membresías | RQF-04 | Santiago | Medio | 0,5 | 80,0 % ✅ meta |
| 9 | Motor diario con Alerta Amarilla / Roja y umbrales editables | RQF-08 | Santiago | Medio | 0,5 | 82,0 % |
| 10 | Script test, pruebas de check-in y alertas hasta ≥ 70 % de cobertura | RQNF-07 | Santiago | Medio | 0,5 | 84,0 % |
| 11 | Cálculo de rachas, hitos y mensaje en el check-in | RQF-11 | Santiago | Medio | 1,0 | 88,0 % |
| 12 | Monitor externo de disponibilidad con reporte (depende del plan de Render) | RQNF-02 | Luis | Medio | 1,0 | 92,0 % |
| 13 | CRUD de retos, progreso automático y aviso al completar | RQF-12 | Santiago | Alto | 1,0 | 96,0 % |
| 14 | Módulo de campañas y plantillas | RQF-10 | Santiago | Alto | 1,0 | 100,0 % |

Hoy: 15,5 / 25 puntos = 62,0 %. Para el 80 % se necesitan 20,0 puntos (faltan 4,5).
