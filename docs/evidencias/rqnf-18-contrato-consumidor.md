# RQNF-18: contrato y protección al consumidor

**Requisito (texto propuesto):** «El contrato que el sistema genera para cada miembro debe informar de forma clara y completa el precio total, la forma de pago, la vigencia, las condiciones de renovación, congelamiento y terminación, los datos del gimnasio y el canal de peticiones, quejas y reclamos, sin cláusulas abusivas, y debe entregarse al miembro (Ley 1480 de 2011, arts. 23, 37, 42 y 43).»
**Categoría:** Cumplimiento. **Fecha:** 2026-11-17. **Rama:** `feat/rqnf-17-18-legal` @ `e66e54f` (sobre `develop` @ `2794bc5`).
**Resultado:** el contrato (versión `v2`) sale de los datos reales de la base, ya no trae las cláusulas abusivas de la versión anterior y se entrega por WhatsApp y en la app, con constancia de cada entrega y del texto entregado (migración 020). Pruebas: 15 con la base simulada (`backend/tests/contrato-consumidor.test.js`), las 3 de `contrato.test.js` y las del esquema real (`backend/tests/legal-real.test.js`), que pasan en la base de ConsultasDB y en la de las migraciones.

> **Nota legal.** El texto del contrato, las cláusulas corregidas y su análisis frente a la Ley 1480 son una implementación técnica del equipo, no una asesoría jurídica. Conviene que los revise un abogado antes de usarlos con miembros reales. En particular, la regla de devolución cuando el miembro termina el contrato (cláusula 8) es la opción más protectora para el consumidor; el gimnasio puede querer otra, siempre que no deje sin devolución lo pagado por un servicio que no se presta (art. 43, núm. 5).

## Cláusulas de la versión anterior que podían ser abusivas

Versión `v1`, en `develop`: `backend/src/lib/mensajes.js:169-257` (texto) y `backend/src/routes/admin-contrato.js:62-72` (datos).

