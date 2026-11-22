# Sesiones de usabilidad RQNF-04 (check-in manual)

Entorno aislado en tu equipo: Postgres en Docker (`127.0.0.1:5434`), backend
y frontend locales, con datos sintéticos. No toca producción ni tu base de
desarrollo. El protocolo completo está en la rama `docs/rqnf-04-usabilidad`
(`docs/evidencias/rqnf-04-usabilidad.md`).

Usa el código de tu copia del repo: antes de las sesiones, `git pull` en
`develop` para evaluar la pantalla de Check-in que se va a entregar.

## Requisitos

- Windows con Docker Desktop instalado (el script lo abre si está cerrado).
- Dependencias instaladas: `pnpm install` dentro de `backend/` y de `frontend/`.
- Puertos 3001 y 5173 libres: cierra el backend y el frontend de desarrollo.

## Antes de empezar (una vez)

1. Doble clic en **`iniciar.cmd`** (en esta carpeta). Se abren dos ventanas, «FitLoyalty API» y
   «FitLoyalty Web». No las cierres. Al final se abre el navegador.
2. Entra con la cuenta de prueba:
   - Correo: `admin.rqnf04@example.test`
   - Contraseña: `SesionRqnf04`
3. Ve a la pantalla **Check-in** y déjala en su estado inicial.

## Cada sesión (P1, P2, P3)

1. Pide el consentimiento verbal: se evalúa la pantalla, no a la persona, y
   puede parar cuando quiera. No anotes nombres ni contactos, solo P1, P2, P3.
2. Lee exactamente esta tarea, sin explicar pasos:

   > Una persona va a ingresar al gimnasio. Registra su ingreso usando el
   > documento de prueba **79123456**. Avísame cuando hayas terminado.

3. Arranca el cronómetro al terminar de leer. No ayudes ni señales nada. Si
   pide ayuda, responde solo: «Haz lo que te parezca más natural», y anótalo.
4. Detén el cronómetro cuando aparezca la confirmación del ingreso.
5. Anota en la tabla de abajo. Cuenta una interacción por cada acción:
   escribir el documento es 1, pulsar «Registrar» o Enter es otra. Anota
   aparte los clics de más, los intentos repetidos y los cambios de modo.
6. Mira en «Actividad reciente» que el método diga **Manual** (no QR).
7. Doble clic en **`limpiar-entre-sesiones.cmd`** y recarga la página (F5).

Si quieres capturas, toma solo la pantalla de la aplicación (sin la persona).

**A observar:** el campo «O por documento» muestra como texto de ejemplo
`79123456`, el mismo documento de la tarea. Si alguien pulsa «Registrar» sin
escribirlo porque cree que ya está escrito, anótalo en Observaciones.

El gimnasio de prueba tiene 14 días de periodo de prueba desde que se crea.
Si vence, borra la base (ver `detener.ps1`) y vuelve a correr `iniciar.cmd`.

## Al terminar

Doble clic en **`detener.cmd`**. Los datos de prueba se conservan por si
necesitas repetir una sesión.

## Resultados

| Código | Sin formación técnica | Completó | Interacciones | Tiempo (s) | Pidió ayuda | Método registrado | Observaciones |
|---|---|---|---:|---:|---|---|---|
| P1 | | | | | | | |
| P2 | | | | | | | |
| P3 | | | | | | | |

Fecha de las sesiones: ____________

Con esta tabla se completa `docs/evidencias/rqnf-04-usabilidad.md`. Si alguien supera dos
interacciones o no termina, se anota tal cual: no se corrige ni se descarta.
