# D5: prueba de usabilidad del check-in manual

**Requisito:** RQNF-04

**Responsable:** Daniel

**Rama:** `docs/rqnf-04-usabilidad`

**Fecha de preparación:** 2026-10-26

**Estado:** Protocolo y revisión del flujo preparados; las tres sesiones con
participantes aún no se han ejecutado.

## Trabajo realizado

- Se revisó el criterio de RQNF-04 y D5 en la matriz de requisitos y en el
  plan de trabajo: tres personas sin formación técnica, check-in manual y
  máximo de dos interacciones.
- Se inspeccionó el flujo de la pantalla en
  `frontend/src/pages/CheckinPage.jsx`. La interfaz tiene una entrada de QR
  con botón «Registrar» y, debajo, una entrada separada «O por documento»
  (`:341-363`). El formulario envía el documento si no hay un código QR.
- Se preparó el guion neutral, el uso de datos sintéticos, la hoja anónima
  para P1–P3, el conteo de interacciones y tiempo, y la limpieza entre
  sesiones.
- Se definió no registrar nombres, contactos, imágenes, audio o video, y no
  realizar la prueba en producción.

Esta inspección confirma qué flujo se debe observar; no demuestra que una
persona pueda completarlo en dos interacciones ni sustituye las sesiones.
La posición separada del campo de documento respecto al campo QR y al botón
es un aspecto que se debe observar sin orientar a los participantes.

## Ejecución de sesiones

Se confirmó la disponibilidad de tres voluntarios, pero no se recibieron
mediciones observadas de las sesiones ni evidencia de que se hayan ejecutado.
Por ello, no se atribuyen resultados a P1–P3 ni se inventan tiempos,
interacciones, solicitudes de ayuda o confirmaciones del método guardado.
Tampoco se modificó ni se borró ningún registro de participantes.

**Sesiones observadas:** ninguna; el entorno preparado no se usó con
participantes.

**Preparación local:** existe la base aislada
`fitloyalty_d5_test_20261026`, con migraciones 002–014, una cuenta
administradora sintética y el miembro de prueba `79123456` con plan vigente.
El backend y el frontend respondieron localmente; el scheduler y WhatsApp se
mantuvieron deshabilitados. Esta base usa el servicio PostgreSQL local, no un
contenedor Docker. Al revisar este estado, Docker no estaba disponible en el
equipo, por lo que la preparación solicitada con Docker sigue pendiente y no
se deben iniciar las sesiones hasta dejar listo ese entorno aislado. No se
usó producción.

## Objetivo y criterio

Observar a tres personas sin formación técnica mientras registran el ingreso
de un miembro por documento, sin recibir instrucciones de interfaz. Registrar
si completan la tarea, cuántas interacciones necesitan y cuánto tardan.

El objetivo de diseño es completar la tarea en un máximo de dos interacciones:
introducir el documento y activar «Registrar». La prueba no se considera
aprobada hasta que tres participantes reales hayan realizado el recorrido y
se hayan guardado sus resultados. No se asignan resultados anticipadamente.

## Preparación

1. Usar PostgreSQL en Docker local, aislado y nunca en producción, y una
   cuenta de administrador temporal. Deshabilitar scheduler y WhatsApp.
2. Dejar abierta la pantalla Check-in y preparar un miembro de prueba activo
   con un documento sintético. No usar información personal real.
3. Comprobar antes de cada sesión que no exista ya un check-in de prueba que
   pueda confundirse con el resultado, y limpiar el estado entre sesiones.
4. Invitar a tres personas que no hayan recibido formación técnica ni
   capacitación sobre FitLoyalty. Registrar solo códigos P1, P2 y P3; no
   guardar nombres, contactos, empleadores, audio ni video.
5. Explicar que se evalúa la interfaz, no a la persona, y pedir su
   consentimiento verbal antes de empezar. Puede detenerse en cualquier
   momento.

## Guion de cada sesión

1. Abrir la pantalla de Check-in en su estado inicial, sin seleccionar
   controles por la persona participante.
2. Leer exactamente esta tarea, sin explicar los pasos:

   > Una persona va a ingresar al gimnasio. Registra su ingreso usando el
   > documento de prueba **79123456**. Avísame cuando hayas terminado.

3. Iniciar el cronómetro al terminar de leer la tarea. No ayudar ni señalar
   elementos. Si la persona pide ayuda, responder: «Haz lo que te parezca más
   natural»; anotar la solicitud.
4. Detener el cronómetro cuando se muestre la confirmación del check-in y
   verificar que el ingreso de prueba aparezca en la actividad reciente.
   Anotar también el método mostrado; la entrada debe quedar registrada como
   manual, no como QR.
5. Contar una interacción por cada acción necesaria para completar una tarea
   (por ejemplo, localizar y completar el campo de documento cuenta como una
   interacción; activar «Registrar» cuenta como otra). Anotar por separado
   clics, cambios de modo, intentos adicionales y solicitudes de ayuda para
   hacer explícito cualquier paso extra.
6. Eliminar el registro temporal antes de iniciar la siguiente sesión.

No pedir que compartan su pantalla ni tomar capturas con la persona o datos
identificables. Si se necesita evidencia visual, capturar únicamente el
estado de la aplicación con datos sintéticos.

## Resultados

**Pendientes de ejecución.** Las filas son marcadores para las sesiones
futuras; no representan sesiones ejecutadas.

| Código | Sin formación técnica (sí/no) | Completó (sí/no) | Interacciones | Tiempo (s) | Ayuda solicitada | Método registrado | Observaciones |
|---|---|---|---:|---:|---|---|---|
| P1 | Pendiente | Pendiente | — | — | — | — | — |
| P2 | Pendiente | Pendiente | — | — | — | — | — |
| P3 | Pendiente | Pendiente | — | — | — | — | — |

### Cálculo y decisión

- Participantes que completaron: 0 observados; faltan las tres sesiones.
- Interacciones por participante: pendiente de ejecutar.
- Tiempo por participante y mediana: pendiente de ejecutar.
- Ayuda y dificultades observadas: pendiente de ejecutar.
- Método guardado como MANUAL en las tres sesiones: pendiente de ejecutar.

**Veredicto:** Preparación completada; validación con usuarios no ejecutada.
No se puede determinar si se alcanza el máximo de dos interacciones. RQNF-04
permanece Parcial hasta observar a los tres participantes, completar esta
tabla y analizar sus resultados.

## Incidencias a observar

- El campo de documento y el campo de QR son entradas separadas; anotar si la
  persona encuentra el campo adecuado sin indicaciones.
- Verificar que la actividad reciente registre el método MANUAL cuando se usa
  un documento. Si aparece QR, conservar la observación como defecto funcional
  y avisar al responsable del archivo antes de modificar código ajeno.
- Si una persona supera dos interacciones, no alterar ni descartar el
  resultado: registrar el recorrido observado y dejar el criterio como no
  satisfecho.
