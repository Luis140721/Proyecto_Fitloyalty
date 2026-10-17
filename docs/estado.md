# Estado: avance real de requisitos

- **Fecha:** 2026-10-16
- **Rama:** `docs/avance-requisitos` (PR hacia `main`)
- **Código verificado:** `main` @ `54b19fa`. El PR #5 (`8acab31`) solo agregó `CONTRIBUTING.md` y el check de nombre de rama al CI (sin cambios en el código de la app); se fusionó en esta rama y es la base de la evidencia del CI.
- **Base de la documentación:** por decisión de Luis, los archivos de Santiago del PR #4 (`docs/borrador-matriz-requisitos` @ `00cdcdb`), verificados y corregidos aquí.
- **Copias de seguridad:** los originales de `Documentación/` están en `54b19fa` y los archivos de Santiago sin corregir en el commit `5db4e2a` de esta rama (o en `00cdcdb`). Ejemplo: `git show 00cdcdb:docs/avance-requisitos.xlsx > copia.xlsx`.
- **Responsable de esta tarea:** agente ejecutor (Claude de Luis). Solo documentación y Excel; las implementaciones las hace Santiago en sus ramas.

## Resultado

| Alcance | RF | RNF | Global |
|---|---:|---:|---:|
| Completo (RQF-01..26, RQNF-01..15) | 73,1 % (19/26) | 66,7 % (10/15) | **70,7 % (29/41)** |
| Solo original del docx (RQF-01..12, RQNF-01..08) | 50,0 % (6/12) | 50,0 % (4/8) | 50,0 % (10/20) |

Fórmula: (implementados + 0,5 × parciales) / total. **No llega al 80 %**: faltan 3,8 puntos (el 80 % de 41 son 32,8). El PR #4 decía 80,5 % porque daba por implementados varios requisitos que el código no respalda (ver «Correcciones»).

**Ruta más corta al 80 %** (de la hoja «Trabajo pendiente»): corregir CORS (RQNF-15), corregir la fuga de `vista.js` (RQF-25, y con eso RQNF-05), medir el tiempo del check-in (RQNF-01) y hacer la prueba de usabilidad del check-in (RQNF-04) → **80,5 %**. Las dos primeras son de Santiago; las mediciones, de Luis o Santiago.

## Qué se hizo

1. **`docs/Proyecto FitLoyalty - requisitos actualizados.docx`**: se rearmó desde el original de `Documentación/` (54b19fa). Solo cambian las tablas 5 y 6 y un párrafo de resumen tras cada una; el resto del documento queda idéntico byte a byte.
   - Numeración de Santiago (RQF-01..26, RQNF-01..15), con columnas Estado y Evidencia.
   - Estilo del original en todas las filas: Times New Roman 12, encabezado verde, sombreado alterno. En la versión de Santiago, las filas nuevas y las columnas agregadas usaban otra fuente en 8–9 pt.
   - La descripción de RQF-08 pasó de la fuente Gungsuh (herencia de Google Docs) a Times New Roman.
   - Se revisó en Word: 25 páginas, sin palabras partidas ni texto sobrante.
2. **`docs/avance-requisitos.xlsx`**: el Excel de Santiago con sus hojas Resumen, RF, RNF y Trabajo pendiente, sus dos gráficos y su estilo.
   - Todas las cifras ahora son fórmulas; en la versión de Santiago eran números fijos.
   - La escala y la meta son celdas editables en Resumen, y se agregó la tabla del alcance original.
   - RF y RNF incluyen los estados verificados, evidencia archivo:línea, Puntaje, Origen, HU y referencias.
   - «Trabajo pendiente» es la ruta al 80 %.
   - Hoja nueva **Evidencias** (EV-01..53).
   - Se recalculó con Excel: 0 errores de fórmula.
3. **`Documentación/Plantilla historias de usuario.xlsx`**:
   - HU-54..58 reapuntadas a la numeración de Santiago.
   - HU-34 cubre también RQF-24.
   - Nuevas HU-59..66 para RQF-17, 18, 20, 21, 22, 23, 25 y 26, con 5 criterios cada una.
   - Las 26 RF tienen al menos una HU y la lista de prioridad cubre las 66.
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

## Correcciones a la versión de Santiago (PR #4)

| Req. | PR #4 | Verificado | Motivo |
|---|---|---|---|
| RQF-06 | Implementado | Parcial | Bloquea, pero no avisa al administrador del intento bloqueado (`checkin.js:116-136`). |
| RQF-07 | Implementado | Parcial | No hay gráfica de horas pico (es por día de la semana, `dashboard.js:189`) y el panel no se actualiza solo. |
| RQF-11 | Parcial | Pendiente | Ningún archivo calcula rachas; la app solo lee hitos cargados por SQL. |
| RQF-12 | Parcial | Pendiente | No hay creación de retos, el check-in no actualiza el progreso y no hay notificación. |
| RQF-25 | Implementado | Pendiente | `vista.js` no filtra por gimnasio (fuga de datos), la vista no está en las migraciones y ninguna pantalla la usa. |
| RQNF-04 | Pendiente | Parcial | El flujo manual de 2 interacciones sí está en el código; falta la prueba con usuarios. |
| RQNF-05 | Implementado | Parcial | La fuga de `vista.js` rompe el aislamiento entre gimnasios. |
| RQNF-15 | Implementado | Pendiente | CORS acepta cualquier origen (`index.js:54`). |

