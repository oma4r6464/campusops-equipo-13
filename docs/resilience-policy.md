# Política de resiliencia — CampusOps (Semana 09)

## Proveedor, caché y ubicación manual

La integración usa el doble controlado del curso en `GET /v1/geocoding?q=...`, mediante un adaptador y el backend didáctico local. Las respuestas son ficticias y no se consulta un servicio público. La URL se configura con `EXPO_PUBLIC_COURSE_BACKEND_URL`.

El adaptador valida etiqueta no vacía, latitud finita entre -90 y 90 y longitud finita entre -180 y 180. Mantiene una caché en memoria de hasta 100 entradas durante cinco minutos, normalizando la consulta. Sólo guarda respuestas válidas; no guarda errores 429, respuestas incompletas, coordenadas inválidas, timeout ni desconexiones.

`selectIncidentLocation` conserva una ubicación válida del proveedor. Ante respuesta nula, incompleta, inválida, timeout, 429 o desconexión, conserva el edificio, zona o referencia escrita manualmente y no inventa coordenadas.

## Reintentos

Sólo se reintentan timeout y estados transitorios 408, 429, 500, 502, 503 y 504. Los estados 400, 401, 403, 404, 409 y 422 se informan sin repetir la solicitud.

| Regla | Política |
|---|---|
| Intentos | Se reintenta después de los intentos 1, 2 y 3; desde el intento 4 no se reintenta. |
| Backoff | 250, 500 y 1000 ms por defecto, con tope configurable de 2000 ms. |
| Retry-After | Se respeta si es válido y no supera el tope configurable de 5000 ms; un valor inválido usa backoff. |
| Configuración | `baseDelayMs`, `maxDelayMs` y `maxRetryAfterMs` son configurables y se validan. |

Un POST sólo se repite con una clave de idempotencia estable de al menos ocho caracteres. Si el servidor guardó el cierre o resolución pero la respuesta se perdió, el cliente conserva la misma clave y el mismo cuerpo. El servidor devuelve el resultado ya guardado sin duplicar historial, evidencias ni notificaciones.

## Cuándo usar alternativa o informar fallo

- Geocodificación no disponible: continuar con la referencia manual, sin coordenadas inventadas.
- GET transitorio: reintentar dentro del límite; si se agota, informar fallo sin bucle automático.
- POST sin clave estable: enviarlo una sola vez y no repetirlo.
- POST con respuesta perdida: reintentar sólo con la misma identidad y contenido.
- Estado no transitorio, intento 4 o Retry-After superior al tope: informar fallo y conservar la intención pendiente cuando aplique.

Los eventos de telemetría registran únicamente contexto técnico sanitizado: tipo, estado, intento, duración y espera. No incluyen tokens, actor, ubicación, cuerpo ni clave de idempotencia.

## Riesgo residual y reproducción

El backoff no usa jitter, por lo que varios clientes podrían coincidir en sus tiempos; es aceptable para el backend didáctico. Las pruebas usan dobles controlados, respuestas simuladas y datos ficticios, sin Internet público.

Comando principal:

```bash
npm test -- --ci --runInBand course-tests/week-09-location.test.ts course-tests/week-09-retry.test.ts course-tests/public/week-09.test.ts
```

Los resultados se conservan en `reports/week-09/fault-injection.json` y `reports/week-09/retry-metrics.json`.