| # | Cláusula de la v1 (develop) | Problema (Ley 1480 de 2011) | Cómo queda en la v2 |
|---|---|---|---|
| 1 | Cl. 6 (`mensajes.js:204-209`): «*NO* hay devolución de dinero por periodos ya pagados ni por días no usados», y cl. 3 (`:190-193`): el pago «no es transferible ni reembolsable» | Art. 43, núm. 5: es ineficaz la cláusula que permite no reintegrar lo pagado si no se ejecuta el objeto contratado. Tampoco distinguía si el gimnasio cerraba o dejaba de prestar el servicio | Cl. 8: el miembro termina cuando quiera y recibe la parte de lo pagado por los días que falten, en 30 días. Cl. 9: si el gimnasio termina, cierra o no presta el servicio, devuelve esa parte o, a elección del miembro, extiende el plan |
| 2 | Cl. 8 (`:218-223`): «El gimnasio no se hace responsable por lesiones, accidentes o daños […]. Tampoco responde por objetos personales» | Art. 43, núm. 1 (limitar la responsabilidad que la ley le da al proveedor) y art. 42 (desequilibrio injustificado) | Cl. 10: el gimnasio responde por la seguridad de instalaciones y equipos y por las indicaciones de su personal; el miembro, por seguir las reglas. Por los objetos, responde según la ley por lo que quede bajo su custodia |
| 3 | Cl. 7 (`:211-216`): «Realizas las actividades bajo tu propia responsabilidad» | Art. 43, núm. 4: traslada al consumidor la responsabilidad del proveedor | Eliminada. La cl. 10 reparte obligaciones de cada parte |
| 4 | Cl. 4 (`:195-198`): uso indebido del QR «puede generar suspensión de la membresía sin devolución», y cl. 9 (`:225-228`): «El gimnasio puede suspender el acceso a quien incumpla» | Art. 43, núm. 7 (el proveedor decide solo si se cumplió el contrato) y núm. 5 (sin devolución) | Cl. 9: solo por incumplimiento grave, con aviso escrito previo y oportunidad de explicar (salvo riesgo inmediato), y con devolución de la parte no usada |
| 5 | Cl. 12 (`:248-250`): «La recepción, uso del código QR para ingresar, o responder […] "ACEPTO", constituye tu aceptación expresa» | Art. 43, núm. 9 (presumir la voluntad del consumidor) y art. 37, núm. 1 (informar antes, no después) | Cl. 15: la aceptación es la que quedó registrada en el alta (con su fecha y canal); si no hay constancia, el contrato lo dice. El mensaje es la copia que se entrega |
| 6 | Cl. 11 (`:242-246`): «Salvo que indiques lo contrario por escrito, autorizas al gimnasio a usar fotos y videos» | Art. 43, núm. 9 (voluntad presumida) y derecho a la propia imagen | Cl. 13: solo con autorización expresa y separada; negarse no afecta la membresía |
| 7 | Cl. 10 (`:230-240`): al aceptar el contrato se autorizaban «datos biomédicos» y «promociones y comunicaciones» | Ley 1581, art. 6 y Decreto 1377, art. 6 (datos sensibles: autorización separada y facultativa) y Ley 2300 de 2023 (publicidad solo autorizada) | Cl. 12: remite a las autorizaciones separadas de RQNF-17 y dice cuáles dio; publicidad solo si se autoriza y con baja en cualquier momento |
| 8 | Cl. 3: «Valor: {valor pagado}» (`admin-contrato.js:69` pasaba `valor_pagado ?? valor_total`) | Art. 23: información clara, veraz y suficiente. Con un pago parcial el contrato mostraba como precio lo abonado | Cl. 4: precio total, pagado, saldo pendiente, estado y forma de pago, de `plan_cobro` |
| 9 | Cl. 2 (`:186-188`): «Al vencer podrás renovar por periodos iguales», sin decir si es automático | Art. 43, núm. 14 (renovación automática que impide terminar) y art. 23 | Cl. 5: no se renueva automáticamente, nunca se cobra un periodo sin aceptación, aviso por WhatsApp los días que tenga configurados el gimnasio, y un cambio de precio se informa antes y se puede rechazar |
| 10 | Sin datos del gimnasio ni canal de PQR (solo el nombre) | Art. 23 y art. 37, núm. 2 (condiciones concretas, claras y completas) | Cl. 1 y 11: nombre, NIT, dirección, teléfono y correo del gimnasio; PQR en recepción, teléfono/WhatsApp y correo, respuesta en 15 días hábiles y la SIC |
| 11 | Sin reglas de congelamiento | Art. 23 | Cl. 6: cómo se pide, quién lo aplica, que no tiene costo y que el vencimiento se corre los días congelados (RQF-04) |

También se corrigió el aislamiento: el contrato se buscaba solo por id y se comparaba el gimnasio después (`admin-contrato.js:57` y `:92`); ahora la consulta filtra por miembro **y** gimnasio, y otro gimnasio recibe 404.

### Condiciones de `TerminosPage` (FitLoyalty con el gimnasio)

| Sección (develop) | Problema | Cambio (`frontend/src/pages/TerminosPage.jsx`) |
|---|---|---|
| 4.3: suspender cuentas por «uso abusivo», sin aviso (`:56-61`) | Facultad unilateral y vaga (art. 43, núm. 7) | Causa concreta, aviso previo con 5 días hábiles para corregir o explicar, y devolución proporcional si no es culpa del gimnasio (`:56-69`) |
| 8: responsabilidad máxima de 3 meses, sin excepciones (`:126-127`) | Art. 43, núm. 1, si el gimnasio actúa como consumidor; tampoco puede cubrir dolo o culpa grave | Se mantiene el tope, salvo dolo o culpa grave, la seguridad de los datos y los derechos del consumidor (`:160-169`) |
| 10: «El uso continuado […] implica aceptación tácita de los cambios» (`:142-147`) | Arts. 38 (modificación unilateral en contratos de adhesión) y 43, núm. 9 | Aviso por correo 30 días antes, no aplica al período pagado, cancelación sin penalidad y aceptación expresa para cambios con nuevos costos (`:183-194`) |
| 11: jurisdicción «con sede en Bogotá D.C.» (`:149-153`) | Art. 42: restringe el lugar donde el consumidor ejerce sus derechos | Autoridades competentes y, si es consumidor, la SIC (`:196-201`) |
| 6.3: la cancelación surte efecto al final del período | Faltaba decir que no tiene costo | «Sin costo ni penalidad» y el servicio sigue hasta el final del período (`:133-140`) |

