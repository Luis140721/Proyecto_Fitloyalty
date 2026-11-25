# Arquitectura de FitLoyalty y guion de la demo (T6, ítem 5)

| Dato | Valor |
|---|---|
| Ítem de la lista T6 | 5: «Diagrama de arquitectura actualizado; demo end-to-end del sistema completo» |
| Código revisado | `develop` @ `483654e` (2026-11-25) |
| Documentos relacionados | [Documentación de la API](../api/API.md) · [Mapa de la base de datos](SCHEMA_MAP.md) · [ADR 0001: QR dinámico](../decisiones/0001-qr-dinamico-del-miembro.md) · [Pruebas](../pruebas/README.md) |

## 1. Diagrama de arquitectura

```mermaid
flowchart LR
    subgraph Usuarios
        ADM["Administrador<br/>y recepción"]
        MIE["Miembro del gimnasio"]
    end

    subgraph Clientes
        WEB["Panel web<br/>React 18 + Vite 5<br/>Vercel: fitloyalty-zeta.vercel.app"]
        APP["App del miembro<br/>Flutter (Android)"]
    end

    subgraph API["API REST: Node 24 + Express 4 (Render: fitloyalty-api.onrender.com)"]
        direction TB
        MW["Middlewares<br/>CORS · express-rate-limit · JSON<br/>authenticate (JWT) · authorize (roles)<br/>requireActiveTrial · zod"]
        RUT["Rutas<br/>auth · miembros · checkin · staff<br/>dashboard · config · retos · campanas<br/>notificaciones · cliente · preferencias · jobs"]
        LIB["Lógica (src/lib)<br/>qr-dinamico · segmentos · retos<br/>campanas · contacto-legal (Ley 2300)<br/>gamificacion · contrato · trial"]
        JOB["Tareas programadas (node-cron, America/Bogota)<br/>vencimientos 09:00 y 14:00 · abandono 08:00<br/>campañas cada 10 min"]
        MW --> RUT --> LIB
        JOB --> LIB
    end

    subgraph Datos
        PG[("PostgreSQL<br/>Neon en producción<br/>PostgreSQL 16 en Docker")]
    end

    subgraph Externos["Servicios externos"]
        BRE["Brevo<br/>correo transaccional (HTTPS)"]
        WA["WhatsApp<br/>whatsapp-web.js + Chromium"]
        UP["UptimeRobot<br/>y workflow availability-monitor"]
    end

    ADM --> WEB
    MIE --> APP
    WEB -- "HTTPS /api · Bearer JWT" --> MW
    APP -- "HTTPS /api/cliente · Bearer JWT" --> MW
    LIB -- "pg (pool)" --> PG
    LIB --> BRE
    LIB --> WA
    UP -- "GET /api/health cada 5 min" --> RUT
    BRE -. "correos: invitaciones, contrato,<br/>recuperación, avisos" .-> ADM
    WA -. "avisos y campañas" .-> MIE
```

### Ambientes

```mermaid
flowchart TB
    subgraph Produccion["Producción"]
        V["Vercel<br/>build de frontend/"] --> R["Render<br/>backend/ (node src/index.js)"] --> N[("Neon<br/>proyecto fitloyalty, rama production")]
    end
    subgraph Local["Desarrollo (docker compose)"]
        NG["nginx :5173<br/>sirve el build y proxea /api"] --> BE["backend :3001"] --> DB[("db :5432")]
    end
    subgraph Pruebas["Pruebas (separado del desarrollo)"]
        T["Jest · Vitest · Playwright · Newman"] --> DBT[("db-test 127.0.0.1:5433<br/>datos en memoria")]
    end
    subgraph CI["GitHub Actions en cada PR"]
        J["backend · frontend · integracion · e2e<br/>rama · evidencia-individual"]
    end
```

## 2. Componentes

