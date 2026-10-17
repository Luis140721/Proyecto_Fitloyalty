# Borrador: matriz de requisitos vs. codigo

> Borrador de apoyo hecho por el Claude de Santiago sobre `main` (commit 54b19fa).
> El agente principal de la tarea es el Claude de Luis: este archivo es insumo,
> no reemplaza su matriz. Cada fila debe verificarse antes de darla por buena.
> Requisitos tomados de `Proyecto FitLoyalty.docx` (RQF-01..12, RQNF-01..08).

Escala: Implementado = 1, Parcial = 0.5, No implementado / sin evidencia = 0.

## Requisitos funcionales

| Cod | Requisito | Estado | Evidencia / lo que falta |
|---|---|---|---|
| RQF-01 | Gestion de staff y roles | Parcial | `backend/src/routes/staff.js`: invitar por email, listar, revocar, aceptar invitacion. Falta confirmar editar/eliminar staff y roles Admin/Recepcionista diferenciados. |
| RQF-02 | Login y sesion con cierre por inactividad | Parcial | `routes/auth.js`: login, logout, forgot/reset password, rate limit en `index.js`. No se encontro cierre automatico por inactividad. |
| RQF-03 | Gestion de miembros (QR, sin duplicados) | Implementado | `routes/miembros.js`: alta, edicion, soft-delete, lookup por QR/documento. Verificar validacion de duplicados por documento y correo. |
| RQF-04 | Estado de membresia y vencimiento | Parcial | Tabla `congelacion_membresia` en migracion 002 y job `jobs/expiracion.js`. No hay endpoint para congelar; estado Congelada no se gestiona. |
| RQF-05 | Check-in por QR/HID | Implementado | `routes/checkin.js` (POST), pagina `CheckinPage.jsx`, `routes/asistencia.js`. |
| RQF-06 | Validar membresia y bloquear si vencida | Implementado | `checkin.js` responde `VENCIDO` y corta el acceso; avisos en `routes/notificaciones.js`. |
| RQF-07 | Dashboard en tiempo real | Implementado | `routes/dashboard.js` (KPIs, en riesgo, export CSV), `DashboardPage.jsx`. |
| RQF-08 | Deteccion diaria de abandono (7/15 dias) | Parcial | Umbrales por gimnasio (`umbral_alerta_amarilla`, migracion 006) y lista en riesgo. Falta confirmar que corra como cron diario especifico de abandono. |
| RQF-09 | Mensajes de retencion + registro de envio | Implementado | `notificaciones.js` (`/enviado` deja constancia), `lib/whatsapp.js`, `lib/email.js`, `lib/mensajes.js`. |
| RQF-10 | Campanas segmentadas y plantillas | No implementado | No hay modelo ni rutas de campanas. Hay plantillas de mensaje sueltas, no gestionables. |
| RQF-11 | Rachas y mensaje de hito en check-in | Parcial | `routes/cliente.js` `GET /gamificacion` calcula rachas (app Flutter). Falta el mensaje motivacional en la pantalla de check-in y hitos configurables por admin. |
| RQF-12 | Retos de asistencia (crear, progreso, notificar) | Parcial | Tablas `reto` y `reto_miembro`, `GET /api/cliente/retos` con progreso. No hay pantalla ni endpoint de admin para crear retos ni notificar al completar. |

**Puntaje RF:** 5 implementados + 6 parciales x 0.5 = **8 / 12 = 66.7 %**

## Requisitos no funcionales

| Cod | Requisito | Estado | Evidencia / lo que falta |
|---|---|---|---|
| RQNF-01 | Check-in en <= 2 s | Sin evidencia | No hay medicion. Se necesita una prueba de tiempo documentada. |
| RQNF-02 | Disponibilidad 99 % | Sin evidencia | Existe `/api/healthz`; no hay monitoreo ni reporte. Render free duerme el servicio. |
| RQNF-03 | bcrypt + HTTPS | Implementado | bcrypt en `routes/admin.js`/seeds y auth; HTTPS por Render y Vercel. |
| RQNF-04 | Check-in manual en <= 2 interacciones | Sin evidencia | Falta validarlo en `CheckinPage.jsx` con una prueba de usabilidad. |
| RQNF-05 | Multitenancy | Implementado | Consultas filtradas por gimnasio en las rutas; alta de gimnasios por registro. |
| RQNF-06 | Chrome, Firefox, Edge | Parcial | App web (Vite/React) sin pruebas multi-navegador registradas. |
| RQNF-07 | Capas + 70 % de cobertura en check-in y alertas | Parcial | Capas rutas/lib/jobs. Solo `backend/tests/auth-helpers.test.js` (23 pruebas) y no hay script `test` en `package.json`. |
| RQNF-08 | Despliegue en nube con Docker | Implementado | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `render.yaml`, CI en `.github/workflows/ci.yml`. |

**Puntaje RNF:** 3 implementados + 2 parciales x 0.5 = **4 / 8 = 50 %**

## Total

(8 + 4) / 20 = **60 %** de avance real hoy.

Para llegar al 80 % (16 / 20) faltan **4 puntos**. Rutas honestas, de mayor a menor impacto:

1. **RQF-10 Campanas** (+1): implementarlo de verdad (modelo, rutas, pantalla minima).
2. **RQF-12 Retos** (+0.5): CRUD de retos para admin y aviso al completar.
3. **RQF-02 Inactividad** (+0.5): cierre de sesion por inactividad en el frontend.
4. **RQF-04 Congelacion** (+0.5): endpoint y pantalla para congelar membresia.
5. **RQF-11 Hitos** (+0.5): mensaje de hito en check-in.
6. **RQNF-07 Pruebas** (+0.5 a +1): script `test` en backend y pruebas de check-in y alertas con cobertura medida.
7. **RQNF-01, 02, 04** (+1 a +3): medirlos y documentar la evidencia (tiempos del check-in, monitoreo, prueba de usabilidad). Son baratos si de verdad se cumplen.

Regla: un requisito solo se marca como hecho si hay codigo, prueba o medicion que lo respalde.
Si despues de hacer lo anterior no se llega al 80 %, se informa el porcentaje real.
