# SCHEMA_MAP — FitLoyalty PostgreSQL

> Generado por inspección directa de `information_schema` (sin asumir nada desde el código).
> Esta pasada es **solo lectura**: no se modificó ningún archivo del proyecto.

---

## 1. Fuente de los datos

| Item | Valor |
|---|---|
| Archivo `.env` revisado | `backend/.env` |
| `DATABASE_URL` en `.env` | **NO definida** |
| `DB_HOST` / `DB_NAME` en `.env` | `localhost` / `FitLoyalty` |
| `DB_SSL` | `false` |
| BD efectivamente consultada | PostgreSQL local en `localhost:5432`, base `FitLoyalty` |
| ¿Se pudo conectar a Neon/Render? | **NO** — no existe `DATABASE_URL` en `backend/.env` ni en variables de entorno del proceso. El código de `src/db/db.js` (`buildConnectionConfig`) prioriza `DATABASE_URL`; al no estar definida, cae al modo legacy con `DB_HOST=localhost`. No hay forma operativa de alcanzar Neon desde este entorno. |

> **Aviso crítico**: el error `relation rol does not exist` que reportaste proviene de **Render**. Si Neon/Render NO tiene la tabla `rol`, este mapa (basado en la BD local) NO representa fielmente ese entorno. Recomendación: pasarme la `DATABASE_URL` de Neon o ejecutarme este mismo script apuntando a Neon para tener un mapa exacto del entorno que rompe. Mientras tanto, el mapa local sirve como "ground truth del seed" y para detectar desviaciones obvias entre local y prod.

---

## 2. Tablas existentes en `public`

Leído de `information_schema.tables WHERE table_schema='public'` (29 objetos, ordenado alfabético):

| # | table_name | table_type |
|---|---|---|
| 1 | alerta_abandono | BASE TABLE |
| 2 | auditoria | BASE TABLE |
| 3 | campana | BASE TABLE |
| 4 | campana_destinatario | BASE TABLE |
| 5 | canal_comunicacion | BASE TABLE |
| 6 | checkin | BASE TABLE |
| 7 | configuracion_gimnasio | BASE TABLE |
| 8 | congelacion_membresia | BASE TABLE |
| 9 | envio_mensaje | BASE TABLE |
| 10 | etiqueta_comportamiento | BASE TABLE |
| 11 | gimnasio | BASE TABLE |
| 12 | hito_gamificacion | BASE TABLE |
| 13 | hito_miembro | BASE TABLE |
| 14 | invitacion_staff | BASE TABLE |
| 15 | membresia | BASE TABLE |
| 16 | miembro | BASE TABLE |
| 17 | miembro_etiqueta | BASE TABLE |
| 18 | notificacion | BASE TABLE |
| 19 | pago | BASE TABLE |
| 20 | password_reset | BASE TABLE |
| 21 | plan_membresia | BASE TABLE |
| 22 | plantilla_mensaje | BASE TABLE |
| 23 | reto | BASE TABLE |
| 24 | reto_miembro | BASE TABLE |
| 25 | **rol** | BASE TABLE |
| 26 | schema_migrations | BASE TABLE |
| 27 | sesion | BASE TABLE |
| 28 | usuario | BASE TABLE |
| 29 | vista_miembros_activos | VIEW |

**Migraciones aplicadas** (`schema_migrations`):
- `001_invitacion_staff.sql` — 2026-08-11T02:30:36.862Z

> Solo hay 1 migración registrada. El grueso del esquema (incluida la tabla `rol`) fue creado por fuera del runner de migraciones (probablemente por un script SQL inicial ejecutado a mano o por `seed_pg.js` + DDL implícito del backend).

---

## 3. Tablas objetivo solicitadas — detalle de columnas

Tipos: `integer` (serial PK), `character varying` (varchar), `text`, `timestamp without time zone`, `date`, `time without time zone`, `numeric`, `boolean`.