| Componente | Tecnología | Responsabilidad | Dónde está |
|---|---|---|---|
| Panel web | React 18, Vite 5, React Router 6, Axios | Lo usan el administrador y la recepción: miembros, check-in, equipo, retos, campañas, configuración y dashboard | `frontend/` |
| App del miembro | Flutter | Inicio de sesión con teléfono, QR dinámico, membresía, asistencia, logros, retos, mensajes, autorizaciones y contrato | `fitloyalty_cliente/` |
| API REST | Node 24, Express 4, `pg`, `zod`, `jsonwebtoken`, `bcryptjs` | Única puerta a los datos. Valida la entrada, autentica con JWT y aplica los roles y el periodo de prueba | `backend/src/` |
| Tareas programadas | `node-cron` | Avisos de vencimiento (09:00 y 14:00), alertas de abandono (08:00) y envío de campañas programadas (cada 10 min) | `backend/src/jobs/` |
| Base de datos | PostgreSQL (Neon en producción) | Gimnasios, usuarios, miembros, membresías, check-ins, retos, campañas, autorizaciones y auditoría. Las migraciones se registran en `schema_migrations` | `backend/migrations/`, `ConsultasDB/` |
| Correo | Brevo (API HTTPS) | Invitaciones al equipo, recuperación de contraseña, contrato y avisos | `backend/src/lib/email.js` |
| WhatsApp | `whatsapp-web.js` con Chromium | Avisos al miembro y campañas por WhatsApp | `backend/src/lib/whatsapp.js` |
| Monitoreo | UptimeRobot y `.github/workflows/availability-monitor.yml` | Revisa `GET /api/health` cada 5 minutos (RQNF-02) | [Evidencia](../evidencias/rqnf-02-disponibilidad.md) |

### Capas del backend

```
Petición → CORS → rate limit (login, recuperación, baja) → express.json
        → authenticate (JWT) → authorize(roles) → requireActiveTrial
        → ruta (routes/) → validación zod → lógica (lib/) → pool pg → PostgreSQL
        → errorHandler: { error, code } con 400 / 401 / 403 / 404 / 409 / 429 / 500
```

- **Multi-gimnasio:** cada consulta filtra por el `gymId` que viene en el JWT (`backend/tests/aislamiento.test.js`, RQNF-05). Un recurso de otro gimnasio responde 404, como si no existiera (por ejemplo, `backend/tests/acceso-bloqueado.test.js`).
- **Dos tipos de token:** el del personal (`role: admin` o `receptionist`) y el del miembro (`role: cliente`, con `idMiembro`). El del miembro solo entra a `/api/cliente/*`; con el del personal esas rutas responden 403 `CLIENT_ONLY` (`requireClient`).
- **Errores uniformes:** todas las respuestas de error tienen la forma `{ error, code }` (`backend/src/middleware/errorHandler.js`).

## 3. Flujos principales

### Check-in con QR dinámico (RQF-05, RQF-15)

```mermaid
sequenceDiagram
    participant M as App del miembro
    participant R as Panel (recepción)
    participant A as API
    participant D as PostgreSQL
    M->>A: GET /api/cliente/qr (JWT del miembro)
    A-->>M: secreto, paso de 30 s y hora del servidor
    Note over M: Sin internet, calcula FLD<id>T<código> cada 30 s
    R->>A: POST /api/admin/checkin { codigo, metodo: "QR" }
    A->>A: Valida el código TOTP (paso actual, 2 atrás, 1 adelante)
    alt Código vencido
        A-->>R: 400 QR_DINAMICO_VENCIDO
    end
    A->>D: ¿Plan vigente y no congelado?
    alt Plan vigente
        A->>D: INSERT checkin, avance de retos y logros
        A-->>R: 201 ingreso registrado
    else Vencido, sin plan o congelado
        A->>D: Aviso de acceso bloqueado para el administrador
        A-->>R: 200 sin ingreso, miembro.estado = VENCIDO o CONGELADO
    end
```

### Campaña con las reglas de la Ley 2300 (RQF-10, RQNF-16)

```mermaid
sequenceDiagram
    participant P as Panel (admin)
    participant A as API
    participant D as PostgreSQL
    participant W as WhatsApp o Brevo
    P->>A: POST /api/admin/campanas { segmento, canal, mensaje }
    P->>A: POST /api/admin/campanas/:id/ejecutar
    A->>D: Miembros del segmento
    loop Cada destinatario
        A->>A: ¿Aceptó mensajes comerciales y ese canal? ¿Horario y frecuencia permitidos?
        alt Se puede contactar
            A->>W: Mensaje con el enlace de baja
            A->>D: estado_envio = ENVIADO
        else No aceptó, no autorizó el canal o ya se le escribió (frecuencia)
            A->>D: estado_envio = OMITIDO y su motivo
        else Fuera del horario permitido
            A->>D: sigue PENDIENTE (sale en la siguiente franja)
        end
    end
```

## 4. Guion de la demo de principio a fin

**Duración:** unos 10 minutos. **Quién la hace:** una persona en el computador (panel) y otra con el celular (app).

