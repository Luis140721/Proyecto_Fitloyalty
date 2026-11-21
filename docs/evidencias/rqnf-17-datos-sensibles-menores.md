# RQNF-17: datos sensibles y menores de edad

**Requisito (texto propuesto):** «El sistema debe pedir una autorización expresa, separada y opcional para tratar los datos sensibles del miembro (condiciones médicas y alergias), informándole que no está obligado a darla; cuando el miembro sea menor de edad, debe registrar los datos y la autorización de su representante legal; y debe guardar la prueba de cada autorización (fecha, versión del texto y canal) (Ley 1581 de 2012, arts. 5, 6 y 7; Decreto 1377 de 2013, arts. 6, 7 y 12).»
**Categoría:** Cumplimiento. **Fecha:** 2026-11-17. **Rama:** `feat/rqnf-17-18-legal` @ `e66e54f` (sobre `develop` @ `2794bc5`).
**Resultado:** implementado en el panel, el backend y la app del miembro, con migración 019. Pruebas: 28 con la base simulada (`backend/tests/autorizaciones.test.js`) y 7 contra el esquema real (`backend/tests/legal-real.test.js`, junto con RQNF-18), que pasan en la base de ConsultasDB y en la de las migraciones.

> **Nota legal.** Los textos de las autorizaciones, las páginas legales y las reglas de este documento son una implementación técnica de la ley hecha por el equipo, no una asesoría jurídica. Conviene que los revise un abogado antes de usarlos con miembros reales.
>
> **Sobre las citas del requisito:** la obligación de conservar la prueba de la autorización está en el **art. 8** del Decreto 1377 de 2013 («Prueba de la autorización»); el art. 7 trata del modo de obtenerla (en un medio que permita su consulta posterior). Conviene agregar el art. 8 al texto del requisito cuando se pase a la matriz. En el código y en las páginas se citan los arts. 7 y 8.

## Qué cambió

### Migración 019 (`backend/migrations/019_autorizacion_miembro.sql`)

| Qué | Dónde |
|---|---|
| Columnas del representante en `miembro`: `representante_nombre`, `_tipo_documento`, `_documento`, `_parentesco`, `_telefono` | `019:54-58` |
| Tabla `autorizacion_miembro`: miembro, gimnasio, `tipo`, `otorgada`, `version_texto`, `canal` (`PANEL`/`APP`), `registrada_por` (usuario del personal, NULL si fue en la app), `detalle` (JSONB) y `fecha`. CHECK de `tipo` y de `canal` | `019:60-75` |
| Índice para la vigente de cada tipo (la última fila) | `019:78-79` |
| Los booleanos `acepto_terminos` y `autorizo_datos` (migración 004) se conservan y pasan al historial: una fila `v0`, canal `PANEL`, con la fecha de registro, marcada como migrada | `019:84-111` |

Los tipos son `TERMINOS`, `TRATAMIENTO_DATOS`, `DATOS_SENSIBLES`, `REPRESENTANTE_MENOR` y `MENSAJES_COMERCIALES` (reservado: no lo usa esta rama, queda para registrar la autorización de mensajes comerciales de la Ley 2300). Una fila nunca se actualiza: otorgar o revocar agrega otra.

### Backend