### `usuario` — 11 columnas

| columna | tipo | nullable | default | usada por staff.js |
|---|---|---|---|---|
| id_usuario | integer (PK serial) | NOT NULL | sequence | sí |
| id_gimnasio | integer | NOT NULL | — | sí (FK → gimnasio) |
| nombre | varchar(100) | NOT NULL | — | sí |
| email | varchar(150) | NOT NULL UNIQUE | — | sí |
| password_hash | text | NOT NULL | — | sí |
| activo | boolean | NOT NULL | `true` | sí |
| ultimo_acceso | timestamp | NULL | — | sí |
| debe_cambiar_clave | boolean | NOT NULL | `false` | sí |
| foto_url | text | NULL | — | sí |
| fecha_creacion | timestamp | NOT NULL | `CURRENT_TIMESTAMP` | sí |
| **id_rol** | integer | **NOT NULL** | — | sí (FK → rol.id_rol) |

- FKs reales: `id_rol → rol.id_rol` (`fk_usuario_rol`) y `id_gimnasio → gimnasio.id_gimnasio` (`usuario_id_gimnasio_fkey`).
- ❗ **`rol` (varchar legacy) NO existe** como columna: `rol_existe=false`. El esquema fue migrado a FK contra `rol`.

### `rol` — 5 columnas, **2 filas**

| columna | tipo | nullable | default |
|---|---|---|---|
| id_rol | integer (PK serial) | NOT NULL | sequence |
| nombre | varchar | NOT NULL | — |
| descripcion | text | NULL | — |
| activo | boolean | NOT NULL | — |
| fecha_creacion | timestamp | NOT NULL | — |

Contenido actual:
```
id_rol=1  nombre="ADMINISTRADOR"   activo=true
id_rol=2  nombre="RECEPCIONISTA"  activo=true
```

### `invitacion_staff` — 11 columnas, **8 filas**

| columna | tipo | nullable | usada por staff.js |
|---|---|---|---|
| id_invitacion | integer (PK) | NOT NULL | sí |
| id_gimnasio | integer | NOT NULL | sí (FK → gimnasio) |
| email | varchar(150) | NOT NULL | sí |
| nombre | varchar(120) | NOT NULL | sí |
| rol_asignado | varchar(30) | NOT NULL | sí (CHECK in RECEPCIONISTA/ADMINISTRADOR) |
| token_hash | text | NOT NULL | sí |
| fecha_creacion | timestamp | NOT NULL | sí |
| fecha_expiracion | timestamp | NOT NULL | sí |
| fecha_aceptacion | timestamp | NULL | sí |
| fecha_revocado | timestamp | NULL | sí |
| id_usuario_creador | integer | NOT NULL | sí (FK → usuario) |

### `password_reset` — 6 columnas, **19 filas**

| columna | tipo | nullable | usada por auth.js |
|---|---|---|---|
| id_reset | integer (PK) | NOT NULL | sí |
| id_usuario | integer | NOT NULL | sí (FK → usuario) |
| code | varchar | NOT NULL | sí |
| expires_at | timestamp | NOT NULL | sí |
| used | boolean | NOT NULL | sí |
| created_at | timestamp | NOT NULL | — |

### `sesion` — 9 columnas, **15 filas**

| columna | tipo | nullable |
|---|---|---|
| id_sesion | integer (PK) | NOT NULL |
| id_usuario | integer | NOT NULL (FK → usuario) |
| token | text | NOT NULL |
| ip | varchar(45) | NULL |
| dispositivo | varchar(255) | NULL |
| fecha_inicio | timestamp | NOT NULL |
| fecha_ultima_actividad | timestamp | NOT NULL |
| fecha_cierre | timestamp | NULL |
| estado | varchar(20) | NOT NULL (CHECK ACTIVA/CERRADA/EXPIRADA) |

### `gimnasio` — 10 columnas

