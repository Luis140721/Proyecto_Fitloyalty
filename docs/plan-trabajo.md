# Plan de trabajo: 90 % para el viernes 23 de octubre de 2026

> Seguimiento diario en la [hoja de Google del equipo](https://docs.google.com/spreadsheets/d/1ZFf82H6vaq8bhZAV79OE_8LPY3rL_4mS5oqeivg03mc/edit) (columna Estado). Este archivo es la copia versionada del plan.
> Avance de partida: 23 / 37 puntos = 62,2 % (docs/avance-requisitos.xlsx, PR #6).

## Meta y proyección

| Concepto | Valor |
|---|---:|
| Puntos necesarios para el 90 % | 10,3 |
| Puntos planeados que cuentan | 11 |
| Avance si se cumple el plan | **91,9 %** |
| Respaldo (RQNF-02) | +1 → 94,6 % |

RQF-11 y RQNF-01 valen 1 punto cada uno: si uno de los dos se atrasa, el avance baja a 89,2 % y entra el respaldo.

## Carga por persona

| Persona | Horas | % de la carga | Meta | Puntos que aporta |
|---|---:|---:|---:|---:|
| Luis | 38 | 44,7 % | 45 % | 3,5 |
| Santiago | 38,5 | 45,3 % | 45 % | 5 |
| Daniel | 8,5 | 10,0 % | 10 % | 2,5 |
| **Total** | **85** | 100 % | 100 % | 11 |

## Tareas

| ID | Requisito | Tarea | Responsable | Revisa | Archivos que toca | Depende de | Fecha | Horas | Puntos | Cuenta | Rama |
|---|---|---|---|---|---|---|---|---:|---:|---|---|
| L0 | — | Montar el flujo con develop: crear develop desde main, protegerla, CI en develop, check rama y guía actualizada | Luis | Santiago | .github/workflows/ci.yml, .github/pull_request_template.md, CONTRIBUTING.md, README.md, docs/plan-trabajo.md | — | Vie 16 | 1,5 | 0 | No aplica | `chore/flujo-develop` |
| D1 | RQNF-15 | Rechazar en CORS los orígenes que no estén en FRONTEND_URL (index.js:54 devuelve cb(null, true) para todos) | Daniel | Luis | backend/src/index.js | L0 | Sáb 17 | 0,5 | 1 | Sí | `fix/cors-y-limites` |
| D2 | RQNF-09 | Límite de intentos en /api/auth/verify-reset-code y /api/auth/reset-password, junto a los limitadores de index.js:63-80 | Daniel | Luis | backend/src/index.js | D1 (misma rama) | Sáb 17 | 1 | 0,5 | Sí | `fix/cors-y-limites` |
| D3 | RQNF-02 | Monitor externo de disponibilidad sobre /api/healthz cada 5 minutos y reporte con el % del periodo | Daniel | Luis | docs/evidencias/rqnf-02-disponibilidad.md | — | Sáb 17 y Jue 22 | 1 | 1 | Respaldo | `docs/rqnf-02-disponibilidad` |
| S1 | RQF-13 | Relanzar el error en sendWhatsAppText para que un envío fallido no quede registrado como exitoso | Santiago | Luis | backend/src/lib/whatsapp.js, backend/src/routes/admin-contrato.js | L0 | Sáb 17 | 1,5 | 0,5 | Sí | `fix/rqf-13-whatsapp-error` |
| S2 | RQF-14 | No marcar el aviso de vencimiento como enviado si WhatsApp no está listo (reintentar) y llevar los días de aviso a Configuración | Santiago | Luis | backend/src/jobs/expiracion.js, backend/src/routes/config.js, frontend/src/pages/ConfigPage.jsx | S1 | Sáb 17 | 3 | 0,5 | Sí | `fix/rqf-14-avisos-vencimiento` |
| L1 | RQNF-10 | Migración 009 que cree vista_miembros_activos, auditoria y las columnas tipo_hito y meta_asistencias (sin renombrar las migraciones existentes) | Luis | Santiago | backend/migrations/009_*.sql | L0 | Sáb 17 | 3 | 0,5 | Sí | `fix/rqnf-10-migraciones` |
| L2 | RQF-22 | Eliminar cuenta: un SAVEPOINT por cada safe() y no insertar en auditoria lo que se borra; probarlo en PostgreSQL | Luis | Santiago | backend/src/routes/auth.js (492-548), frontend/src/pages/EliminarCuentaPage.jsx | L1 | Sáb 17 | 3 | 1 | Sí | `fix/rqf-22-eliminar-cuenta` |
| L3 | RQF-02 | Cierre de sesión por inactividad en el frontend y expiración real del JWT del personal | Luis | Santiago | backend/src/lib/auth-helpers.js, backend/tests/auth-helpers.test.js, frontend/src/context/AuthContext.jsx, frontend/src/api.js | L2 | Dom 18 | 4 | 0,5 | Sí | `feat/rqf-02-inactividad` |
| S3 | RQNF-05 | Cerrar la fuga entre gimnasios de vista.js, exigir rol de personal en /api/asistencia y sacar scryptSync del recorrido del check-in | Santiago | Luis | backend/src/routes/vista.js, backend/src/routes/asistencia.js, backend/src/routes/checkin.js | L1 | Dom 18 | 5 | 0,5 | Sí | `fix/rqnf-05-aislamiento` |
| L4 | RQF-07 | Gráfica de horas pico y refresco automático del dashboard | Luis | Santiago | backend/src/routes/dashboard.js, frontend/src/pages/DashboardPage.jsx | — | Lun 19 | 4 | 0,5 | Sí | `feat/rqf-07-horas-pico` |
| S4 | RQF-06 | Registrar el acceso bloqueado por membresía vencida y mostrarlo en la campana del administrador | Santiago | Luis | backend/src/routes/checkin.js, backend/src/routes/notificaciones.js, frontend/src/components/MenuNotificaciones.jsx | S3 | Lun 19 | 3 | 0,5 | Sí | `feat/rqf-06-acceso-bloqueado` |
| L5 | RQF-01 | Editar y desactivar cuentas del personal | Luis | Santiago | backend/src/routes/staff.js, frontend/src/pages/StaffPage.jsx | — | Mar 20 | 5 | 0,5 | Sí | `feat/rqf-01-editar-personal` |
| S5 | RQF-11 | Calcular rachas en cada check-in, otorgar hitos (hito_miembro), mensaje motivacional en la pantalla de check-in y configuración básica de hitos | Santiago | Luis | backend/src/routes/checkin.js, frontend/src/pages/CheckinPage.jsx, backend/migrations/011_*.sql (si hace falta) | L1, S4 | Mar 20 | 7 | 1 | Sí | `feat/rqf-11-rachas-hitos` |
| L6 | RQF-04 | Congelar y descongelar membresías (estado Congelada) | Luis | Santiago | backend/src/routes/miembros.js, frontend/src/pages/MiembrosPage.jsx, backend/migrations/010_*.sql | S2 (Santiago hace que expiracion.js salte las congeladas) | Mié 21 | 6 | 0,5 | Sí | `feat/rqf-04-congelar` |
| S6 | RQF-08 | Motor diario de abandono: Alerta Amarilla (7 días) y Roja (15 días), registro en alerta_abandono y umbrales editables | Santiago | Luis | backend/src/jobs/scheduler.js, backend/src/jobs/abandono.js (nuevo), backend/src/routes/notificaciones.js, frontend/src/pages/ConfigPage.jsx | S2, S4 | Mié 21 | 6 | 0,5 | Sí | `feat/rqf-08-alertas-abandono` |
| D4 | RQNF-06 | Lista de verificación con capturas en Chrome, Firefox y Edge sobre develop | Daniel | Luis | docs/evidencias/rqnf-06-navegadores.md | Release 1 | Mié 21 | 2 | 0,5 | Sí | `docs/rqnf-06-navegadores` |
| D6 | — | Prueba de humo de la release 1 (PR develop → main) y aprobación si pasa | Daniel | — | Ninguno (solo prueba) | S1 a S4, L1 a L5 | Mié 21 | 1 | 0 | No aplica | develop → main |
| S7 | RQNF-01 | Con la búsqueda del QR ya corregida (S3), medir el check-in con unos 200 miembros y documentar los tiempos | Santiago | Luis | backend/scripts/medir-checkin.js (nuevo), docs/evidencias/rqnf-01-checkin.md | S3 | Jue 22 | 3 | 1 | Sí | `chore/rqnf-01-medicion` |
| S8 | RQNF-07 | Script test y pruebas de check-in y alertas hasta 70 % de cobertura; arreglar las 2 pruebas que fallan; npm test en el CI (avisar antes) | Santiago | Luis | backend/tests/ (archivos nuevos), backend/package.json, backend/package-lock.json, .github/workflows/ci.yml | S3, S4, S6 | Lun 19 a Jue 22 | 7 | 0,5 | Sí | `chore/rqnf-07-pruebas` |
| D5 | RQNF-04 | Prueba de usabilidad del check-in manual con 3 personas sin formación técnica (máximo 2 interacciones) | Daniel | Luis | docs/evidencias/rqnf-04-usabilidad.md | S5 | Jue 22 | 2 | 0,5 | Sí | `docs/rqnf-04-usabilidad` |
| D7 | — | Prueba de humo de la release 2 (PR develop → main) y aprobación si pasa | Daniel | — | Ninguno (solo prueba) | Congelamiento Jue 22 18:00 | Jue 22 | 1 | 0 | No aplica | develop → main |
| L7 | — | Actualizar docx, Excel de avance, matriz, estado.md e historias de usuario con cada PR fusionado (cada noche) | Luis | Santiago | docs/avance-requisitos.xlsx, docs/Proyecto FitLoyalty - requisitos actualizados.docx, docs/matriz-requisitos.md, docs/estado.md, Documentación/Plantilla historias de usuario.xlsx | Cada PR fusionado | Dom 18 a Jue 22 | 6 | 0 | No aplica | `docs/avance-AAAA-MM-DD` |
| L8 | — | Consolidar la documentación final, verificación independiente y release de entrega | Luis | Santiago | Los mismos de L7 | Release 2 | Vie 23 | 2 | 0 | No aplica | `docs/entrega-final` |
| R1 | — | Revisar y probar los PR de Luis antes de fusionarlos en develop | Santiago | — | Ninguno (revisión) | Cada PR de Luis | Toda la semana | 3 | 0 | No aplica | — |
| R2 | — | Revisar y probar los PR de Santiago y Daniel antes de fusionarlos en develop | Luis | — | Ninguno (revisión) | Cada PR de Santiago y Daniel | Toda la semana | 3,5 | 0 | No aplica | — |

**Fuera de alcance esta semana:** RQF-10 (Módulo de campañas y plantillas); RQF-12 (CRUD de retos, progreso automático y aviso al completar).

## Dueños de archivos

| Zona | Dueño | Archivos |
|---|---|---|
| Check-in, asistencia y aislamiento | Santiago | backend/src/routes/checkin.js, vista.js, asistencia.js; frontend/src/pages/CheckinPage.jsx |
| Mensajería, avisos y alertas | Santiago | backend/src/lib/whatsapp.js, lib/mensajes.js; backend/src/routes/admin-contrato.js, notificaciones.js, config.js; backend/src/jobs/ (todo); frontend/src/pages/ConfigPage.jsx; frontend/src/components/MenuNotificaciones.jsx |
| Pruebas del backend | Santiago | backend/tests/ (archivos nuevos), backend/package.json, backend/package-lock.json, backend/scripts/ (nuevos) |
| App Flutter del miembro | Santiago | fitloyalty_cliente/ (sin tareas esta semana; si alguien necesita tocarla, avisa) |
| Cuenta, sesión y autenticación | Luis | backend/src/routes/auth.js; backend/src/lib/auth-helpers.js; backend/tests/auth-helpers.test.js; backend/src/middleware/auth.js; frontend/src/context/AuthContext.jsx; frontend/src/api.js; frontend/src/pages/EliminarCuentaPage.jsx |
| Dashboard, personal y miembros | Luis | backend/src/routes/dashboard.js, staff.js, miembros.js; frontend/src/pages/DashboardPage.jsx, StaffPage.jsx, MiembrosPage.jsx |
| Migraciones | Luis (009 y 010) / Santiago (011 y 012) | backend/migrations/: cada uno usa solo sus números; nadie renombra ni edita migraciones ya fusionadas |
| Documentación y Excel (archivos binarios: no se pueden fusionar) | Luis | docs/avance-requisitos.xlsx, docs/*.docx, docs/matriz-requisitos.md, docs/estado.md, docs/plan-trabajo.md, Documentación/, CONTRIBUTING.md, README.md |
| Configuración del servidor | Daniel | backend/src/index.js (CORS, limitadores, montaje de rutas). Si Luis o Santiago necesitan cambiarlo, se lo piden a Daniel |
| Evidencias de pruebas | Daniel (archivos nuevos) | docs/evidencias/rqnf-02-*, rqnf-04-*, rqnf-06-*. Las capturas .png están ignoradas por .gitignore: súbelas con git add -f o déjalas en la carpeta de Drive del equipo |
| CI y plantillas de GitHub | Luis (L0, hoy) / Santiago (S8, jueves) | .github/: Luis lo cambia hoy para develop; Santiago agrega npm test el jueves, avisando antes, cuando todas las pruebas pasen |

Si necesitas tocar un archivo de otra zona: avisa en el grupo, espera el OK del dueño y menciónalo en el PR.

## Calendario

| Día | Luis | Santiago | Daniel | Hito |
|---|---|---|---|---|
| Vie 16 (hoy) | L0: crear develop y protegerla; publicar el plan | Leer el plan, sincronizar | Leer el plan, sincronizar | Todos clonan o actualizan y trabajan desde develop |
| Sáb 17 | L1 migración 009; L2 eliminar cuenta | S1 error de WhatsApp; S2 avisos de vencimiento | D1 CORS y D2 límites (una rama); D3 montar el monitor |  |
| Dom 18 | L3 inactividad y JWT; L7 docs (noche) | S3 aislamiento y check-in | — |  |
| Lun 19 | L4 horas pico; R2 revisiones | S4 acceso bloqueado; empezar S8 pruebas | — |  |
| Mar 20 | L5 editar personal; L7 docs (noche) | S5 rachas e hitos | — |  |
| Mié 21 | L6 congelar membresías | S6 alertas de abandono; skip de congeladas en expiracion.js | D4 navegadores; D6 prueba de la release 1 | 20:00 release 1: PR develop → main |
| Jue 22 | L7 docs (noche); R2 revisiones | S7 medición de check-in; terminar S8 pruebas | D5 usabilidad; D3 reporte; D7 prueba de la release 2 | 18:00 congelamiento de develop (solo arreglos); 20:00 release 2 |
| Vie 23 | L8 documentación final y verificación | Arreglos de la verificación (si los hay) | Apoyo en pruebas finales | Entrega con 90 % o más verificado |

## Manejo de ramas

- **Estructura.** main tiene lo estable (lo que se despliega y se entrega). develop es la rama de integración. Cada tarea va en su propia rama que sale de develop: feat/…, fix/…, docs/… o chore/… (también se acepta feature/…).
- **Nadie trabaja directo en main ni en develop.** Las dos están protegidas: solo reciben cambios por Pull Request con el CI en verde (rama, backend y frontend).
- **Una tarea, una rama.** La rama sale de develop actualizado, se llama como la columna Rama del plan y se borra al fusionar.
- **PR de la tarea hacia develop.** Lo revisa y lo prueba otra persona (columna Revisa) antes de fusionar.
- **main solo recibe develop.** En las releases (mié 21 y jue 22 a las 20:00) se abre un PR develop → main. Lo prueba y lo aprueba alguien que no escribió ese código. Nadie aprueba su propio PR a main.
- **Sincronizar todos los días.** Antes de empezar: git checkout develop, git pull origin develop, git checkout <tu-rama>, git merge develop. Así los conflictos salen de a poco.
- **Commits pequeños.** Un commit por cambio con sentido: tipo(área): qué cambia. Ejemplo: fix(checkin): no descifra todos los QR en cada ingreso.
- **Antes de tocar un archivo de otro.** Avisar en el grupo qué archivo y por qué, esperar el OK del dueño y mencionarlo en el PR. Sin OK, no se toca.
- **Reunión de 5 minutos.** Cada mañana en el grupo: qué hago hoy, qué archivos toco y qué me bloquea. Cada noche: qué terminé y qué PR abrí.
- **Qué probar en una release.** Que el proyecto corra sin errores, que lo nuevo haga lo que dice, que lo demás siga funcionando y que no haya archivos a medias ni conflictos.
- **Definición de terminado.** PR fusionado en develop con CI verde, revisado por otra persona, con la evidencia en la descripción (archivo:línea, prueba o captura) y con el estado del requisito actualizado por Luis en el Excel, el docx y la matriz.
- **Nada de secretos.** No subir .env, node_modules ni cachés (.wwebjs_auth).

```bash
# 1. Partir de develop actualizado
git checkout develop
git pull origin develop

# 2. Crear la rama de la tarea (nombre de la columna Rama)
git checkout -b fix/rqf-13-whatsapp-error

# 3. Commits pequeños
git add <archivos>
git commit -m "fix(whatsapp): relanza el error si el envío falla"

# 4. Antes de abrir el PR, traer lo nuevo de develop
git checkout develop
git pull origin develop
git checkout fix/rqf-13-whatsapp-error
git merge develop

# 5. Subir la rama y abrir el PR hacia develop
git push -u origin fix/rqf-13-whatsapp-error

# 6. Tras fusionar: volver a develop y borrar la rama local
git checkout develop
git pull origin develop
git branch -d fix/rqf-13-whatsapp-error
```
