# Defectos — registro, severidad y ciclo de corrección

**Responsable:** Daniel · **Corte:** 2026-11-22 · **Sistema de seguimiento:**
[GitHub Issues](https://github.com/Luis140721/Proyecto_Fitloyalty/issues?q=label%3Abug)

Cada defecto es un issue con la etiqueta `bug`, una etiqueta de **severidad** y
una de **estado** (criterios en el [plan](plan-de-pruebas.md#6-gestión-de-defectos)).
`registrar-defectos.ps1` crea esas etiquetas y las aplica a los issues de esta tabla.

## Registro de defectos

| ID | Issue | Defecto | Detectado por | Severidad | Estado | Corrección |
|---|---|---|---|---|---|---|
| D-01 | [#24](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/24) | El registro de envíos (`POST /notificaciones/enviado`) no guarda nada con el esquema de producción | Prueba contra una copia del esquema real | Alta | ✅ Verificado (cerrado) | PR #73, commit `30cb421` |
| D-02 | [#80](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/80) | Dos check-in casi simultáneos del mismo miembro guardan dos ingresos | E2E semana 7 (1 de 25 dobles Enter) | Alta | ✅ Verificado (cerrado) | Commit `67478b9` |
| D-03 | [#87](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/87) | Dos altas simultáneas pueden crear dos miembros con el mismo documento (en el esquema de migraciones el índice `(id_gimnasio, documento)` no es único; en ConsultasDB sí) | Revisión de código | Alta | 🔴 Abierto | — |
| D-04 | [#95](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/95) | Si falla el INSERT del plan, el miembro queda guardado sin plan | Prueba de valores límite (`referencia_pago`, `valor_total`) | Alta | 🟡 Corregido, verificado el 2026-11-22: **se puede cerrar** | Transacción del PR #102; prueba nueva `alta-miembro-atomica.test.js` |
| D-05 | [#89](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/89) | La app del miembro deja guardar textos más largos que sus columnas y responde 503 | Prueba de valores límite | Media | 🔴 Abierto | — |
| D-06 | [#98](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/98) | Un corte de red al comprobar la sesión manda al login aunque el token siga vigente | Revisión de código | Media | 🔴 Abierto | — |
| D-07 | [#99](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/99) | Cualquier error de la BD se responde 503 `DB_UNREACHABLE` y esconde la causa real | Revisión de código | Media | 🔴 Abierto | — |
| D-08 | [#111](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/111) | Un WhatsApp de campaña enviado queda como FALLIDO si falla guardar su constancia | Revisión de código | Media | 🔴 Abierto | — |
| D-09 | [#88](https://github.com/Luis140721/Proyecto_Fitloyalty/issues/88) | Los hitos muestran el error de validación en inglés; un id no numérico da 503 | Prueba de valores límite | Baja | 🔴 Abierto | — |
| D-10 | *(issue nuevo, lo crea el script)* | Alta de miembro con nombre de 101 caracteres responde 503 en vez de 400 | **Postman CP-12** (2026-11-22) | Media | 🟠 En corrección | PR #83 (Santiago), sin fusionar |

**Totales:** 10 defectos · 2 verificados · 1 corregido pendiente de cerrar ·
1 en corrección · 6 abiertos · ninguno de severidad crítica.

Defectos anteriores corregidos con PR pero sin issue (historial, no cuentan en
los totales): #55 (fecha de nacimiento vacía al editar), #56 (el ingreso por
documento se guardaba como QR) y #71 (el foco del modal saltaba al botón de
cerrar). Desde T6 cada defecto se registra primero como issue y el commit que
lo corrige lo referencia (`fix(...): ... (cierra #N)`).

## Ciclo detectar → corregir → verificar

En los tres ciclos la verificación es una **re-ejecución real del 2026-11-22**:
la misma prueba se corre sobre el código de antes de la corrección (debe
fallar) y sobre el de después (debe pasar), contra PostgreSQL 16 en un
ambiente desechable. Para el «antes» se usó un `git worktree` en el commit
padre de la corrección, con la prueba de regresión copiada del commit que corrige.

### Ciclo 1 — D-02 (#80): check-in duplicado por concurrencia

| Paso | Evidencia |
|---|---|
| **Detectar** | Issue #80 (2026-11-20): en los E2E de la semana 7, 1 de 25 dobles Enter dejó 2 filas en `checkin`. Causa: el antirrebote (`SELECT` de los últimos 90 s) y el `INSERT` iban en consultas separadas, sin bloqueo. |
| **Caso de prueba** | `backend/tests/integracion/checkin-concurrente.test.js`: un trigger de la BD retrasa 1 s el `INSERT` y se envían dos `POST /api/admin/checkin` a la vez. Esperado: 1 fila, respuestas 201 y 200 `duplicado: true`. |
| **Corregir** | Commit `67478b9` (Luis, 2026-11-19): `fix(checkin): el antirrebote y el INSERT en una transaccion con bloqueo por miembro`. Issue cerrado por el commit. |
| **Verificar** | Antes (`39c0665`, padre de `67478b9`): ❌ `Expected: 1, Received: 2`: quedan **2 ingresos**. Después (`67478b9`): ✅ 1 ingreso, 201 + 200 duplicado. En `develop` (`f3a1a71`) sigue pasando dentro de `test:integracion`. |

### Ciclo 2 — D-01 (#24): el registro de envíos no guardaba nada

| Paso | Evidencia |
|---|---|
| **Detectar** | Issue #24 (Santiago, 2026-10-19): `POST /api/admin/notificaciones/enviado` fallaba contra una copia del esquema real y el frontend se tragaba el error, así que RQF-09 no dejaba constancia de ningún envío. |
| **Caso de prueba** | `backend/tests/registro-envio-real.test.js` (7 pruebas): primer envío crea el canal WHATSAPP y guarda el envío; el segundo reutiliza el canal; cinco envíos a la vez crean un solo canal; otro gimnasio recibe 404; sin mensaje, 400. |
| **Corregir** | PR #73, commit `30cb421` (Luis, 2026-11-13): `feat(notificaciones): el registro de cada envío funciona con el esquema real (RQF-09)`, fusionado el 2026-11-14 y cierra #24. |
| **Verificar** | Base cargada con `ConsultasDB/Query_Inicial_Crear_Tablas.sql` + migraciones. Antes (`442a55c`, padre de `30cb421`): ❌ **5 de 7 fallan**; el error real es `column "canal" of relation "envio_mensaje" does not exist` → 503. Después (`30cb421`): ✅ **7 de 7**. |

### Ciclo 3 — D-10: nombre de 101 caracteres responde 503

| Paso | Evidencia |
|---|---|
| **Detectar** | Caso **CP-12** de la [matriz](matriz-casos-prueba.md#miembros), ejecutado con Newman el 2026-11-22 sobre `develop` (`f3a1a71`): esperado 400 `VALIDATION_ERROR`, obtenido **503 `DB_UNREACHABLE`**. PostgreSQL rechaza el valor (`VARCHAR(100)`) y la ruta convierte el error en 503 (ver también D-07). |
| **Caso de prueba** | CP-12 en `postman/FitLoyalty.postman_collection.json`: `POST /api/admin/miembros` con `nombre` de 101 caracteres. |
| **Corregir** | PR #83 (Santiago, rama `chore/test-semana-06-santiago`): valida el largo de `nombre`, `documento`, `telefono` y `email` en `createSchema` y `updateSchema`. |
| **Verificar** | Re-ejecución de CP-01 a CP-14 contra el backend de la rama del PR #83 (`9e2e061`): ✅ **CP-12 → 400**, y los otros 13 casos siguen pasando (sin regresiones). Falta fusionar el PR #83 y volver a correr la colección en `develop`. |

### Verificación adicional — D-04 (#95): alta atómica

El #95 sigue abierto, pero el alta ya guarda miembro, plan y autorizaciones en
una sola transacción desde el PR #102 (commit `e66e54f`). Para verificarlo se
agregó `backend/tests/integracion/alta-miembro-atomica.test.js`: un trigger de
la BD de pruebas hace fallar el `INSERT` en `plan_cobro` del gimnasio de la prueba.

- ✅ Si falla el plan: el API no responde 201 y no quedan miembro, plan ni autorizaciones.
- ✅ Al quitar la falla, el reintento con el mismo documento crea el miembro (ya no choca con el 409).

Resultado en `develop` (`f3a1a71`): 2 de 2. Propuesta: cerrar #95 citando
esta prueba. No se presenta como ciclo completo porque la versión anterior al
#102 no puede correr la prueba sin reconstruir el arnés de integración, que
todavía no existía.