**Antes de empezar:**
- Hacerla en un gimnasio de demostración, nunca con miembros reales. En local se crea con `seed_dev.js` (ver [Usuarios de prueba](../../README.md#usuarios-de-prueba)).
- Despertar el backend de Render 5 minutos antes: abrir `https://fitloyalty-api.onrender.com/api/health` y esperar `{"status":"ok"}`.
- Tener la app instalada en el celular y conectada a internet la primera vez, para que cargue el QR.
- El paso 12 solo envía dentro del horario que permite la Ley 2300: de lunes a viernes de 7:00 a. m. a 7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m., nunca domingos ni festivos (`backend/src/lib/contacto-legal.js`). Fuera de ese horario los destinatarios quedan PENDIENTE y salen en la siguiente franja.
- Para el paso 12, la sesión de WhatsApp del servidor debe estar vinculada. Si no lo está, hacer la campaña por correo (Brevo).
- Crear antes al menos dos miembros: uno que acepte mensajes comerciales por WhatsApp y otro que no, para que en el paso 12 se vean los dos resultados.
- **Plan B:** si falla internet o Render, correr todo en local con `docker compose up` ([Arranque rápido](../../README.md#arranque-rápido-con-docker-recomendado)).

| # | Paso (quién) | Qué se muestra | Resultado esperado | Requisito |
|---|---|---|---|---|
| 1 | Abrir el panel e iniciar sesión como administrador (panel) | Login con JWT | Entra al dashboard. Con una contraseña equivocada sale «Credenciales incorrectas»; después de 5 intentos en un minuto, «Demasiados intentos» (429) | Autenticación |
| 2 | Dashboard (panel) | Métricas, horas pico y exportar a CSV | Las cifras del gimnasio de demo; descarga del CSV | Dashboard |
| 3 | Miembros → Nuevo miembro (panel) | Formulario con plan, pago y autorizaciones (términos, datos, mensajes comerciales y canales) | Se crea el miembro con su QR. Sin aceptar términos, el formulario no deja guardar | Miembros, Ley 1581 y Ley 2300 |
| 4 | Equipo → Invitar recepcionista (panel) | Invitación por correo con Brevo | La invitación queda pendiente y llega el correo | Equipo |
| 5 | Iniciar sesión en la app con el teléfono del miembro (celular) | Inicio, membresía y QR | Se ve el plan vigente y el QR, que cambia cada 30 s | App del miembro |
| 6 | Poner el celular en modo avión y abrir el QR (celular) | QR dinámico sin internet | El código sigue cambiando sin red | QR dinámico (ADR 0001) |
| 7 | Check-in → escanear el QR (panel) | Registro del ingreso | «Ingreso registrado» y el ingreso en la lista de últimos check-ins | Check-in (módulo crítico) |
| 8 | Repetir el check-in con una foto del QR tomada hace más de un minuto (panel) | Seguridad del QR | Lo rechaza con «QR vencido» (400 `QR_DINAMICO_VENCIDO`) | Check-in |
| 9 | Congelar la membresía del miembro e intentar otro check-in (panel) | Bloqueo de acceso | No registra el ingreso, muestra la membresía congelada y aparece el aviso de acceso bloqueado en notificaciones | Congelar y acceso bloqueado |
| 10 | Descongelar. En la app: asistencia y logros (celular) | Gamificación | Aparece el ingreso del paso 7 y el avance de la racha | Gamificación |
| 11 | Retos → Crear reto «3 asistencias» e inscribir (panel). En la app: Retos → ver el progreso (celular) | Retos | El reto aparece en la app con su progreso | Retos (RQF-12) |
| 12 | Campañas → Nueva campaña al segmento «Nuevos» por WhatsApp → Ejecutar (panel) | Campañas y Ley 2300 | Los que aceptaron WhatsApp quedan ENVIADO; los demás, OMITIDO con su motivo | Campañas (RQF-10) |
| 13 | Abrir el enlace de baja del mensaje (celular) | Darse de baja | El miembro deja de recibir mensajes comerciales; en la app, Preferencias lo muestra | Ley 2300, art. 5 |
| 14 | Configuración → días de aviso, umbrales de abandono y «Exigir QR dinámico» (panel) | Configuración del gimnasio | Se guardan los cambios | Configuración |
| 15 | Cerrar con el CI de un PR y la página de UptimeRobot (navegador) | Calidad y disponibilidad | Los jobs en verde y el registro sin caídas | Pruebas y RQNF-02 |

**Qué decir al cerrar (20 segundos):** el mismo backend atiende al panel y a la app, todo pasa por una sola API con JWT y roles, cada gimnasio solo ve sus datos, y el sistema se prueba en cada PR con pruebas unitarias, de integración, de componentes, end-to-end y la colección de Postman.

## 5. Cómo actualizar este documento

Los diagramas están en Mermaid, que GitHub muestra directamente. Si cambia un componente (una ruta nueva, otro servicio externo u otra tarea programada), se actualiza el diagrama de la sección 1, la tabla de la sección 2 y la [documentación de la API](../api/API.md) en el mismo PR.
