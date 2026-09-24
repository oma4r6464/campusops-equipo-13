# Auditoría de seguridad - Semana 4

**Nombre:** Jesus Emanuel Vega Medina
**Rama:** `week4/security-audit-jesus-emanuel`

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | La función de telemetría estaba pendiente y no ocultaba datos sensibles. | Un log podría mostrar tokens, correos, nombres o ubicaciones de personas. | Se implementó una sanitización recursiva que reemplaza campos sensibles por `[REDACTED]`. | [hallazgo-1-redaccion.md](evidence/hallazgo-1-redaccion.md) |
| 2 | El backend respondía con CORS abierto para cualquier origen. | Una página externa podría intentar consumir el servicio del entorno de prueba. | Se cambió a un origen configurable y por defecto local. | [hallazgo-2-cors.md](evidence/hallazgo-2-cors.md) |
| 3 | Un archivo `.env` podría contener configuración privada si se agrega por error. | Una variable privada podría terminar publicada en el repositorio. | El control ya existía: `.env` está incluido en `.gitignore` y se verificó con Git. | [hallazgo-3-env.md](evidence/hallazgo-3-env.md) |

## Hallazgo 1 - Datos sensibles en telemetría

### Problema encontrado

`redactForTelemetry` estaba pendiente. Si se utilizaba con información de una incidencia, podía devolver el objeto original con campos sensibles.

### Riesgo

Los logs pueden quedar guardados en equipos o servicios de diagnóstico. Un token, correo, nombre o ubicación podría quedar expuesto.

### Solución

Se implementó una función recursiva que revisa objetos y listas sin modificar la entrada. Los campos sensibles se reemplazan por `[REDACTED]` y se conservan datos técnicos como `incidentId`.

### Evidencia

La prueba pública de Semana 4 confirma que `authorization`, `email`, `location`, `photos` e `internalComments` se ocultan y que `incidentId` se conserva.

## Hallazgo 2 - CORS abierto

### Problema encontrado

El servidor enviaba `access-control-allow-origin: *`.

### Riesgo

Cualquier origen web podía intentar realizar solicitudes al backend de prueba desde un navegador.

### Solución

El origen permitido ahora se configura con `COURSE_BACKEND_ALLOWED_ORIGIN` y usa `http://localhost:8081` como valor local predeterminado.

### Evidencia

La verificación del backend confirma que la respuesta usa el origen local configurado y ya no utiliza `*`.

## Hallazgo 3 - Archivo `.env`

### Problema encontrado

Un archivo `.env` puede contener valores privados y ser agregado accidentalmente al repositorio.

### Riesgo

Podrían publicarse configuraciones o credenciales reales.

### Solución y evidencia

El proyecto ya contiene `.env` en `.gitignore`. Se comprobó con `git check-ignore .env` y el archivo no aparece como cambio pendiente en `git status`.

## Comprobación final

- Se usaron únicamente datos ficticios del proyecto.
- No se agregaron credenciales reales.
- Se verificó que `.env` está ignorado.
- Se ejecutó la prueba pública específica de Semana 4 después de instalar dependencias.