| Qué | Dónde |
|---|---|
| Textos versionados de cada autorización (`v0`, el texto viejo; `v1`, el nuevo). El de datos sensibles dice que son sensibles, para qué se usan, que no está obligado a darla y que la membresía no depende de ella | `backend/src/lib/autorizaciones.js:27-62` (sensibles en `:47-51`) |
| Edad en la zona horaria de Colombia, menor de edad (menos de 18, o TI sin fecha) y fecha de nacimiento válida | `autorizaciones.js:69-121` |
| `representanteSchema` (zod): nombre, tipo (CC, CE, PP) y número de documento, parentesco y teléfono | `autorizaciones.js:133-145` |
| Lectura de la vigente de cada tipo y del historial, siempre por miembro **y** gimnasio; escritura de una fila | `autorizaciones.js:162-213` |
| **Alta:** casilla `autorizo_datos_sensibles` (por defecto `false`) y campos del representante | `backend/src/routes/miembros.js:118-134` |
| **Alta:** `superRefine` con zod: fecha inválida o futura, 400; menor sin representante completo o sin `autoriza_representante`, 400 `REPRESENTANTE_REQUERIDO` | `miembros.js:136-169` (código de error en `:166-169`) |
| **Alta:** sin la autorización, `condiciones_medicas` y `alergias` se guardan en NULL; el representante solo se guarda si es menor | `miembros.js:633-639`, `:678-679` |
| **Alta:** miembro, plan y autorizaciones en una sola transacción (antes el plan iba suelto) | `miembros.js:644-736` |
| **Alta:** una fila por autorización, otorgada o no, con versión, canal `PANEL` y quien registró; si es menor, `REPRESENTANTE_MENOR` con la foto de sus datos y las demás marcadas como dadas por el representante | `miembros.js:327-343` |
| **Edición:** si toca autorizaciones, edad, representante o datos de salud, va por una transacción con el miembro bloqueado; si no, sigue el camino de siempre | `miembros.js:244-257`, `:916-945` |
| **Edición:** menor sin representante completo, 400; si cambian los datos del representante, se pide de nuevo su autorización y queda otra fila | `miembros.js:388-410` |
| **Edición:** revocar (`autorizo_datos_sensibles: false`) agrega la fila de revocación y borra los datos; sin autorización, los datos de salud quedan en NULL | `miembros.js:414-433` |
| **Detalle (`GET /admin/miembros/:id`):** representante, autorizaciones vigentes e historial, y el aviso `datos_sensibles_sin_autorizacion` | `miembros.js:866-893` |
| **App:** `PUT /api/cliente/me` sin la autorización guarda en NULL condiciones y alergias | `backend/src/routes/cliente.js:196`, `:463-472` |
| **App:** `GET /api/cliente/autorizaciones` (lo propio, con el texto de cada versión) | `cliente.js:474-514` |
| **App:** `PATCH /api/cliente/autorizaciones/datos-sensibles` `{ otorgada }`: revocar borra los datos; un menor no puede otorgarla (403) | `cliente.js:523-571` |

### Panel (`frontend/src/pages/MiembrosPage.jsx` y `frontend/src/components/AutorizacionesMiembro.jsx`)

| Qué | Dónde |
|---|---|
| Lo que se manda al backend: sin la autorización no viajan condiciones ni alergias; el representante solo si es menor | `MiembrosPage.jsx:248-260` |
| Validación del alta: representante obligatorio si es menor (sección «Datos personales») y su autorización (sección «Términos») | `MiembrosPage.jsx:387`, `:407-410` |
| Alta, datos personales: el bloque del representante aparece cuando la fecha da menos de 18 años (o el documento es TI) | `MiembrosPage.jsx:1220-1227` |
| Alta, «Salud y emergencia»: casilla separada y opcional con su texto; sin ella, condiciones y alergias quedan deshabilitadas y la pantalla explica que no se guardan | `MiembrosPage.jsx:1294-1326`, `AutorizacionesMiembro.jsx` (`CasillaDatosSensibles`) |
| Alta, «Términos»: cada autorización con su texto `v1` completo; la del representante si es menor | `MiembrosPage.jsx:1527-1562` |
| Edición: representante y su autorización si es menor | `MiembrosPage.jsx:2151-2167` |
| Edición, salud: casilla con el estado actual; al desmarcarla avisa que se revoca y se borran los datos; aviso para los datos viejos sin autorización; historial de autorizaciones | `MiembrosPage.jsx:2229-2268` |

Los textos del panel están en `frontend/src/lib/autorizaciones.js` y son los de la versión `v1` del backend. Si se cambian, hay que cambiarlos en los dos lados y subir la versión.

### App del miembro (Flutter)

| Qué | Dónde |
|---|---|
| Pantalla «Mis autorizaciones»: qué autorizó, cuándo, por qué canal y con qué texto; revocar la de datos de salud (o darla, si es adulto); historial | `fitloyalty_cliente/lib/cliente/screens/autorizaciones_screen.dart` |
| Servicio y modelos | `lib/cliente/services/legal_service.dart`, `lib/cliente/models/legal.dart` |
| `PATCH` en el cliente HTTP | `lib/cliente/services/api_client.dart` |
| Enlaces «Mis autorizaciones» y «Mi contrato» al final de «Editar perfil», y una nota en la sección de salud | `lib/cliente/screens/editar_perfil_screen.dart:195-203`, `:259-297` |

`perfil_screen.dart` y `more_tab.dart` no se tocaron (son de otro ejecutor). Para poner el enlace también en «Mi perfil» o en «Más», basta con agregar allí:

```dart
import 'autorizaciones_screen.dart';
// ...
ListTile(
  leading: const Icon(Icons.verified_user_outlined),
  title: const Text('Mis autorizaciones'),
  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AutorizacionesScreen())),
),
```

### Páginas legales

