# Estado: avance real de requisitos

- **Fecha:** 2026-10-16
- **Rama:** `docs/avance-requisitos` (PR hacia `main`)
- **Código verificado:** `main` @ `54b19fa` (merge del PR #3). Después entró a `main` el PR #5 (`8acab31`: `CONTRIBUTING.md` y check de nombre de rama en el CI, sin cambios en el código de la app); se fusionó en esta rama y la evidencia del CI (RQNF-09) se tomó de esa versión. Ese commit es también la **copia de seguridad** del docx y del Excel de historias: para recuperar la versión anterior basta con `git show 54b19fa:"Documentación/Proyecto FitLoyalty.docx" > copia.docx`.
- **Responsable de esta tarea:** agente ejecutor (Claude de Luis). Solo documentación y Excel; las implementaciones las hace Santiago en sus propias ramas.

## Resultado

| Alcance | RF | RNF | Global |
|---|---:|---:|---:|
| Actualizado (RQF-01..16, RQNF-01..09) | 62,5 % (10/16) | 61,1 % (5,5/9) | **62,0 % (15,5/25)** |
| Original del docx (RQF-01..12, RQNF-01..08) | 50,0 % (6/12) | 56,3 % (4,5/8) | 52,5 % (10,5/20) |

Fórmula: (implementados + 0,5 × parciales) / total. **No se llega al 80 %**: faltan 4,5 puntos sobre el alcance actualizado. La cifra oficial es la del alcance actualizado; la original queda como referencia.

## Qué se hizo

1. **Verificación de los 20 requisitos del docx contra el código** (rutas, lib, jobs, migraciones, pruebas, frontend, app Flutter y CI). Cada fila apunta a archivo:línea, endpoint o medición.
2. **`Documentación/Proyecto FitLoyalty.docx`**: se agregaron RQF-13..16 y RQNF-09 a las tablas 5 y 6, con el mismo formato. Son requisitos que ya existen en el código y no estaban documentados. Solo cambia `word/document.xml`; el resto del archivo queda idéntico byte a byte.
   - RQF-13 Contrato de membresía por WhatsApp · RQF-14 Avisos automáticos de vencimiento · RQF-15 Registro con prueba gratuita de 14 días · RQF-16 App móvil del miembro · RQNF-09 Integración continua.
3. **`Documentación/Plantilla historias de usuario.xlsx`**: HU-54..58 para los RF nuevos (5 criterios cada una). Se corrigieron HU-11 y HU-40, que citaban RQF-08 por error, y se volvió a crear la lista desplegable de prioridad, que openpyxl no conserva; ahora cubre las 58 HU. Las 16 RF tienen al menos una HU.
4. **`docs/avance-requisitos.xlsx`**: hojas Resumen (porcentajes por fórmula, escala y meta editables, gráfico y ruta al 80 %), Matriz RF, Matriz RNF y Evidencias (EV-01..34). Se recalculó y guardó con Excel: 0 errores de fórmula.
5. **`docs/matriz-requisitos.md`**: la misma matriz en markdown para revisarla en el PR. Es una foto del 2026-10-16; si cambia algún estado, la fuente es el Excel.
6. **`docs/evidencias/cobertura-backend-2026-10-16.txt`**: medición de cobertura usada para RQNF-07.

## Criterios acordados con Luis (2026-10-16)

1. Implementado solo si todas las partes del requisito tienen evidencia; Parcial (0,5) si funciona lo principal pero falta alguna parte; No implementado si lo principal no tiene evidencia.
2. RNF sin medición = «Sin evidencia», vale 0.
3. Se agregan los 5 requisitos nuevos obligatorios. Los opcionales (recuperación de contraseña, envío del QR al registrar, límite de intentos) **no** se agregaron, para no inflar el alcance.
4. Solo filas nuevas en las tablas 5 y 6; la sección 4 (módulos) y los casos de uso no se tocaron.
5. Cifra oficial: alcance actualizado. Se reportan las dos.
6. No se recorta alcance por ahora: Luis decide con la ruta de abajo.
7. El docx se editó solo en este worktree. **Luis: cierra Word antes de hacer pull de esta rama.**
8. La rama se llamó `docs/avance-requisitos`; la sesión anterior que ocupaba el nombre ya lo había liberado, así que no se borró ningún worktree.
9. Al Excel de HU se le agregan HU, se corrigen referencias y se repone la validación.
10. La medición de cobertura se guarda como evidencia en `docs/evidencias/`.
11. No se instaló `gh`: el PR se abre desde el enlace de comparación.
12. Los hallazgos fuera de alcance solo se anotan aquí (ver abajo).

## Correcciones al borrador del PR #4 (`docs/borrador-matriz-requisitos.md`)

| Req. | Borrador | Verificado | Motivo |
|---|---|---|---|
| RQF-06 | Implementado | Parcial | Bloquea, pero no avisa al administrador del intento bloqueado (`checkin.js:116-136`). |
| RQF-07 | Implementado | Parcial | No hay gráfica de horas pico (la gráfica es por día de la semana, `dashboard.js:189`) y el panel no se actualiza solo. |
| RQF-11 | Parcial | No implementado | Ningún archivo calcula rachas; la app solo lee hitos cargados por SQL. |
| RQF-12 | Parcial | No implementado | No hay creación de retos, el check-in no actualiza el progreso y no hay notificación; la app solo lee retos sembrados. |
| RQNF-04 | Sin evidencia | Parcial | El flujo manual de 2 interacciones sí está en el código (`CheckinPage.jsx:333, :341-347`); falta la prueba con usuarios. |
| RQF-02 | Parcial | Parcial (+ hallazgo) | Además, el JWT del personal no expira (`auth-helpers.js:102-113`). |

El resto de filas coincide con el borrador.

## Pendiente

- **Llegar al 80 %:** Luis decide entre implementar y recortar alcance. La ruta más barata (8 acciones, de RQNF-01 a RQF-04) está en la hoja Resumen y en `docs/matriz-requisitos.md`. Con ella se llega justo al 80 % (20/25).
- **Revisión visual del docx en Word:** no se pudo renderizar porque Word estaba abierto. La estructura se verificó con python-docx (17 filas en la tabla RF, 10 en la RNF), pero conviene abrirlo y mirar las tablas 5 y 6.
- **RQNF-08:** no se construyó la imagen Docker (Docker Desktop apagado). Basta con `docker compose build` para dejar evidencia.
- **Otros Excel de `Documentación/`** (Product Backlog, Matriz de priorización, Cálculo de horas) llegan hasta HU-53 y no incluyen las nuevas HU-54..58. Quedaron fuera de esta tarea.

## Qué necesito de Santiago

1. **Implementaciones de la ruta** (en ramas `feat/...`): RQF-02 (cierre por inactividad y expiración real del JWT), RQF-07 (horas pico y refresco), RQF-06 (registrar el acceso bloqueado y avisar en la campana), RQF-01 (editar/desactivar personal) y RQF-04 (congelar membresía). Después, si se puede: RQF-08, RQNF-07, RQF-11, RQF-12 y RQF-10.
2. **Avisar cada vez que se fusione una**, para cambiar el Estado en `docs/avance-requisitos.xlsx` (solo la columna Estado; lo demás se recalcula) y actualizar la evidencia.
3. **Medición de RQNF-01** (tiempo del check-in) si tiene el entorno desplegado a mano.

## Hallazgos fuera de alcance (no se tocaron)

- **Seguridad:** el JWT del personal no tiene expiración, porque `generarToken` ignora `JWT_EXPIRES_IN` (`backend/src/lib/auth-helpers.js:102-113`).
- **Seguridad:** `Evidencias_Sustentacion/Informe_Pruebas_E2E.md` («Datos de prueba generados») deja una contraseña de un usuario de prueba en texto plano en el repositorio. Conviene cambiarla y quitarla del documento.
- **Seguridad:** la clave para cifrar el QR tiene un valor por defecto en el código (`miembros.js:36`, `checkin.js:19`).
- **Pruebas:** 2 de las 23 pruebas de `backend/tests/auth-helpers.test.js` fallan (contraseña con espacios y teléfono con formato `+57 ...`), y `backend/package.json` no tiene script `test`, así que el CI no las ejecuta.
- **Rendimiento:** si el QR no coincide directo, `checkin.js:83-101` descifra en memoria los QR de todos los miembros del gimnasio. Puede afectar RQNF-01 cuando crezca la base.
- **Documentación del código:** comentarios que dicen «trial de 7 días» cuando el valor real es 14 (`auth.js:6, :98`, `trial.js:7`).

## Cómo verificar

- Porcentajes: abrir `docs/avance-requisitos.xlsx` → Resumen (todas las cifras son fórmulas sobre las matrices).
- Cada evidencia: hoja Evidencias, con la ruta del archivo y la línea en el commit `54b19fa`.
- Cobertura: `docs/evidencias/cobertura-backend-2026-10-16.txt`.
- CI: pestaña Actions del repositorio (ejecución exitosa en `main` 8acab31).
