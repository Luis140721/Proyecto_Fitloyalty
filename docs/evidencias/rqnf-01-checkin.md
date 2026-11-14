# RQNF-01: tiempo de respuesta del check-in

**Requisito:** el sistema debe procesar y confirmar cada check-in en un máximo de 2 segundos.
**Fecha de la medición:** 2026-10-23 · **Código:** `develop` @ `2698c2e`.
**Resultado:** cumple. El peor caso medido con 200 miembros fue de 15 ms (p95 de 13 ms); con 2000 miembros, 60 ms (p95 de 59 ms).

## Cómo se midió

El script [`backend/scripts/medir-checkin.js`](../../backend/scripts/medir-checkin.js) crea su propio gimnasio de prueba, con miembros que tienen plan vigente y 30 ingresos de historial cada uno, levanta el router real de `POST /api/admin/checkin` y lo llama por HTTP con un token de administrador. Al terminar borra todo lo que creó. Solo corre contra una base local.

```bash
cd backend
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=fitloyalty_test DB_USER=postgres DB_PASSWORD=... DB_SSL=false \
  node scripts/medir-checkin.js 200 60     # miembros, repeticiones por camino
```

Se miden tres caminos, cada uno con 60 miembros distintos (el antirrebote de 90 s se desactiva para que ninguna llamada devuelva «duplicado» sin recorrer el camino completo):

| Camino | Qué hace el backend |
|---|---|
| `documento` | Check-in manual: busca al miembro por documento. |
| `qr-directo` | El QR guardado coincide con el leído: una consulta. |
| `qr-cifrado` | El QR guardado está cifrado, así que no coincide directo y el backend **descifra el QR de cada miembro del gimnasio** hasta encontrarlo. Es el peor camino; se midieron los miembros del final de la lista. |

En todos los caminos se cuenta el tiempo completo de la petición HTTP (autenticación, comprobación de prueba gratuita, búsqueda, consulta del plan, inserción del ingreso y cálculo de racha e hitos).

**Entorno:** PostgreSQL 18.3 y Node 24.15.0 en el mismo equipo de desarrollo (Windows 11), por `127.0.0.1`. Sin latencia de red ni cola de otras peticiones, así que sirve para comparar y para ver el margen, no como tiempo de producción (Render + Neon agregan la latencia de red a la base).

## Resultados (ms)

### 200 miembros (el volumen realista de un gimnasio)

| Camino | n | Errores | Promedio | p50 | p95 | Máximo |
|---|---:|---:|---:|---:|---:|---:|
| documento | 60 | 0 | 8,5 | 7,9 | 12,8 | 14,8 |
| qr-directo | 60 | 0 | 8,0 | 7,8 | 10,3 | 11,4 |
| qr-cifrado | 60 | 0 | 11,1 | 11,1 | 13,3 | 13,9 |

### 2000 miembros (diez veces más)

| Camino | n | Errores | Promedio | p50 | p95 | Máximo |
|---|---:|---:|---:|---:|---:|---:|
| documento | 60 | 0 | 20,9 | 20,1 | 25,1 | 26,8 |
| qr-directo | 60 | 0 | 18,9 | 18,7 | 21,9 | 23,3 |
| qr-cifrado | 60 | 0 | 49,1 | 48,2 | 59,2 | 59,8 |

## Lectura

- **Cumple con holgura:** el peor tiempo con 200 miembros es 15 ms, unas 130 veces menos que el límite de 2000 ms. Aunque Render y Neon sumen cientos de milisegundos de red, el check-in queda lejos de los 2 segundos.
- **Qué lo arregló:** el camino `qr-cifrado` solo es rápido porque la clave de cifrado se deriva una vez al cargar el módulo (`checkin.js:26`, PR #11). Antes se derivaba (`scryptSync`, deliberadamente lenta) por cada miembro, y con cientos de miembros tardaba segundos.
- **Cómo escala:** `qr-cifrado` crece con el número de miembros porque descifra uno por uno (49 ms con 2000). Con 200 la diferencia con los otros caminos es de unos 3 ms. No hace falta cambiarlo para el volumen de un gimnasio; si algún día se necesitan decenas de miles de miembros, la salida es guardar el QR en claro (o un hash) indexado para buscarlo directo.

## Límites de esta medición

- Una sola ejecución secuencial: no mide varias recepciones escaneando a la vez.
- No incluye el tiempo del dispositivo HID ni el del navegador (el requisito dice «desde la lectura del dispositivo HID»): mide hasta que el backend responde.
- Base local, no la de producción.