- `frontend/src/pages/PrivacidadPage.jsx`: datos de los miembros, con salud, representante y constancias (`:37-55`); datos sensibles facultativos (`:89-112`); menores de edad (`:114-136`); prueba de la autorización (`:138-152`); política de contacto de la Ley 2300 (`:213-227`). Se corrigieron dos citas: la autorización es el art. 9 de la Ley 1581 (decía art. 10, que es el de los casos sin autorización) y el plazo de 10 + 5 días hábiles es el art. 14 de la Ley 1581 (decía del Decreto 1377).
- `frontend/src/pages/PoliticaDatosPage.jsx`: datos sensibles (`:69-80`), niños, niñas y adolescentes (`:82-96`), prueba de la autorización (`:98-114`), plazos de consultas y reclamos (`:149-153`) y contacto según la Ley 2300 (`:191-205`).

La política de contacto (lunes a viernes de 7:00 a. m. a 7:00 p. m., sábados de 8:00 a. m. a 3:00 p. m., sin domingos ni festivos, solo por los canales autorizados y con baja en cualquier momento) solo se describe: las reglas las implementa otro ejecutor.

## Decisiones

- **Historial que no se modifica.** Una fila por cada vez que se otorga o se revoca; la vigente es la última. Así la revocación también queda probada, que es lo que pide el requisito.
- **La prueba guarda la versión, no el texto.** Los textos viven en el código, versionados (`v0`, `v1`), y la app muestra el de la versión que se aceptó. Guardar el texto en cada fila repetiría lo mismo miles de veces.
- **Datos sensibles sin autorización, en NULL.** Se aplica en el alta, en la edición del panel y en `PUT /api/cliente/me`, así que la regla no depende de la pantalla.
- **Miembros de antes de RQNF-17.** Sus booleanos pasan al historial como `v0`. Los datos de salud no se migran: nunca se pidió una autorización separada para ellos. Quedan como están (la migración no borra nada), el panel lo avisa al abrirlos y se borran al guardarlos sin marcar la autorización.
- **Menor de edad:** menos de 18 años por la fecha de nacimiento en hora de Colombia; sin fecha, la tarjeta de identidad también cuenta. Una fecha mal escrita o futura se rechaza (si no, un menor pasaría por adulto).
- **Representante:** sus datos vigentes van en `miembro`; la foto de sus datos al autorizar, en `detalle`. Si cambian, se pide otra vez su autorización.
- **App:** el miembro revoca la de datos de salud; también la puede otorgar si es adulto (con el texto completo en pantalla). La de un menor solo la da su representante, en el gimnasio. La de tratamiento de datos no se revoca en la app: equivale a pedir la supresión y la atiende el gimnasio por su canal de PQR.
- **Borrado:** `ON DELETE CASCADE` hacia miembro y gimnasio. El borrado permanente y el de la cuenta se llevan el historial; no hizo falta tocar `auth.js`.
- **Transacción en el alta:** miembro, plan y autorizaciones van juntos. Un documento repetido de un miembro desactivado (la restricción única de ConsultasDB) ahora responde 409 `MEMBER_DUPLICATED` en vez de 500.

## Cómo se probó

### Base simulada: `backend/tests/autorizaciones.test.js` (28)

Usa una base falsa con estado (`backend/tests/helpers/bd-falsa-legal.js`): las pruebas miran qué filas quedan, no solo qué SQL se mandó.

- Edad y menores, y fechas inválidas (`:112`, `:121`).
- Alta sin datos sensibles: NULL en salud, tres autorizaciones con versión `v1`, canal `PANEL`, usuario y fecha, todo entre `BEGIN` y `COMMIT` (`:131`). Con datos sensibles (`:160`).
- Menor sin representante: 400 `REPRESENTANTE_REQUERIDO` sin escribir nada ni abrir conexión (`:169`); sin la autorización del representante (`:179`); representante incompleto (`:187`); TI sin fecha (`:194`); fecha mal escrita o futura (`:200`); menor con representante y su autorización (`:209`); adulto con datos de representante, que no se guardan (`:228`).
- Edición: revocar borra y deja la constancia, y el historial muestra otorgada y revocada (`:244`); otorgar (`:263`); datos viejos sin autorización (`:273`); edición simple sin transacción (`:283`); cambio de representante (`:291`); fecha de menor sin representante (`:315`).
- Aislamiento: otro gimnasio no puede revocar ni ver (`:330`); el detalle trae vigentes, historial y el aviso, y cada consulta filtra por miembro y gimnasio (`:340`).
- App: solo lo propio (`:369`); el id de otro gimnasio, 404 (`:382`); token del personal, 403 (`:387`); revocar con canal `APP` y sin usuario (`:392`); revocar dos veces no duplica (`:406`); un menor no puede otorgarla (`:414`); cuerpo inválido (`:422`); `PUT /me` sin y con la autorización (`:427`, `:435`).

