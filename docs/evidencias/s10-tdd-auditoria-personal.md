# S10 (TDD): auditoría de los cambios a las cuentas del personal

> Semana 10 del bootcamp, tema común TDD. Parte de Luis: **servicio y endpoint**. Este archivo se escribe **antes** del primer commit de código y se actualiza al marcar cada caso.

## Historia

**HU-04, criterio 4** (`Documentación/Plantilla historias de usuario.xlsx`): «Se registra la eliminación en el log de auditoría con fecha y responsable».

> Como administrador del gimnasio, quiero que cada desactivación, reactivación o cambio de rol de una cuenta del personal quede en la auditoría con la fecha y quién lo hizo, para saber quién quitó o dio acceso.

En FitLoyalty «eliminar» una cuenta del personal es **desactivarla** (`PATCH /api/admin/staff/:id` con `activo: false`, RQF-01). Hoy ese cambio no deja rastro: `docs/matriz-requisitos.md` (fila RQF-01) anota que el PATCH «no escribe en auditoria (criterio 4 de HU-04)». La tabla `auditoria` ya existe (migración 009) y la usa el envío del contrato.

No choca con el PR #75 (retos), ni con RQF-09 o RQF-10, que no tocan `staff.js` ni `StaffPage.jsx`.

## Criterios de aceptación

1. **Desactivar.** Dado un admin que desactiva la cuenta de una recepcionista, cuando el cambio se guarda, entonces queda una fila en `auditoria` con:
   - `tabla_afectada = 'usuario'`, `id_registro` = la cuenta editada y `accion = 'UPDATE'`;
   - `id_usuario` = el admin que hizo el cambio (el responsable) e `id_gimnasio` = su gimnasio;
   - `detalle = { eventos: ['DESACTIVADA'], antes: { activo: true }, despues: { activo: false } }`;
   - `fecha_evento` la pone la BD (`DEFAULT CURRENT_TIMESTAMP`).
2. **Reactivar.** Reactivar una cuenta inactiva deja el evento `REACTIVADA`.
3. **Cambio de rol.** Cambiar el rol deja `ROL_CAMBIADO`, con el rol de antes y el de después.
4. **Nombre.** Cambiar el nombre deja `NOMBRE_CAMBIADO`, con el nombre de antes y el de después. Si en una petición cambian varias cosas, queda **una** fila con todos los eventos.
5. **Sin cambio real, sin fila.** Si la petición no cambia nada (desactivar una cuenta ya inactiva, poner el mismo rol), no se escribe en la auditoría.
6. **Petición rechazada, sin fila.** Un PATCH que responde 400, 403 o 404 no escribe en la auditoría.
7. **Todo o nada.** Si la fila de auditoría no se puede guardar, el API responde `503 DB_UNREACHABLE` y la cuenta queda como estaba: el cambio y su registro van en la misma transacción.
8. **Historial.** `GET /api/admin/staff/:id/auditoria` devuelve el historial de esa cuenta, el más reciente primero, con la fecha, el nombre del responsable y los eventos. Solo para admin. Una cuenta de otro gimnasio responde `404 STAFF_NOT_FOUND`.

## Lista de pruebas

Se marca cada caso al terminar su ciclo. Los casos que aparezcan en el camino se agregan al final, no al ciclo en curso.

**Servicio** (`backend/src/lib/auditoria-personal.js`, función pura `cambiosDeCuenta(antes, despues)`):

- [x] varios cambios a la vez → todos los eventos en una sola entrada (ciclo 4)
- [x] cambio de nombre → `NOMBRE_CAMBIADO` (ciclo 5)
- [x] sin cambios → `null` (lo cubre el resguardo «sin cambio real» del endpoint)

**Endpoint** (`PATCH /api/admin/staff/:id` y `GET /api/admin/staff/:id/auditoria`, con la BD falsa `backend/tests/staff-bd-falsa.js`):

- [x] el PATCH que desactiva escribe la fila con el responsable, el gimnasio y el detalle (ciclo 1)
- [x] reactivar → `REACTIVADA` (ciclo 2)
- [x] cambio de rol → `ROL_CAMBIADO` con el rol de antes y el de después (ciclo 3)
- [x] el PATCH que cambia el nombre deja `NOMBRE_CAMBIADO` (ciclo 6)
- [x] si falla la auditoría: 503 y la cuenta queda como estaba (ciclo 7)
- [x] `GET …/auditoria`: el historial, el más reciente primero, con el nombre del responsable (ciclo 8)
- [x] `GET …/auditoria` de una cuenta de otro gimnasio: 404 (ciclo 9)
- [x] un PATCH rechazado (403) o sin cambio real no escribe fila (resguardo: ya pasaba al escribirlo)

**Casos que aparecieron en el camino:**

- [x] `GET …/auditoria` solo para admin y con el periodo de prueba vigente: 403 y 402 (ciclo 10)
- [x] `GET …/auditoria` con la BD caída: 503 (ciclo 11)
- [x] el rol de antes de un entrenador (`id_rol` 3) salía vacío, porque `ID_ROL` no lo tiene (ciclo 12)
- [ ] **Incidencia:** el orden del historial lo decide el `ORDER BY` del SQL, y la BD falsa ordena por su cuenta. El mutante que invierte el orden sobrevive; lo cubre la capa BD.
- [x] `GET …/auditoria` con un id no numérico: 400 sin consultar, como el PATCH (ciclo 13). En PostgreSQL real el id `NaN` haría fallar la consulta (503); la BD falsa respondía 404.

Los criterios 1 a 8 tienen al menos un test cada uno.

## Reparto por capa

| Capa | Parte de la historia | Quién |
|---|---|---|
| **Servicio** | `cambiosDeCuenta`: qué cambió y con qué evento | Luis |
| **Endpoint** | El PATCH escribe la auditoría en la misma transacción; `GET /api/admin/staff/:id/auditoria` | Luis |
| **Front** | En `StaffPage.jsx`, un botón «Historial» por cuenta que abre la lista de eventos | Otro integrante |
| **E2E** | El flujo completo (especificación abajo), escrito al inicio | Otro integrante |

## Especificación del E2E (para quien haga esa capa)

Archivo sugerido: `e2e/tests/personal-auditoria.spec.js`, contra el backend real con la BD de pruebas de la S7.

1. **Datos:** un gimnasio con su dueño admin («Luis Admin») y una recepcionista activa («Ana Recepción»), creados por la semilla de pruebas.
2. **Pasos:**
   1. Inicia sesión como «Luis Admin» y abre **Personal**.
   2. En la fila de «Ana Recepción», pulsa **Desactivar** y confirma. La fila queda como inactiva.
   3. Pulsa **Historial** en esa fila.
3. **Se espera:** una entrada «Desactivada» con la fecha de hoy y el responsable «Luis Admin».
4. **Segunda parte:** reactivar a Ana y abrir de nuevo el historial. Aparece «Reactivada» arriba de «Desactivada».
5. **Caso negativo:** intentar desactivarse a sí mismo muestra el error `SELF_LOCKOUT` y el historial de la cuenta propia no cambia.

Hasta que el front tenga el botón «Historial», el paso 3 se puede comprobar con `request.get('/api/admin/staff/<id>/auditoria')` dentro del mismo test.
