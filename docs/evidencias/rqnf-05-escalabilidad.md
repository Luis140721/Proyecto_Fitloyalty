# RQNF-05: varios gimnasios sin perder rendimiento

**Requisito:** «La arquitectura SaaS debe soportar el registro de múltiples gimnasios (multitenancy) sin degradación del rendimiento, permitiendo incorporar nuevos establecimientos sin modificaciones en el código base.»
**Fecha de la medición:** 2026-11-25 · **Código:** `develop` @ `e4da07a`, más la migración 021 de esta rama.
**Resultado:** cumple con los índices de producción. Al pasar de 1 a 50 gimnasios en la misma base, los tiempos de un gimnasio casi no cambian. Con una base creada solo con las migraciones de antes, sí se degradaban; la migración 021 lo corrige.

## Qué pide y qué se mide

| Parte del requisito | Cómo se comprueba |
|---|---|
| Registrar varios gimnasios | Cada gimnasio de la medición se crea con `POST /api/auth/signup`, el mismo registro que usa un cliente nuevo. No se toca el código ni la configuración. |
| Cada gimnasio ve solo lo suyo | 9 pruebas de aislamiento (`backend/tests/aislamiento.test.js`, PR #11) y las de los jobs por gimnasio (`backend/tests/jobs-por-gimnasio.test.js`, PR #132). |
| Sin degradación del rendimiento | Este documento: los tiempos de **un** gimnasio cuando en la base hay 1, 10 y 50. |

## Cómo se midió

El script [`backend/scripts/medir-multigimnasio.js`](../../backend/scripts/medir-multigimnasio.js) levanta la aplicación completa (`src/index.js`) y la llama por HTTP con el token del dueño de cada gimnasio.

- **Datos:** cada gimnasio tiene 200 miembros con plan vigente y 30 ingresos cada uno. Con 50 gimnasios son 10.000 miembros y 300.000 ingresos.
- **Escalones:** con 1, 10 y 50 gimnasios mide 20 veces, siempre sobre el primer gimnasio:
  - el check-in por documento (`POST /api/admin/checkin`);
  - la lista de miembros (`GET /api/admin/miembros`, 100 por página);
  - el dashboard (`GET /api/admin/dashboard`);
  - la campana de avisos (`GET /api/admin/notificaciones`).
- **Carga simultánea:** el dashboard de todos los gimnasios a la vez, 5 rondas.
- **Registro:** el tiempo de cada `POST /api/auth/signup`.
- **Seguridad:** solo corre contra una base local cuyo nombre termine en `_medicion`. Mira el destino real de la conexión, no solo la URL. Al terminar borra lo que creó.

```bash
cd backend
DATABASE_URL=postgres://usuario:clave@127.0.0.1:5432/fitloyalty_medicion node scripts/medir-multigimnasio.js 1,10,50 20
```

**Entorno:** PostgreSQL 16.15 en Docker y Node 24.14.1, en el mismo equipo de desarrollo (Windows 11), por `127.0.0.1`. No hay red de por medio: sirve para comparar escalones, no como tiempo de producción.

## Resultados (p95 en ms, 20 repeticiones)

### Base creada solo con las migraciones de antes de la 021

Es la base de Docker, la de pruebas o una instalación nueva. No tenía los índices de `checkin` ni de `miembro(id_gimnasio)` que sí tiene producción.

| Gimnasios en la base | Check-in | Lista de miembros | Dashboard | Campana | Dashboard de todos a la vez |
|---:|---:|---:|---:|---:|---:|
| 1 | 20,3 | 58,4 | 92,2 | 9,4 | 91,3 |
| 10 | 30,7 | 389,0 | 388,3 | 13,4 | 637,0 |
| 50 | 80,6 | 1635,7 | 1591,6 | 13,4 | 12307,8 |

### Con los índices de producción (migración 021)

| Gimnasios en la base | Check-in | Lista de miembros | Dashboard | Campana | Dashboard de todos a la vez |
|---:|---:|---:|---:|---:|---:|
| 1 | 26,6 | 16,5 | 39,2 | 8,6 | 42,6 |
| 10 | 21,9 | 13,8 | 38,4 | 8,1 | 92,3 |
| 50 | 28,2 | 16,0 | 44,0 | 12,9 | 723,3 |

Registro de un gimnasio nuevo: 82 ms de p95 con 10 gimnasios y 88 ms con 50. El primero de la corrida tardó 199 ms, porque incluye el arranque. Es casi todo el `bcrypt` de la contraseña.

0 errores en todas las corridas. Las tablas completas (promedio, p50, p95 y máximo) están en la salida del script.

## Lectura

- **Con los índices, no hay degradación.** Con 50 veces más datos en la base, el check-in, la lista y el dashboard de un gimnasio tardan lo mismo. Las consultas filtran por `id_gimnasio` o por el miembro y los índices llevan directo a sus filas.
- **Sin ellos, sí la había.** La lista de miembros y el dashboard buscaban el último ingreso de cada miembro recorriendo todos los ingresos de la base: pasaron de 58 ms a 1,6 s. Con los 50 dashboards a la vez, 12 s.
- **Producción ya los tenía.** Su base se creó con `ConsultasDB/Query_Inicial_Crear_Tablas.sql`, que los trae. La migración 021 usa los mismos nombres y columnas con `IF NOT EXISTS`: en producción no hace nada, y en las demás bases los crea. La prueba `backend/tests/integracion/migraciones.test.js` comprueba que, después de las migraciones, están todos los índices de ese archivo.
- **Lo que no sube con los gimnasios:** el registro de un gimnasio tarda lo mismo con 1 que con 50.
- **Los 50 dashboards a la vez** tardan más (723 ms de p95) que uno solo (44 ms). No es por los datos: el servidor atiende la base con 10 conexiones (el valor por defecto del pool de `pg`) y las 50 peticiones hacen fila. Con 10 a la vez fueron 92 ms. Es carga simultánea, no tamaño de la base, y sigue por debajo de 1 s.

## Límites de esta medición

- Base local, no la de producción: Render y Neon suman la latencia de red, la misma con 1 que con 50 gimnasios.
- Se midió el panel. La app del miembro y las campañas no entraron en la medición.
- Volumen de prueba: 50 gimnasios de 200 miembros. No se probaron miles de gimnasios.