Además se agregaron la sección 6, sobre el contrato que la Plataforma genera para los miembros (`:102-118`), y las obligaciones de datos sensibles y menores (`:91-99`). Las secciones siguientes se renumeraron.

## Qué cambió

| Qué | Dónde |
|---|---|
| Versión del contrato: `v2` | `backend/src/lib/mensajes.js:145` |
| Datos del contrato desde la fila: gimnasio, miembro, representante (solo si es menor), plan con precio total, pagado, saldo, forma y estado de pago, fechas, días, congelamiento y `renovacion_automatica: false`, aceptación y autorizaciones | `mensajes.js:216-271` |
| `faltantesContrato`: sin plan, precio total, forma de pago o fechas (o sin teléfono ni correo del gimnasio para PQR), el contrato no se entrega | `mensajes.js:278-291` |
| Las 15 cláusulas: partes, objeto, plan y vigencia, precio total y forma de pago, renovación, congelamiento, acceso y vencimiento, terminación por el miembro, terminación o suspensión por el gimnasio, salud y objetos, PQR, datos personales, imagen, cambios, entrega y aceptación | `mensajes.js:305-433` (renovación en `:353-361`, congelamiento `:364`, terminación `:375` y `:382`, PQR `:397`) |
| Texto para WhatsApp | `mensajes.js:436-449` |
| Lectura de miembro, gimnasio (nombre, NIT, dirección, teléfono, correo, días de aviso) y plan vigente, filtrando por miembro y gimnasio | `backend/src/lib/contrato.js:21-47` |
| Contrato armado y constancia de la entrega en la app (una fila por cada texto distinto, con `md5`) | `contrato.js:54-92` |
| Envío por WhatsApp: 404 si el miembro no es del gimnasio, 409 `CONTRACT_INCOMPLETE` si falta algo, al representante si es menor, y registro con canal, versión del texto generado y contenido | `backend/src/routes/admin-contrato.js:73-153` (destino en `:64-69`, registro en `:124-133`) |
| Vista previa con secciones y faltantes; historial filtrado por gimnasio | `admin-contrato.js:157-207` |
| `GET /api/cliente/contrato`: el contrato del miembro del token, 404 si falta algo, constancia de entrega en la app | `backend/src/routes/cliente.js:573-604` |
| Migración 020: `contrato_enviado.canal` (`WHATSAPP`/`APP`), `contenido`, `telefono_destino` opcional y CHECK que lo exige para WhatsApp | `backend/migrations/020_contrato_entrega.sql:24-45` |
| App: pantalla «Mi contrato», por secciones, con versión, fecha de entrega y copiar | `fitloyalty_cliente/lib/cliente/screens/contrato_screen.dart` |
| App: enlace desde «Editar perfil» | `fitloyalty_cliente/lib/cliente/screens/editar_perfil_screen.dart:269-274` |

`perfil_screen.dart` y `more_tab.dart` no se tocaron. Para enlazar «Mi contrato» desde ahí, basta un `ListTile` que haga `Navigator.push(context, MaterialPageRoute(builder: (_) => const ContratoScreen()))`, con `import 'contrato_screen.dart';`.

## Decisiones