| columna | tipo | nullable |
|---|---|---|
| id_gimnasio | integer (PK) | NOT NULL |
| nombre | varchar(100) | NOT NULL |
| nit | varchar(20) | NULL UNIQUE |
| direccion | varchar(200) | NULL |
| telefono | varchar(20) | NOT NULL |
| email | varchar(150) | NULL |
| logo_url | text | NULL |
| activo | boolean | NOT NULL (default true) |
| fecha_registro | timestamp | NOT NULL |
| trial_ends_at | timestamp | NULL |
| plan_activo | varchar(20) | NOT NULL (default 'TRIAL') |

### `miembro` — 10 columnas

| columna | tipo | nullable |
|---|---|---|
| id_miembro | integer (PK) | NOT NULL |
| id_gimnasio | integer | NOT NULL |
| nombre | varchar(100) | NOT NULL |
| documento | varchar(20) | NOT NULL |
| telefono | varchar(20) | NULL |
| email | varchar(150) | NULL |
| codigo_qr | varchar(100) | NOT NULL |
| foto_url | text | NULL |
| activo | boolean | NOT NULL (default true) |
| fecha_registro | timestamp | NOT NULL |

### `checkin` — 8 columnas

| columna | tipo | nullable |
|---|---|---|
| id_checkin | integer (PK) | NOT NULL |
| id_miembro | integer | NOT NULL |
| id_gimnasio | integer | NOT NULL |
| fecha_hora | timestamp | NOT NULL |
| metodo | varchar(20) | NOT NULL (CHECK QR/CODIGOBARRAS/MANUAL) |
| id_usuario | integer | NULL |
| observacion | text | NULL |
| valido | boolean | NOT NULL (default true) |

### `membresia` — 10 columnas

| columna | tipo | nullable |
|---|---|---|
| id_membresia | integer (PK) | NOT NULL |
| id_miembro | integer | NOT NULL |
| id_plan | integer | NOT NULL |
| fecha_inicio | date | NOT NULL |
| fecha_fin | date | NOT NULL |
| estado | varchar(20) | NOT NULL (CHECK ACTIVA/VENCIDA/CONGELADA) |
| fecha_pago | date | NULL |
| estado_pago | varchar(20) | NOT NULL (CHECK PENDIENTE/PAGADO/ANULADO) |
| observaciones | text | NULL |
| fecha_creacion | timestamp | NOT NULL |

### `plan_membresia` — 8 columnas

| columna | tipo | nullable |
|---|---|---|
| id_plan | integer (PK) | NOT NULL |
| id_gimnasio | integer | NOT NULL |
| nombre | varchar(100) | NOT NULL |
| descripcion | text | NULL |
| duracion_dias | integer | NOT NULL |
| precio | numeric(10,2) | NOT NULL |
| activo | boolean | NOT NULL (default true) |
| fecha_creacion | timestamp | NOT NULL |

### `configuracion_gimnasio` — 11 columnas

| columna | tipo | nullable |
|---|---|---|
| id_configuracion | integer (PK) | NOT NULL |
| id_gimnasio | integer | NOT NULL UNIQUE |
| umbral_alerta_amarilla | integer | NOT NULL |
| umbral_alerta_roja | integer | NOT NULL |
| dias_aviso_vencimiento | integer | NOT NULL |
| horario_apertura | time | NULL |
| horario_cierre | time | NULL |
| canal_principal | varchar(20) | NOT NULL (CHECK EMAIL/WHATSAPP) |
| tiempo_inactividad_sesion_min | integer | NOT NULL |
| actualizado_por | integer | NULL |
| fecha_actualizacion | timestamp | NOT NULL |

---

## 4. Veredicto sobre el código de `staff.js`

Columnas/tablas que el código referencia en el endpoint roto (`GET /api/admin/staff`) y rutas relacionadas:

