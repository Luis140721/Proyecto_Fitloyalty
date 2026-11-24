# Colección Postman — FitLoyalty API

`FitLoyalty.postman_collection.json` tiene los 29 casos de la
[matriz](../matriz-casos-prueba.md) (CP-01 a CP-29), con tests en cada
petición (código de respuesta, código de error, campos clave y tiempo).

## Antes de correrla

La colección **crea datos** (gimnasios, miembros, ingresos): córrela solo
contra el ambiente de pruebas, nunca contra producción ni tu base de desarrollo.
Desde la raíz del repo:

```bash
pnpm --dir e2e run db:up                          # BD de pruebas en 127.0.0.1:5433, en memoria
node docs/pruebas/postman/iniciar-api-pruebas.cjs # API en 127.0.0.1:3001; déjala abierta
```

[`iniciar-api-pruebas.cjs`](iniciar-api-pruebas.cjs) fija la BD de pruebas y
apaga el correo, WhatsApp y el scheduler antes de cargar el backend, así que tu
`backend/.env` no los cambia. Espera a que `http://127.0.0.1:3001/api/healthz`
responda antes de correr la colección.

## En Postman

1. *Import* → elige `FitLoyalty.postman_collection.json`.
2. La variable de colección `baseUrl` ya apunta a `http://127.0.0.1:3001/api`.
3. Clic derecho en la colección → *Run collection* → *Run*. Corre en orden: los
   casos usan los datos de los anteriores (token, id del miembro).

## En la terminal (Newman)

En otra terminal, desde la raíz del repo:

```bash
npx newman@6.2.1 run docs/pruebas/postman/FitLoyalty.postman_collection.json
```

El bloque completo, que arranca la API en segundo plano, espera a que conteste y
la apaga al final, está en el [plan, sección 8](../plan-de-pruebas.md#8-cómo-repetir-las-pruebas)
(Bash y PowerShell).

- Cada corrida usa datos con un sufijo único (`Date.now()`), así que se puede
  repetir sin limpiar la base.
- **Como máximo dos corridas por minuto:** el login del administrador admite 5
  intentos por minuto y cada corrida hace 2 (CP-05 y CP-06). Si una tercera
  recibe 429, espera un minuto o reinicia la API.
- Al terminar: `pnpm --dir e2e run db:down`.

## Resultados

| Fecha | Base | Casos | Aserciones | Salida |
|---|---|---|---|---|
| 2026-11-22 | `develop` @ `f3a1a71` | 28 de 29: falla CP-12, el defecto D-10 (#117) | 60 de 62 | [newman-develop-2026-11-22.txt](../evidencias/newman-develop-2026-11-22.txt) |
| 2026-11-23 | `develop` @ `9fb3f7b`, con el #83 | **29 de 29** | **62 de 62** | [newman-develop-2026-11-23.txt](../evidencias/newman-develop-2026-11-23.txt) |
