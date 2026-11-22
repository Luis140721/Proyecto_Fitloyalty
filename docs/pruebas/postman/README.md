# Colección Postman — FitLoyalty API

`FitLoyalty.postman_collection.json` tiene los 29 casos de la
[matriz](../matriz-casos-prueba.md) (CP-01 a CP-29), con tests en cada
petición (código de respuesta, código de error, campos clave y tiempo).

## Antes de correrla

La colección **crea datos** (gimnasios, miembros, ingresos): córrela solo
contra el ambiente de pruebas, nunca contra producción ni tu base de desarrollo.

```bash
pnpm --dir e2e run db:up          # BD de pruebas en 127.0.0.1:5433, en memoria
cd backend
DATABASE_URL=postgres://fitloyalty_test:fitloyalty_test@127.0.0.1:5433/fitloyalty_test DB_SSL=false \
JWT_SECRET=jwt-solo-para-pruebas NODE_ENV=test DISABLE_SCHEDULER=true ENABLE_WHATSAPP=false \
  node src/index.js
```

## En Postman

1. *Import* → elige `FitLoyalty.postman_collection.json`.
2. La variable de colección `baseUrl` ya apunta a `http://127.0.0.1:3001/api`.
3. Clic derecho en la colección → *Run collection* → *Run*. Corre en orden: los
   casos usan los datos de los anteriores (token, id del miembro).

## En la terminal (Newman)

```bash
npx newman@6.2.1 run docs/pruebas/postman/FitLoyalty.postman_collection.json
```

Cada corrida usa datos con un sufijo único (`Date.now()`), así que se puede
repetir sin limpiar la base. Al terminar: `pnpm --dir e2e run db:down`.

Resultado del 2026-11-22: 28 de 29 casos (60 de 62 aserciones); falla CP-12,
el defecto D-10 ([defectos.md](../defectos.md)).