| Referencia del código | ¿Existe en el esquema real? | Notas |
|---|---|---|
| `usuario.id_usuario` | ✅ | OK |
| `usuario.nombre` | ✅ | OK |
| `usuario.email` | ✅ | OK |
| `usuario.id_rol` | ✅ | FK válida hacia `rol.id_rol` |
| `usuario.activo` | ✅ | OK |
| `usuario.fecha_creacion` | ✅ | OK |
| `usuario.ultimo_acceso` | ✅ | OK |
| `usuario.rol` (varchar legacy) | ❌ | Columna legacy ya migrada. Si algún código la usa, falla. Hoy `staff.js` ya NO la referencia. |
| Subselect `(SELECT nombre FROM rol WHERE rol.id_rol = usuario.id_rol)` | ✅ la tabla `rol` existe | **Funciona en este esquema.** Si Render da "relation rol does not exist", es que Render NO tiene esa tabla (desfase de esquema entre entornos, NO bug del código del endpoint). |
| `(SELECT id_rol FROM rol WHERE nombre = $5)` (accept-invite, `staff.js:311`) | ✅ | Misma dependencia: requiere `rol` creada y poblada con ADMINISTRADOR/RECEPCIONISTA. |
| `(SELECT id_rol FROM rol WHERE nombre='ADMINISTRADOR' LIMIT 1)` (`auth.js:137`, signup) | ✅ | Idem. |
| `invitacion_staff.*` | ✅ todas las columnas existen | OK |
| `password_reset` | ✅ existe (PK `id_reset`, no `id_password_reset`) | OK |
| `sesion` | ✅ existe | OK |
| `gimnasio` | ✅ existe | OK |
| `miembro`, `checkin`, `membresia`, `plan_membresia`, `configuracion_gimnasio` | ✅ todas existen | OK |

### Conclusión directa al bug de Render

**El código de `staff.js` (línea 207) NO es ortografía ni columna mal nombrada: es sintácticamente correcto contra el esquema real.** La query:

```sql
SELECT id_usuario, nombre, email, id_rol, activo, fecha_creacion, ultimo_acceso,
       (SELECT nombre FROM rol WHERE rol.id_rol = usuario.id_rol) AS rol
FROM usuario
WHERE id_gimnasio = $1
ORDER BY fecha_creacion DESC
```

contra este esquema (con `rol` presente) devuelve filas sin error.

**El 503 de Render con `relation rol does not exist` significa que la BD de Render/Neon está DESINCRONIZADA con respecto a local**: le falta la tabla `rol` y/o la columna `usuario.id_rol` y/o la FK. Tres formas de resolverlo, en orden de preferencia:

1. **Sincronizar Render con el esquema real (recomendado, fix definitivo).**  
   Crear `rol` en Render y poblar con los 2 roles base; agregar `id_rol` a `usuario` con FK y backfill (1 = ADMINISTRADOR, 2 = RECEPCIONISTA, según `usuario.rol` legacy si existe, o por lista de emails admins).  
   SQL mínimo a aplicar en Render:
   ```sql
   CREATE TABLE IF NOT EXISTS rol (
     id_rol SERIAL PRIMARY KEY,
     nombre VARCHAR(30) NOT NULL UNIQUE,
     descripcion TEXT,
     activo BOOLEAN NOT NULL DEFAULT TRUE,
     fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   INSERT INTO rol (id_rol, nombre, activo) VALUES
     (1, 'ADMINISTRADOR', TRUE),
     (2, 'RECEPCIONISTA', TRUE)
   ON CONFLICT (id_rol) DO NOTHING;
   SELECT setval(pg_get_serial_sequence('rol','id_rol'), (SELECT MAX(id_rol) FROM rol));
   ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_rol INTEGER;
   -- backfill: si existe columna legacy usuario.rol, mapear por nombre; si no, default RECEPCIONISTA
   UPDATE usuario SET id_rol = 2 WHERE id_rol IS NULL AND rol = 'RECEPCIONISTA';
   UPDATE usuario SET id_rol = 1 WHERE id_rol IS NULL AND rol = 'ADMINISTRADOR';
   UPDATE usuario SET id_rol = 2 WHERE id_rol IS NULL;
   ALTER TABLE usuario ALTER COLUMN id_rol SET NOT NULL;
   ALTER TABLE usuario ADD CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol);
   ```
   Y luego respaldar esta migración como `backend/migrations/002_rol_y_usuario_id_rol.sql` para que el runner la replique.

