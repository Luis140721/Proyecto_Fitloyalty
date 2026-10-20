# Estado: avance real de requisitos

- **Fecha:** 2026-10-19 (actualizaciones tras las fusiones en `develop` del 18 y del 19; la medición inicial fue el 2026-10-16)
- **Rama:** `docs/avance-2026-10-19` (PR hacia `develop`). La del 18 fue `docs/avance-2026-10-18` (PR #20) y la medición inicial se hizo en `docs/avance-requisitos` (PR #6, ya en `main`).
- **Código verificado:** `develop` @ `66186d7` para los requisitos de las actualizaciones (secciones siguientes); el resto, `main` @ `54b19fa`. El PR #5 (`8acab31`) solo agregó `CONTRIBUTING.md` y el check de nombre de rama al CI (sin cambios en el código de la app); se fusionó en esta rama y es la base de la evidencia del CI.
- **Base de la documentación:** por decisión de Luis, los archivos de Santiago del PR #4 (`docs/borrador-matriz-requisitos` @ `00cdcdb`), verificados y corregidos aquí.
- **Copias de seguridad:** los originales de `Documentación/` están en `54b19fa` y los archivos de Santiago sin corregir en el commit `5db4e2a` de esta rama (o en `00cdcdb`). Ejemplo: `git show 00cdcdb:docs/avance-requisitos.xlsx > copia.xlsx`.
- **Responsable de esta tarea:** agente ejecutor (Claude de Luis). Solo documentación y Excel; el reparto de las implementaciones está en `docs/plan-trabajo.md`.

## Actualización del 2026-10-19 (tarea L7)

| Req. | Antes | Ahora | Fuente | Evidencia y motivo |
|---|---|---|---|---|
| RQF-09 | Implementado | **Parcial** | Issue #24 | Santiago confirmó contra una copia de la base real que `POST /api/admin/notificaciones/enviado` no guarda nada: `envio_mensaje` no tiene `canal` (usa `id_canal`, con FK a `canal_comunicacion`, y exige `mensaje_copiado` NOT NULL; también tiene `enviado_por`), y `canal_comunicacion` solo tiene filas para los 3 gimnasios de ejemplo. El endpoint responde 503 y el frontend oculta el error (`MiembrosPage.jsx:847-849`, `MenuNotificaciones.jsx:95-98`). Así, el registro de la fecha y el estado de cada envío no funciona con el esquema real. El insert en `notificacion` (`leido`/`leida` y `tipo`) lo corrige el PR #23. Falta decidir cómo se crea el canal WhatsApp de cada gimnasio, qué va en `mensaje_copiado` y si `enviado_por` es el usuario del token. |
| RQNF-10 | Parcial | **Implementado** | Issue #24 y PR #27 | El issue #24 confirmó contra la copia de la base real la diferencia de `envio_mensaje` y `notificacion` con producción que el verificador había encontrado en la sección 15. La migración 014 (PR #27, tarea L1 de Luis) reconstruye esas dos tablas con el DDL de `ConsultasDB` sin perder filas, y el `pg_dump -s` de las dos tablas y sus secuencias sale idéntico al de producción (verificador `54b3cce`, secciones 29.1 y 31). Observaciones: todavía difieren 13 tablas que el código no usa; hay prefijos repetidos (004 y 005) y `backend/src/db/migrations/001_invitacion_staff.sql` no se aplica. |
| RQF-06 | Parcial | **Implementado** | PR #23 | El check-in bloquea la membresía vencida o sin plan sin contar asistencia (`checkin.js:123-147`) y el intento queda en la campana del administrador, sin repetirse en 10 minutos (`lib/accesos.js:20`, `:33-52`; `notificaciones.js:74-109`, `:168-182`), con «Visto» y refresco cada 30 s (verificador, secciones 27.1, 29.2 y 31). Observaciones: un congelado con el plan vigente todavía entra (la parte de RQF-04 que le falta a Santiago) y la deduplicación es de 10 minutos. |

**No cambian todavía:** RQF-14 (PR #10, con cambios pendientes), y RQNF-15 y RQNF-09 (PR #28, pendiente del 403).

**Paso previo a la release del miércoles:** correr la 014 en una copia de producción dentro de `BEGIN; … ROLLBACK;` y confirmar que imprime dos veces «sin cambios» (una por `notificacion` y otra por `envio_mensaje`), como recomienda el verificador en las secciones 29.1 y 31.

## Actualización del 2026-10-18 (tarea L7)

Solo se marcó lo que está fusionado en `develop` y revisado por el verificador (informe en la rama del verificador: `386d168`, sección 14; `94d5fbb`, secciones 15 y 16; `1be53f7`, secciones 18 a 21; `b8f99d2`, secciones 22 a 25).

| Req. | Antes | Ahora | PR | Evidencia y motivo |
|---|---|---|---|---|
| RQF-02 | Parcial | **Implementado** | #18 | El token del personal siempre vence: 8 h por defecto o `JWT_EXPIRES_IN`, con 8 h si la configuración no es válida (`auth-helpers.js:113`, `:135-143`); `authenticate` rechaza los tokens sin vencimiento (`middleware/auth.js:63`). La sesión se cierra tras 30 min sin actividad, compartido entre pestañas (`AuthContext.jsx:23-27`, `:150-178`), al vencer el token y ante un 401. Verificador, secciones 22.6 y 25.4. Observaciones: `CheckinPage.jsx` (Santiago) todavía no llama a `marcarActividad()`, así que un kiosco que solo usa la cámara se cierra a los 30 min; `render.yaml:19` usa 24h y `docker-compose.yml:61`, 7d. |
| RQF-01 | Parcial | **Implementado** | #19 | `PATCH /api/admin/staff/:id` (`staff.js:388`) edita el nombre y el rol, desactiva y reactiva, y protege al dueño (`:424`); `authenticate` vuelve a leer al personal en cada petición (`middleware/auth.js:10`, `:78`), así que una cuenta desactivada pierde el acceso enseguida; dueño explícito en `gimnasio.id_dueno` (migración 013). Verificador, sección 25. Observación: se recomienda una FK compuesta `(id_dueno, id_gimnasio) → usuario (id_usuario, id_gimnasio)`, porque hoy `id_dueno` puede apuntar a un usuario de otro gimnasio. |
| RQF-07 | Parcial | **Implementado** | #16 y #22 | El día se corta en hora de Colombia (`dashboard.js:69`, `:74`) en «entradas de hoy» (`:170`), la semana (`:233`) y las horas pico (`:337`, `:356`); gráfica de horas pico que abre en «Hoy» (`DashboardPage.jsx:172`, `:226`) y refresco cada 60 s con la pestaña visible, sin cargas en paralelo (`:239-246`, `:279-288`). Desde el #22, «Vencen en 7 días» y «Próximos vencimientos» no cuentan las congeladas (`dashboard.js:85`). Verificador, secciones 19, 21.1 y 24. Observación: las columnas `DATE` siguen con `CURRENT_DATE` en UTC (un día de desfase de 19:00 a 24:00). |
| RQF-04 | Parcial | **Parcial** | #17 | Congelar y descongelar ya están en `develop` (`miembros.js:810`, `:869`, `:892`; migración 010). Sigue Parcial por decisión de Luis: falta que el job de vencimientos y el check-in salten las congeladas (ver abajo). |
| RQNF-05 | Parcial | **Implementado** | #11 | `vista.js` exige rol de personal (`:20`), rechaza al personal sin gimnasio (`:28`) y filtra por gimnasio (`:32`, `:46`) sobre la vista de la migración 011; `asistencia.js:22` exige rol de personal; `checkin.js:26, :31` deriva la clave del QR una sola vez; 9 pruebas en `backend/tests/aislamiento.test.js`. Ya no queda ninguna consulta sin filtro de gimnasio. La medición del tiempo con volumen realista sigue en RQNF-01. |
| RQF-22 | Pendiente | **Implementado** | #15, #21 y #19 | `auth.js:576-641`: solo el dueño, que desde el #19 es `gimnasio.id_dueno` (`:606`), y con su contraseña (`:611`), comprobados antes del `BEGIN` (`:616`); un `SAVEPOINT` por paso (`:562`) y el gimnasio al final (`:623`). El verificador lo probó con el handler real en PostgreSQL 18: 200 sin dejar filas del gimnasio ni tocar las de otro, 403 al administrador invitado y con la contraseña mala, y 500 sin borrar nada si una FK desconocida lo bloquea (secciones 16 y 21.2). |
| RQF-13 | Parcial | **Parcial** | #9 | Ver el criterio de abajo. |
| RQNF-10 | Parcial | **Parcial** | #14 | La 009 cierra auditoría y gamificación, pero el código escribe `envio_mensaje.canal` y `notificacion.leido` (`notificaciones.js:211`, `:217`), que no existen en el esquema de producción (verificador, sección 15). |

**Criterio para RQF-13 (sigue Parcial).** El PR #9 arregló lo que lo dejaba en Parcial: `sendWhatsAppText` ahora lanza un error en los cuatro casos de fallo (`whatsapp.js:223-246`), `admin-contrato.js:130-138` registra `exito = false` y hay 5 pruebas. Pero el requisito pide que el administrador pueda enviar el contrato, y tras cada reinicio del servidor eso no pasa: `admin-contrato.js:107` pregunta `isWhatsAppReady()` antes de enviar, el cliente se inicia de forma perezosa (`whatsapp.js:146`) y nadie lo inicia desde ese flujo. El administrador recibe «no autenticado» y la instrucción de escanear un QR que nunca se imprime. Solo funciona si antes otro flujo inició el cliente (el alta de un miembro con teléfono). En Render, que duerme y reinicia el servicio, eso es lo normal. Lo principal funciona, pero falta una parte: Parcial. Pasa a Implementado cuando se quite esa comprobación previa (o se inicie el cliente antes), lo mismo que pide el verificador para el job del PR #10.

**Criterio para RQF-04 (sigue Parcial con el #17 fusionado).** Por decisión de Luis (2026-10-18), una membresía congelada tampoco debe recibir avisos de vencimiento ni entrar al gimnasio. Falta que Santiago haga que el job de vencimientos (`expiracion.js`) salte las congeladas y que el check-in niegue el ingreso con estado `CONGELADO` y el mensaje «Tu membresía está congelada. Pide en recepción que la reactiven para poder ingresar.» (`checkin.js` y `CheckinPage.jsx`). Hoy el job le avisaría a un congelado que su plan vence, y el check-in lo deja entrar. RQF-04 pasa a Implementado cuando esos dos cambios estén fusionados y verificados.

**Sin cambio hasta que se fusione:** RQF-14 (PR #10, el verificador pidió cambios).

**Riesgos anotados, sin cambio de estado:**
- **RQF-22:** solo el dueño, con su contraseña (PR #21). Falta el límite de intentos en `DELETE /api/auth/account`: con un token robado del dueño se puede probar su contraseña sin freno. Es una línea en `index.js`, antes de la `:81` (zona de Daniel).
- **RQF-09:** confirmado el 2026-10-19 (issue #24): pasó a Parcial, ver la actualización del 2026-10-19.

## Resultado

| Alcance | RF | RNF | Global |
|---|---:|---:|---:|
| **Final (RQF-01..22, RQNF-01..15)** | 75,0 % (16,5 puntos de 22) | 66,7 % (10 puntos de 15) | **71,6 % (26,5 puntos de 37)** |
| Solo original del docx (RQF-01..12, RQNF-01..08) | 62,5 % (7,5 puntos de 12) | 56,3 % (4,5 puntos de 8) | 60,0 % (12 puntos de 20) |

Fórmula: (implementados + 0,5 × parciales) / total; los puntos son esa suma. El 2026-10-16 el avance era 62,2 % (23/37, la cifra conciliada con el verificador); RQF-22 suma 1 punto, y RQNF-05, RQF-07, RQF-02 y RQF-01 medio cada uno; el 2026-10-19 RQF-09 resta medio (issue #24) y RQNF-10 y RQF-06 suman medio cada uno. **No llega al 80 %: faltan 3,1 puntos** (el 80 % de 37 son 29,6); ver la hoja «Trabajo pendiente». El PR #4 decía 80,5 % porque daba por implementados requisitos que el código no respalda y contaba aparte funciones que repetían otras (ver «Correcciones»).

**Decisión de Luis aplicada (2026-10-16):** se retiraron RQF-23 (repetía RQF-08), RQF-24 (repetía RQF-05) y RQF-25 (repetía RQF-03 y es un defecto de seguridad), y RQF-26 (editar el perfil) se fusionó en RQF-15. La numeración queda consecutiva, sin renumerar. Con los cuatro, el avance habría sido 63,4 % (26 puntos de 41).

**Ruta más corta al 80 %** (hoja «Trabajo pendiente»):
- Seis arreglos o pruebas de esfuerzo bajo: CORS, envío del contrato tras un reinicio, avisos de WhatsApp, registro de cada envío (RQF-09), límites de intentos y prueba de usabilidad → **81,1 %**, por encima de la meta.
- Después, la prueba de navegadores (RQNF-06) → 82,4 % y la medición del check-in con unos 200 miembros (RQNF-01) → 85,1 %. La búsqueda del QR ya se corrigió en el PR #11.

## Qué se hizo

1. **`docs/Proyecto FitLoyalty - requisitos actualizados.docx`**: se rearmó desde el original de `Documentación/` (54b19fa). Solo cambian las tablas 5 y 6 y un párrafo de resumen tras cada una; el resto del documento conserva el mismo texto y las demás partes del archivo (imágenes, estilos, encabezados) son idénticas byte a byte.
   - Numeración de Santiago sin los requisitos retirados (RQF-01..22, RQNF-01..15), con columnas Estado y Evidencia.
   - Estilo del original en todas las filas: Times New Roman 12, encabezado verde, sombreado alterno. En la versión de Santiago, las filas nuevas y las columnas agregadas usaban otra fuente en 8–9 pt.
   - La descripción de RQF-08 pasó de la fuente Gungsuh (herencia de Google Docs) a Times New Roman.
   - Se revisó renderizado en Word: sin palabras partidas ni texto sobrante.
2. **`docs/avance-requisitos.xlsx`**: el Excel de Santiago con sus hojas Resumen, RF, RNF y Trabajo pendiente, sus dos gráficos y su estilo.
   - Todas las cifras ahora son fórmulas; en la versión de Santiago eran números fijos.
   - La escala y la meta son celdas editables en Resumen, y se agregó la tabla del alcance original.
   - RF y RNF incluyen los estados verificados, evidencia archivo:línea, Puntaje, Origen, HU y referencias.
   - «Trabajo pendiente» es la ruta al 80 %.
   - Hoja nueva **Evidencias** (EV-01..50).
   - Se recalculó con Excel: 0 errores de fórmula.
3. **`Documentación/Plantilla historias de usuario.xlsx`**:
   - HU-54..58 reapuntadas a la numeración de Santiago.
   - Nuevas HU-59..63 para RQF-17, 18, 20, 21 y 22, con 5 criterios cada una.
   - HU-64..66 se escribieron para RQF-23, 25 y 26 y, al retirarlos, se reasignaron sin borrarlas: HU-64 a RQF-08, HU-65 a RQF-03 y HU-66 a RQF-15. HU-34 queda en RQF-05 y RQF-07.
   - Las 22 RF tienen al menos una HU y la lista de prioridad cubre las 66.
   - HU-11 y HU-40 ya no citan RQF-08 por error.
4. **`Documentación/Proyecto FitLoyalty.docx`**: restaurado al original (54b19fa). La versión final vive solo en `docs/`.
5. **`docs/matriz-requisitos.md`**: la misma matriz en markdown para revisarla en el PR (foto del 2026-10-16; la fuente con fórmulas es el Excel).
6. **`docs/evidencias/cobertura-backend-2026-10-16.txt`**: la medición de cobertura usada para RQNF-07.

## Criterios acordados con Luis (2026-10-16)

Primera ronda:
- Implementado solo si todas las partes del requisito tienen evidencia; Parcial (0,5) si funciona lo principal pero falta alguna parte; sin evidencia vale 0.
- La meta es el 80 %. No se recorta alcance; Luis decide con la ruta.
- Hallazgos fuera de alcance: solo se anotan.
- No se instala `gh`.

Segunda ronda, cuando Luis eligió la versión de Santiago como base:
1. Numeración de Santiago (RQF-13..26, RQNF-09..15).
2. Restaurar el docx de `Documentación/` al original.
3. Conservar las columnas Estado y Evidencia, con el estilo del original.
4. Vocabulario Implementado / Parcial / Pendiente.
5. Aplicar las correcciones de estado y de redacción.
6. Excel con fórmulas y hoja Evidencias, sin perder hojas ni gráficos.
7. Sin pruebas en vivo: la verificación es por lectura de código, pruebas existentes y CI.

Tercera ronda, tras el informe del verificador:
8. Retirar RQF-23, RQF-24 y RQF-25 y fusionar RQF-26 en RQF-15 («retíralos»).

## Hallazgos del verificador aplicados (fase 2, commit `70dd13c`, sección 12)

Comprobados otra vez contra el código antes de aplicarlos:

| Req. | Antes | Ahora | Motivo |
|---|---|---|---|
| RQF-22 | Implementado | **Pendiente** | La eliminación de cuenta aborta la transacción y el gimnasio queda intacto: `safe()` (`auth.js:496-502`) no usa `SAVEPOINT` y ninguna migración crea `auditoria`. Probado por el verificador en PostgreSQL 18 (§11.2.1). Yo lo había marcado leyendo solo el código. |
| RQF-13 | Implementado | **Parcial** | Con WhatsApp listo, un envío fallido queda como exitoso: `sendWhatsAppText` se traga el error (`whatsapp.js:244-246`) y el `catch` de `admin-contrato.js:132-138` nunca corre. |
| RQF-14 | Implementado | **Parcial** | Si WhatsApp no está listo, `sendWhatsAppText` vuelve sin error y el job marca el aviso como enviado (`expiracion.js:206-207`); nunca se reintenta. |
| RQNF-09 | Implementado | **Parcial** | `verify-reset-code` (`auth.js:360`) y `reset-password` (`:399`) no tienen límite de intentos. |
| RQNF-10 | Implementado | **Parcial** | Una base creada solo con `backend/migrations` no tiene `vista_miembros_activos`, `auditoria` ni las columnas de `reto` e `hito_gamificacion` que usa el código. |

También:
- **RQF-17:** sigue Implementado, pero ahora anota el riesgo de seguridad: si el correo no sale, el código vuelve en la respuesta (`auth.js:337-346`) y su validación no tiene límite. Se quitó la cita a TC-2.1..2.3 de `Informe_Pruebas_E2E.md`, que probó el flujo viejo por enlace.
- **RQF-21:** se acotó al pago, porque el plan y la vigencia ya están en RQF-04.
- **RQF-16:** observación de que el campo «días de prueba» de Configuración no tiene efecto.
- **Ruta al 80 %:** RQNF-01 solo cuenta después de corregir la búsqueda del QR y medir con volumen realista; RQF-25 dejó de sumar y después se retiró.
- RQF-23 a RQF-26: retirados o fusionados por decisión de Luis (ver «Resultado»).
- Las hojas se siguen llamando RF y RNF, como en el Excel de Santiago.

## Correcciones a la versión de Santiago (PR #4)

| Req. | PR #4 | Verificado | Motivo |
|---|---|---|---|
| RQF-06 | Implementado | Parcial | Bloquea, pero no avisa al administrador del intento bloqueado (`checkin.js:116-136`). |
| RQF-07 | Implementado | Parcial | No hay gráfica de horas pico (es por día de la semana, `dashboard.js:189`) y el panel no se actualiza solo. |
| RQF-11 | Parcial | Pendiente | Ningún archivo calcula rachas; la app solo lee hitos cargados por SQL. |
| RQF-12 | Parcial | Pendiente | No hay creación de retos, el check-in no actualiza el progreso y no hay notificación. |
| RQF-22 | Implementado | Pendiente | La eliminación de cuenta falla siempre (hallazgo del verificador, ver arriba). |
| RQF-23 | Implementado | Retirado | Repetía RQF-06, RQF-07 y RQF-08 (el mismo código de la campana). |
| RQF-24 | Implementado | Retirado | Repetía RQF-05; ninguna pantalla con ruta usa `/api/asistencia`. |
| RQF-25 | Implementado | Retirado | Repetía RQF-03 y es un defecto: `vista.js` no filtra por gimnasio (fuga de datos); el arreglo queda en RQNF-05. |
| RQF-26 | Implementado | Fusionado en RQF-15 | Es una pantalla más de la misma app. |
| RQNF-04 | Pendiente | Parcial | El flujo manual de 2 interacciones sí está en el código; falta la prueba con usuarios. |
| RQNF-05 | Implementado | Parcial | La fuga de `vista.js` rompe el aislamiento entre gimnasios. |
| RQNF-15 | Implementado | Pendiente | CORS acepta cualquier origen (`index.js:54`). |

Ajustes de redacción:
- **RQF-13:** se quitó «con veracidad» y se agregó «registrando cada intento como constancia»; el texto conserva «informando si el envío no se pudo completar», que es lo que el sistema debe hacer y por eso queda Parcial.
- **RQF-14:** el módulo pasa a Gestión de Miembros, porque el aviso es de vencimiento y no de abandono. Además, los días de anticipación los define cada gimnasio, pero solo en la base de datos, sin pantalla.
- **RQF-15:** dice «hitos y retos» en lugar de «rachas», que no existen, y suma «edición del perfil» (antes RQF-26).
- **RQF-16:** el módulo pasa a Suscripción SaaS, porque el sistema no cobra, y se agregó el bloqueo al vencer la prueba.
- **RQF-20:** dice «precio de cada tipo de plan», porque no hay un catálogo de planes editable.
- **RQNF-09:** se agregó el límite de intentos del login de la app.
- **RQNF-11:** se detalla qué valida el CI.

## Equivalencias con mi primera versión (commits anteriores de esta rama)

| Mi versión anterior | Numeración final |
|---|---|
| RQF-13 Contrato por WhatsApp | RQF-13 |
| RQF-14 Aviso de vencimiento | RQF-14 |
| RQF-15 Registro + prueba de 14 días | RQF-16 (prueba) + RQF-19 (registro) |
| RQF-16 App móvil | RQF-15 (incluye la edición del perfil) |
| RQNF-09 CI | RQNF-11 |
| Mi Excel de 25 requisitos (62 %) | Reemplazado por el de Santiago corregido (commit `e621df7` en el historial) |

## Qué necesito de Santiago

> Actualizado el 2026-10-18: la eliminación de cuenta quedó resuelta en el PR #15, el error de `sendWhatsAppText` en el PR #9 (falta que el contrato y el job inicien el cliente tras un reinicio) y la fuga de `vista.js` en el PR #11.

1. **Antes de la entrega:** arreglar la eliminación de cuenta (RQF-22: un `SAVEPOINT` por cada `safe()` y no insertar en `auditoria` lo que se borra), relanzar el error en `sendWhatsAppText` (RQF-13 y RQF-14), no devolver el código de recuperación en la respuesta y limitar `verify-reset-code` y `reset-password` (RQF-17 y RQNF-09).
2. **Urgente (seguridad):** `GET /api/vista/miembros-activos` (`backend/src/routes/vista.js:20-42`) no filtra por gimnasio y solo pide `authenticate`. Cualquier token, incluido el de un miembro en la app, devuelve nombre, documento, teléfono, correo y QR de los miembros de todos los gimnasios. Hay que filtrar por `req.user.gymId` con rol de personal, o retirar la ruta.
3. **CORS** (`backend/src/index.js:54`): rechazar los orígenes que no estén en `FRONTEND_URL`.
4. **Implementaciones de la ruta**, en este orden: RQF-02 (cierre por inactividad y expiración real del JWT), RQF-07, RQF-06, RQF-01, RQF-04. Después, si se puede: RQF-08, RQNF-07, RQF-11, RQF-12 y RQF-10.
5. **El PR #4 ya está integrado aquí:** al fusionar este PR, cerrar el #4 sin fusionarlo, para no volver a meter el 80,5 % sin verificar.
6. **Avisar cada vez que se fusione una implementación.** Hay que cambiar el Estado en la hoja RF o RNF del Excel (el resto se recalcula) y actualizar a mano la columna Estado y el párrafo de resumen del docx de `docs/`.

## Hallazgos fuera de alcance (no se tocaron)

- **Seguridad:** la fuga de datos entre gimnasios de `vista.js` (punto 2 de arriba). **Resuelto en el PR #11.**
- **Seguridad:** CORS abierto con `credentials: true` (`index.js:50-57`).
- **Seguridad:** el código de recuperación de contraseña vuelve en la respuesta si el correo no sale (`auth.js:337-346`), y `verify-reset-code` y `reset-password` no tienen límite de intentos.
- **Funcional:** `sendWhatsAppText` (`whatsapp.js:222-247`) no avisa cuando falla o cuando el cliente no está listo; por eso el contrato y los avisos de vencimiento se registran como enviados sin haber salido. **Resuelto en el PR #9**; queda que el contrato y el job no inician el cliente tras un reinicio (RQF-13 y PR #10).
- **Funcional:** la eliminación de cuenta (`auth.js:480-561`) siempre falla y responde 500 (RQF-22). **Resuelto en el PR #15.**
- **Seguridad:** el JWT del personal no expira, porque `generarToken` ignora `JWT_EXPIRES_IN` (`backend/src/lib/auth-helpers.js:102-113`). **Resuelto en el PR #18.**
- **Seguridad:** `/api/asistencia` solo exige `authenticate`, así que un miembro desde la app puede listar los ingresos de su gimnasio (`asistencia.js:21`). **Resuelto en el PR #11.**
- **Seguridad:** `Evidencias_Sustentacion/Informe_Pruebas_E2E.md` («Datos de prueba generados») deja una contraseña de un usuario de prueba en texto plano. Conviene cambiarla y quitarla del documento.
- **Seguridad (2026-10-18):** `COMO_CORRER.md` tenía en la sección de Render una `JWT_SECRET` y una `SMTP_PASSWORD` reales. Se cambiaron por marcadores, pero siguen en el historial del repositorio público: hay que rotar la `JWT_SECRET` en Render y revocar la contraseña de aplicación de Gmail. `Evidencias_Sustentacion/Santiago/C2_Recuperacion_Clave/README.md:27` tiene otra contraseña de aplicación de Gmail; ese archivo es de Santiago y no se tocó.
- **Seguridad:** la clave para cifrar el QR tiene un valor por defecto en el código (`miembros.js:36`, `checkin.js:19`).
- **Pruebas:** 2 de las 23 pruebas de `backend/tests/auth-helpers.test.js` fallan, y `backend/package.json` no tiene script `test`, así que el CI no las ejecuta.
- **Rendimiento:** si el QR no coincide directo, `checkin.js:83-101` descifra en memoria los QR de todos los miembros del gimnasio. **Mejorado en el PR #11:** la clave se deriva una sola vez y queda un descifrado AES por miembro.
- **Código muerto:** `frontend/src/pages/DashboardUsuario.jsx` no tiene ruta en `App.jsx`.
- **Comentarios desactualizados:** dicen «trial de 7 días» cuando el valor es 14 (`auth.js:6, :98`, `trial.js:7`).
- **Pendiente de evidencia:** no se construyó la imagen Docker (RQNF-08), porque Docker Desktop estaba apagado.
- **Otros Excel de `Documentación/`** (Product Backlog, Matriz de priorización, Cálculo de horas) llegan hasta HU-53; no incluyen HU-54..66.

## Cómo verificar

- **Porcentajes:** `docs/avance-requisitos.xlsx` → Resumen. Todo son fórmulas sobre las hojas RF y RNF.
- **Evidencias:** hoja Evidencias, con la ruta del archivo y la línea en el commit `54b19fa`; las filas fechadas el 2026-10-18 citan `develop` @ `1ddcb24` o, las de RQF-01, RQF-02, RQF-04, RQF-07 y RQF-22, `develop` @ `f3d323c` o `bdf987b`; las del 2026-10-19, `develop` @ `dcda269` (RQF-09, con el issue #24) o `66186d7` (RQNF-10 y RQF-06).
- **Documento:** `docs/Proyecto FitLoyalty - requisitos actualizados.docx`, tablas 5 y 6.
- **Cobertura:** `docs/evidencias/cobertura-backend-2026-10-16.txt`.
- **CI:** pestaña Actions del repositorio (ejecución exitosa en `main` 8acab31).