Control: si el alta guarda `condiciones_medicas` aunque no haya autorización, falla `:131`.

### Esquema real: `backend/tests/legal-real.test.js` (15: 8 de la guardia y 7 contra la base)

La misma guardia de host local que `registro-envio-real.test.js` (se mira el host como lo calcula pg y después de que `db.js` reescribe la URL; sin `TEST_DATABASE_URL` solo corre la guardia). WhatsApp y el correo están simulados. Crea sus gimnasios y al final borra lo que creó.

- Las columnas, la tabla y los CHECK de las migraciones 019 y 020 existen (`:226`).
- Alta sin datos sensibles, con las tres filas exactas (`:250`); menor sin y con representante (`:266`); revocación desde la edición y 404 desde otro gimnasio (`:292`); la app ve, revoca y abre su contrato (`:313`); borrado permanente con autorizaciones y entregas (`:373`).

```bash
docker run -d --name fl-legal-pg -e POSTGRES_PASSWORD=... -p 127.0.0.1:55439:5432 postgres:16
docker exec fl-legal-pg psql -U postgres -c "CREATE DATABASE fl_consultas" -c "CREATE DATABASE fl_migraciones"
docker exec -i fl-legal-pg psql -U postgres -d fl_consultas -v ON_ERROR_STOP=1 < ConsultasDB/Query_Inicial_Crear_Tablas.sql
cd backend
DATABASE_URL=postgres://postgres:...@127.0.0.1:55439/fl_consultas   DB_SSL=false node src/db/migrate.js
DATABASE_URL=postgres://postgres:...@127.0.0.1:55439/fl_migraciones DB_SSL=false node src/db/migrate.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55439/fl_consultas   npx jest tests/legal-real.test.js
TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:55439/fl_migraciones npx jest tests/legal-real.test.js
```

En las dos bases, dos corridas cada una: 15 de 15. `registro-envio-real.test.js` (RQF-09) también pasa en las dos con estos cambios (18 de 18).

### La migración en los dos esquemas

- `fl_consultas`: ConsultasDB y después `migrate.js` (así es producción: el servidor aplica las migraciones al arrancar). `fl_migraciones`: solo `migrate.js`. En las dos se aplicaron las 17 migraciones, de la 002 a la 020.
- Idempotencia: se corrieron `019` y `020` dos veces más en cada base con `psql -v ON_ERROR_STOP=1`. Solo salen avisos `already exists, skipping` y ningún error.
- Datos viejos: un miembro con `acepto_terminos` y `autorizo_datos` en TRUE recibe sus dos filas `v0` la primera vez; las corridas siguientes no las duplican (2 filas en cada base). Sus `condiciones_medicas` no se tocan.
- `pg_dump --schema-only -t autorizacion_miembro` es igual en las dos bases; solo cambian las líneas `\restrict`/`\unrestrict`, que pg_dump genera al azar. PostgreSQL 16.16.

### Resto

- Toda la suite de Jest: 339 pasan y 16 se saltan (las de base real sin `TEST_DATABASE_URL`), 355 en total.
- `esbuild` compila `MiembrosPage.jsx`, `AutorizacionesMiembro.jsx`, `lib/autorizaciones.js` y las tres páginas legales, y el empaquetado de `src/main.jsx` resuelve todos los imports.
- `flutter analyze`: sin problemas. El Flutter instalado trae Dart 3.12.2 y `pubspec.yaml` pide `^3.13.2`, así que se corrió en una copia con la restricción en `^3.12.0` (el `pubspec.yaml` del repo no se tocó).

## Límites y riesgos

- Los textos y las páginas legales no los ha revisado un abogado.
- Si el personal deja vacía la fecha de nacimiento de un menor que no tiene TI, el sistema no puede saber que es menor.
- Guardar la ficha de un miembro antiguo sin marcar la autorización borra sus datos de salud (el panel lo avisa antes). Es lo que pide la ley, pero cambia lo que el personal estaba acostumbrado a ver.
- La autorización de mensajes comerciales (`MENSAJES_COMERCIALES`) está prevista en la tabla, pero esta rama no la registra.
- No se probó en un navegador ni en un teléfono: el panel se comprobó compilando y la app con `flutter analyze`.

