# Evidencia D6: prueba de humo de la release 1

**Responsable:** Daniel  
**Fecha de revisión:** 2026-10-26 (hora de Colombia)  
**PR evaluado:** [#45 — Release 1: `develop` → `main`](https://github.com/Luis140721/Proyecto_Fitloyalty/pull/45)  
**Commit evaluado:** `7e3ede9741cb551db1a3c7082553d91351fea606`

## Alcance ejecutado

Se revisaron el estado del PR y los checks asociados al commit, y se hicieron
solicitudes HTTP GET públicas a los endpoints de salud de la API y a la portada
del frontend. No se inició sesión, no se escribieron datos y no se ejecutaron
operaciones en producción.

| Comprobación | Resultado observado |
|---|---|
| Check `rama` del PR | Correcto |
| Check `backend` del PR | Correcto |
| Check `frontend` del PR | Correcto |
| `GET https://fitloyalty-api.onrender.com/api/health` | HTTP 200; estado `ok`; PostgreSQL conectado |
| `GET https://fitloyalty-api.onrender.com/api/healthz` | HTTP 200; estado `ok` |
| `GET https://fitloyalty-zeta.vercel.app/` | HTTP 200; frontend responde |

Las respuestas públicas solo confirman que los servicios consultados
respondieron. No prueban que la release del PR #45 esté desplegada ni cubren
flujos autenticados.

## Bloqueos y pruebas pendientes

Al momento de la revisión, el PR #45 seguía abierto y GitHub lo reportaba como
`mergeable_state: blocked`. No había aprobaciones registradas. El cuerpo del PR
mantenía sin confirmar estos prerrequisitos:

- Ejecutar la migración 012 en la misma copia de Neon usada para la prueba de
  la migración 014.
- Confirmar que `FRONTEND_URL` en Render contiene únicamente el dominio de
  producción.
- Confirmar que Render despliega automáticamente desde `main`.

Aunque los checks `rama`, `backend` y `frontend` aparecían correctos, el
checkbox de CI del cuerpo del PR seguía sin marcar.

Después de que se complete la revisión, se cumplan los prerrequisitos y la
release se fusione y despliegue, falta ejecutar con una cuenta de prueba
autorizada el login, dashboard, alta de miembro, check-in manual y por QR,
congelar/descongelar membresía y configuración. También falta que Santiago
confirme en los logs de Render las migraciones 009–014 y que no hubo errores.

## Veredicto

**Parcial; D6 no aprobado.** Las comprobaciones públicas y los checks
disponibles pasaron, pero el PR está bloqueado y no se ejecutaron los recorridos
funcionales post-despliegue. No se aprobó ni se fusionó el PR.