Ajustes de redacción:
- **RQF-13:** se cambió «informando con veracidad» por «registrando cada intento como constancia».
- **RQF-14:** el módulo pasa a Gestión de Miembros, porque el aviso es de vencimiento y no de abandono. Además, los días de anticipación los define cada gimnasio, pero solo en la base de datos, sin pantalla.
- **RQF-15:** dice «hitos y retos» en lugar de «rachas», que no existen.
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
| RQF-16 App móvil | RQF-15 (+ RQF-26 editar perfil) |
| RQNF-09 CI | RQNF-11 |
| Mi Excel de 25 requisitos (62 %) | Reemplazado por el de Santiago corregido (commit `e621df7` en el historial) |

## Qué necesito de Santiago

1. **Urgente (seguridad):** `GET /api/vista/miembros-activos` (`backend/src/routes/vista.js:20-42`) no filtra por gimnasio y solo pide `authenticate`. Cualquier token, incluido el de un miembro en la app, devuelve nombre, documento, teléfono, correo y QR de los miembros de todos los gimnasios. Hay que filtrar por `req.user.gymId` con rol de personal, o retirar la ruta.
2. **CORS** (`backend/src/index.js:54`): rechazar los orígenes que no estén en `FRONTEND_URL`.
3. **Implementaciones de la ruta**, en este orden: RQF-02 (cierre por inactividad y expiración real del JWT), RQF-07, RQF-06, RQF-01, RQF-04. Después, si se puede: RQF-08, RQNF-07, RQF-11, RQF-12 y RQF-10.
4. **El PR #4 ya está integrado aquí:** al fusionar este PR, cerrar el #4 sin fusionarlo, para no volver a meter el 80,5 % sin verificar.
5. **Avisar cada vez que se fusione una implementación.** Hay que cambiar el Estado en la hoja RF o RNF del Excel (el resto se recalcula) y actualizar a mano la columna Estado y el párrafo de resumen del docx de `docs/`.

## Hallazgos fuera de alcance (no se tocaron)

- **Seguridad:** la fuga de datos entre gimnasios de `vista.js` (punto 1 de arriba).
- **Seguridad:** CORS abierto con `credentials: true` (`index.js:50-57`).
- **Seguridad:** el JWT del personal no expira, porque `generarToken` ignora `JWT_EXPIRES_IN` (`backend/src/lib/auth-helpers.js:102-113`).
- **Seguridad:** `/api/asistencia` solo exige `authenticate`, así que un miembro desde la app puede listar los ingresos de su gimnasio (`asistencia.js:21`).
- **Seguridad:** `Evidencias_Sustentacion/Informe_Pruebas_E2E.md` («Datos de prueba generados») deja una contraseña de un usuario de prueba en texto plano. Conviene cambiarla y quitarla del documento.
- **Seguridad:** la clave para cifrar el QR tiene un valor por defecto en el código (`miembros.js:36`, `checkin.js:19`).
- **Pruebas:** 2 de las 23 pruebas de `backend/tests/auth-helpers.test.js` fallan, y `backend/package.json` no tiene script `test`, así que el CI no las ejecuta.
- **Rendimiento:** si el QR no coincide directo, `checkin.js:83-101` descifra en memoria los QR de todos los miembros del gimnasio.
- **Código muerto:** `frontend/src/pages/DashboardUsuario.jsx` no tiene ruta en `App.jsx`.
- **Comentarios desactualizados:** dicen «trial de 7 días» cuando el valor es 14 (`auth.js:6, :98`, `trial.js:7`).
- **Pendiente de evidencia:** no se construyó la imagen Docker (RQNF-08), porque Docker Desktop estaba apagado.
- **Otros Excel de `Documentación/`** (Product Backlog, Matriz de priorización, Cálculo de horas) llegan hasta HU-53; no incluyen HU-54..66.

## Cómo verificar

- **Porcentajes:** `docs/avance-requisitos.xlsx` → Resumen. Todo son fórmulas sobre las hojas RF y RNF.
- **Evidencias:** hoja Evidencias, con la ruta del archivo y la línea en el commit `54b19fa`.
- **Documento:** `docs/Proyecto FitLoyalty - requisitos actualizados.docx`, tablas 5 y 6.
- **Cobertura:** `docs/evidencias/cobertura-backend-2026-10-16.txt`.
- **CI:** pestaña Actions del repositorio (ejecución exitosa en `main` 8acab31).