## Ajustes del verificador del #102 (rama `feat/rqnf-16-ley2300`, 2026-11-21)

El verificador del #102 dejó observaciones. Estas son las de RQNF-17 que se corrigieron junto con RQNF-16 (ver `docs/evidencias/rqnf-16-ley-2300.md`); las de RQNF-18 están en `rqnf-18-contrato-consumidor.md`.

| Obs. | Qué pasaba | Qué se hizo | Dónde | Prueba |
|---|---|---|---|---|
| 1 | `PUT {autorizo_datos_sensibles: true}` sin datos de salud armaba un `UPDATE miembro SET  WHERE` vacío y respondía 503 | Si no hay columnas que actualizar, se lee la fila con un `SELECT` | `backend/src/routes/miembros.js:526-546` | `ley2300-preferencias.test.js` («(1) …»), `ley2300-real.test.js` («(1) …») |
| 2 | Vaciar la fecha de nacimiento o cambiar la TI por otro documento iba por el camino simple: el menor dejaba de ser menor sin validación ni constancia | Cualquier cambio de fecha o de tipo de documento va por la transacción (`miembros.js:270-288`). Un menor solo deja de serlo con una fecha válida que muestre 18 años o más, y queda una fila `REPRESENTANTE_MENOR` con `otorgada = false` y `detalle.motivo = 'MAYOR_DE_EDAD'` (antes, después, edad y quién lo cambió). Sin fecha: 400 `MENOR_SIN_CONSTANCIA` | `miembros.js:425-446` | tres casos en `ley2300-preferencias.test.js` y uno en `ley2300-real.test.js` |
| 2 (efecto) | Con el cambio anterior, una edición que solo cambiaba la fecha borraba de rebote los datos de salud viejos sin autorización | Solo se borran si la edición habla de datos de salud (autorización, condiciones o alergias) | `miembros.js:484-497` | `autorizaciones.test.js` («vaciar la fecha de un adulto …») |
| 5 | El texto del representante no registraba que se escuchó al menor (Decreto 1377, art. 12; Decreto 1074, art. 2.2.2.25.2.9) | Texto nuevo en la versión **v2** de las autorizaciones: «Antes de autorizar escuché al menor y tuve en cuenta su opinión según su madurez, autonomía y capacidad para entender el asunto». Los demás textos de la v1 se copian iguales a la v2; las filas viejas conservan su versión. El panel usa los mismos textos (una prueba compara los dos archivos) | `backend/src/lib/autorizaciones.js:31-82`; `frontend/src/lib/autorizaciones.js` | `ley2300-preferencias.test.js` («(5) …», dos pruebas) |
| 7 | La app decía «Perfil actualizado» aunque el backend descartara las condiciones médicas y alergias por falta de autorización | `updatePerfil` devuelve también el mensaje del servidor y `datos_sensibles_descartados`; si hubo descarte, la app muestra el aviso del servidor en amarillo | `fitloyalty_cliente/lib/cliente/services/perfil_service.dart:37-69`, `providers/perfil_provider.dart`, `screens/editar_perfil_screen.dart:92-112` | `flutter analyze` sin problemas |

Además, con RQNF-16 el tipo `MENSAJES_COMERCIALES` ya se usa (deja de ser solo una reserva): el alta registra la decisión del miembro (por defecto «no»), la ficha tiene el interruptor, y la de un menor la da su representante (`detalle.otorgada_por`). El historial del panel y de la app muestra el canal `ENLACE` (baja con el enlace de los mensajes). Las páginas legales citan ahora el Decreto 1074 de 2015 junto al 1377 (art. 6 → 2.2.2.25.2.3, art. 7 → 2.2.2.25.2.4, art. 8 → 2.2.2.25.2.5, art. 12 → 2.2.2.25.2.9) y dicen que el texto del representante deja constancia de que escuchó al menor.

Pruebas que cambiaron por estos ajustes: `autorizaciones.test.js` (versión v2, cuatro filas en el alta y la prueba del efecto de la obs. 2), `legal-real.test.js` (v2, la fila de mensajes comerciales del alta y el contrato v3) y `miembros-update.test.js` (la fecha vacía ahora va por la transacción). Todas pasan sin base y contra `fl_consultas` y `fl_migraciones` (647 de 647 después de fusionar develop `ad90d73`).

Límite que sigue: si un miembro adulto (CC) nunca tuvo fecha y en realidad es menor, el sistema no lo puede saber; el ajuste solo impide que un menor ya registrado como tal deje de serlo sin constancia.
