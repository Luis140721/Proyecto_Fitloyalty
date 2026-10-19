# Evidencia RQNF-02: Monitor Externo de Disponibilidad

## 1. Información General
* **Requisito:** RQNF-02 (Disponibilidad del sistema / Monitoreo)
* **Responsable:** Daniel Torres
* **Endpoint monitoreado:** `/api/healthz`
* **Frecuencia de revisión:** Cada 5 minutos
* **Periodo de evaluación:** 17 de octubre de 2026 – 22 de octubre de 2026

---

## 2. Descripción de la Prueba
Se configuró un monitor externo para realizar solicitudes HTTP GET al endpoint `/api/healthz` expuesto por la API de FitLoyalty en producción/desarrollo de manera automatizada cada 5 minutos. El objetivo es verificar la estabilidad del servidor y registrar de forma transparente el porcentaje de tiempo en línea (*uptime*).

---

## 3. Resultados Obtenidos
* **Estado del servicio:** Operativo / Estable
* **Porcentaje de disponibilidad (*Uptime*):** 100% (o el porcentaje real que arroje tu monitor)
* **Tiempo de respuesta promedio:** < 150 ms

---

## 4. Capturas de Evidencia
*(Inserta aquí las capturas de pantalla de tu panel de monitoreo, por ejemplo, UptimeRobot, o descripciones de los registros obtenidos)*

> ![Ejemplo de panel de disponibilidad](./img/monitor-healthz.png)

---

## 5. Conclusión
El endpoint `/api/healthz` respondió de forma correcta a las peticiones programadas, cumpliendo con los estándares de disponibilidad establecidos para la Release del proyecto FitLoyalty.