- **Un solo texto para los dos canales.** `lib/contrato.js` lo arma y lo usan el envío por WhatsApp, la vista previa y la app.
- **No se entrega un contrato incompleto.** Si falta el plan, el precio, la forma de pago o las fechas, el panel recibe 409 con la lista y la app un mensaje. Antes salía «el valor acordado» o «la fecha acordada».
- **La versión la pone el servidor.** El panel sigue mandando `{ version: 'v1' }`, pero se registra `v2`, la del texto que de verdad se generó.
- **Constancia del texto entregado.** Cada envío por WhatsApp guarda el contenido; en la app se guarda una fila por cada texto distinto (si cambia el plan, cambia el texto), así abrir la pantalla muchas veces no llena la tabla.
- **Menor de edad:** el contrato es con su representante, así que el envío va al teléfono del representante y el texto lo nombra.
- **La aceptación no se presume.** El contrato dice cuándo y por qué canal aceptó (autorización `TERMINOS` de RQNF-17) o que no hay constancia. Si el texto cambió desde que aceptó, se aplica la condición más favorable para el miembro (cl. 14).
- **Renovación:** el sistema nunca renueva solo (los planes se renuevan en el panel); el contrato lo dice y usa los días de aviso del gimnasio (`gimnasio.dias_aviso_vencimiento`).

## Cómo se probó

### Base simulada: `backend/tests/contrato-consumidor.test.js` (15)

- El texto informa con datos reales el precio total, lo pagado, el saldo, la forma de pago, la vigencia con sus días, la renovación no automática con el aviso, el congelamiento, las dos terminaciones, los datos del gimnasio, los canales de PQR, los 15 días hábiles, la SIC, las autorizaciones y la versión (`:57`).
- No contiene ninguna de las frases abusivas de la v1 (`:83`).
- Faltantes (`:101`); el representante solo si es menor (`:108`); membresía congelada (`:116`); sin aceptación registrada no la presume (`:121`).
- WhatsApp: envía y guarda canal, versión y texto (`:167`); sin plan, 409 sin enviar (`:179`); otro gimnasio, 404 en envío, vista previa e historial (`:188`); menor, al teléfono del representante (`:199`); vista previa (`:214`).
- App: ve su contrato y la constancia queda una sola vez (`:226`); con el gimnasio de otro token, 404 y la consulta filtra por miembro y gimnasio (`:241`); sin plan, 404 sin constancia (`:251`); token del personal, 403 (`:258`).

`backend/tests/contrato.test.js` (3, RQF-13) sigue pasando; solo se le agregó la forma de pago al miembro de ejemplo, porque ahora el contrato la exige.

### Esquema real: `backend/tests/legal-real.test.js`

Con la guardia de host local de `registro-envio-real.test.js` y WhatsApp simulado:

- La migración 020 dejó `canal`, `contenido`, `telefono_destino` opcional y los dos CHECK (`:226`).
- La app abre su contrato con el precio, la forma de pago, la renovación y el correo del gimnasio, y queda una sola fila `APP` con `telefono_destino` NULL, versión `v2` y el texto (`:313`).
- El envío por WhatsApp guarda canal, teléfono, versión, contenido y quien lo envió; un `WHATSAPP` sin teléfono lo rechaza el CHECK (`23514`); un administrador de otro gimnasio recibe 404 sin que se envíe nada (`:347`).
- El borrado permanente de un miembro con entregas funciona (`:373`).

15 de 15 en `fl_consultas` (ConsultasDB y luego las migraciones) y en `fl_migraciones` (solo migraciones), dos corridas en cada una. El procedimiento está en `docs/evidencias/rqnf-17-datos-sensibles-menores.md`.

### La migración 020 en los dos esquemas

Se aplicó con `migrate.js` en las dos bases y después se corrió dos veces más con `psql -v ON_ERROR_STOP=1`: solo avisos `already exists, skipping`. `pg_dump --schema-only -t contrato_enviado` es igual en las dos bases (solo cambian las líneas `\restrict`, que pg_dump genera al azar).

