# C7 — Listado vía Procedimiento Almacenado (T-11)

**Responsable:** Santiago Salamanca Narváez  
**Criterio:** C7 — Tabla desde Procedimiento Almacenado, todos los campos excepto ID

---

## Qué demostrar en la sustentación

1. Login como admin → pestaña **"Reporte Asistencia (SP)"**
2. Seleccionar rango de fechas (ej. 2026-06-01 a 2026-06-16)
3. Tabla con columnas: **Miembro, Documento, Fecha, Hora, Método de Ingreso** (sin columna ID)
4. (Refuerzo) Mostrar en pgAdmin: `SELECT * FROM sp_reporte_asistencia(1, '2026-06-01', '2026-06-16');`

---

## Procedimiento almacenado

Definido en `ConsultasDB/Query_Inicial_Crear_Tablas.sql`:

```sql
CREATE OR REPLACE FUNCTION sp_reporte_asistencia(
    p_id_gimnasio INTEGER,
    p_fecha_inicio DATE,
    p_fecha_fin DATE
)
RETURNS TABLE (
    miembro VARCHAR(100),
    documento VARCHAR(20),
    fecha DATE,
    hora TIME,
    metodo VARCHAR(20)
)
```

---

## API

```
GET /api/admin/reporte-asistencia?startDate=2026-06-01&endDate=2026-06-16
Authorization: Bearer <token_admin>
```

---

## Capturas requeridas (guardar en esta carpeta)

| # | Archivo sugerido | Contenido |
|---|------------------|-----------|
| 1 | `01_formulario_fechas.png` | Filtros de fecha en Reporte Asistencia |
| 2 | `02_tabla_resultados.png` | Tabla con datos del SP (sin ID) |
| 3 | `03_pgadmin_sp.png` | pgAdmin ejecutando `sp_reporte_asistencia` |