2. **Parche defensivo en `staff.js` (workaround temporal, NO recomendado a largo plazo).**  
   Cambiar el subselect a `LEFT JOIN rol ON rol.id_rol = usuario.id_rol` y devolver `rol.nombre` directamente, de modo que aunque la tabla `rol` no exista, el error sea claro (no un 503 silencioso). NO arregla el desfase, solo lo enmascara.

3. **Quitar el subselect y devolver solo `id_rol`** (plan C, no recomendado): corta funcionalidad (la UI pierde el nombre legible del rol). Solo si confirmas que la UI no usa el campo `rol` y solo necesita `id_rol`.

---

## 5. Equivalencias nombre → nombre real

| Lo que tu código asume | Lo que existe | OK |
|---|---|---|
| `rol` (tabla) | `rol` (tabla con `id_rol, nombre`) | ✅ |
| `rol.id_rol` | `id_rol` (integer PK) | ✅ |
| `usuario.id_rol` | `id_rol` (integer NOT NULL, FK) | ✅ |
| `usuario.fecha_creacion` | `fecha_creacion` | ✅ |
| `usuario.ultimo_acceso` | `ultimo_acceso` | ✅ |
| `password_reset` (tabla) | `password_reset` con PK `id_reset` | ✅ |
| `sesion` (tabla) | `sesion` con PK `id_sesion` | ✅ |
| `invitacion_staff` (tabla) | `invitacion_staff` con PK `id_invitacion` | ✅ |
| `gimnasio.fecha_registro` | `fecha_registro` | ✅ |
| `miembro.fecha_registro` | `fecha_registro` | ✅ |
| `rol_asignado` (en invitacion) | `rol_asignado varchar(30)` | ✅ |

No hay renombres necesarios; **el problema es de presencia de la tabla `rol` en Render, no de ortografía**.

---

## 6. Pendientes / Riesgos

1. **DATABASE_URL no presente en `backend/.env`.** El backend, desplegado en Render, recibe `DATABASE_URL` por variables de entorno del servicio (no del repo). Si quieres que pueda leer Neon directamente, pégamela en una corrida (o dame el patrón `host/port/db/user/pass`) y repito la inspección apuntando a Neon.
2. **El runner de migraciones (`backend/src/db/migrate.js`) solo registra `001_invitacion_staff.sql`.** El resto del esquema (incluida la tabla `rol`) está fuera del control de versiones del runner. Riesgo: volver a perder la tabla `rol` en futuros redespliegues o en un rebuild de la BD de Render.
3. **Una sola migración aplicada.** El historial de cambios de esquema no está versionado. Cualquier rollback o promoción de entorno es opaca.
4. **No se hicieron commits ni se modificaron archivos del repo** (esta pasada fue solo lectura).

---

## 7. Cómo reproduje la inspección

```bash
cd backend
node - <<'NODE_EOF'
const { Client } = require('pg');
require('dotenv').config();
const cfg = {
  host: process.env.DB_HOST, port: +process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
};
const c = new Client(cfg);
c.connect().then(async () => {
  console.log((await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`)).rows);
  console.log((await c.query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('usuario','miembro','checkin','membresia','plan_membresia','gimnasio','rol','invitacion_staff','password_reset','sesion','configuracion_gimnasio') ORDER BY table_name, ordinal_position`)).rows);
  process.exit(0);
});
NODE_EOF
```

Errores durante la ejecución: **ninguno**. Conexión OK, queries OK, sin warnings de `pg`.