## Límites y riesgos

- El texto no lo ha revisado un abogado (ver la nota del principio). La regla de devolución de la cláusula 8 compromete al gimnasio a devolver la parte no usada cuando el miembro termina el contrato.
- La constancia de la app prueba que el miembro abrió el contrato en la app, no que lo leyó. La de WhatsApp prueba que se intentó enviar (`exito` dice si el cliente de WhatsApp lo aceptó), no que llegó.
- Los gimnasios sin NIT, dirección o correo registrados salen sin esos datos; el contrato no se bloquea por eso, solo si no hay ni teléfono ni correo para PQR.
- El panel no tiene un botón de vista previa: el endpoint existe, pero la pantalla solo tiene «Enviar contrato».
- Las condiciones de `TerminosPage` cambiaron (suspensión, responsabilidad, modificaciones, jurisdicción): son compromisos de FitLoyalty con los gimnasios y conviene que Luis los confirme.

## Ajustes del verificador del #102 (rama `feat/rqnf-16-ley2300`, 2026-11-21)

Las observaciones de RQNF-18 que se corrigieron junto con RQNF-16 (ver `docs/evidencias/rqnf-16-ley-2300.md`). Por estos cambios el contrato pasa a la **versión v3** (`backend/src/lib/mensajes.js:148-153`): las entregas viejas conservan su texto y su versión en `contrato_enviado`.

| Obs. | Qué pasaba | Qué se hizo | Dónde | Prueba |
|---|---|---|---|---|
| 4 | Si el menor no tenía teléfono del representante, el contrato se enviaba al teléfono del menor | El contrato de un menor solo va al teléfono de su representante; si no lo tiene, 400 «… El contrato no se envia al telefono del menor» y no se envía nada | `backend/src/routes/admin-contrato.js:59-77`, `:100-106` | `ley2300-preferencias.test.js` («(4) …»: 400 y WhatsApp sin llamar) |
| 8 | La cláusula 12 decía que solo llegarían mensajes publicitarios autorizados, pero el sistema no lo aplicaba | Con RQNF-16 es verdad, y la cláusula (ahora «Datos personales y mensajes») dice si el miembro aceptó mensajes comerciales y por qué canales, el horario y la frecuencia de todos los mensajes (también los avisos) y cómo cancelarlos (app, enlace al final de cada mensaje comercial o recepción) | `mensajes.js:421-434`; los datos salen de la autorización vigente (`mensajes.js:276-284`) | `ley2300-preferencias.test.js` («(8) …»: «no» y «sí, por WhatsApp y correo») |
| 9 | Sin plan no había cláusula 4, así que la numeración se corría y las referencias a las cláusulas 6, 8 y 11 apuntaban mal | Sin plan, la cláusula 4 («Precio total y forma de pago») sigue existiendo con un texto que lo explica; siempre hay 15 cláusulas | `mensajes.js:363-369` | `ley2300-preferencias.test.js` («(9) …»: 15 cláusulas, la 6 es Congelamiento, la 8 Terminación y la 11 PQR) |
| 10 | La cláusula 10 no incluía las demás obligaciones legales del gimnasio | Agrega «y por las demás obligaciones que le impone la ley» | `mensajes.js:408-414` | `ley2300-preferencias.test.js` («(10) … cláusula 10») |
| 10 | Para un menor, la cláusula 15 decía «Aceptaste» | Dice «Tu representante legal, <nombre>, aceptó las condiciones del gimnasio en tu nombre el …» (y, sin constancia, que el representante debe confirmarlas en recepción) | `mensajes.js:447-462` | `ley2300-preferencias.test.js` («(10) … cláusula 15», con el caso del adulto) |

Pruebas que cambiaron: `legal-real.test.js` compara la versión de las entregas con `CONTRATO_VERSION` (v3) en vez de `'v2'`. Todas pasan sin base y contra `fl_consultas` y `fl_migraciones` (602 de 602).
