# Contrato de cliente cloud

## Alcance

El cliente de `src/api/courseIncidentClient.ts` es la unica capa que conoce HTTP. Las pantallas reciben resultados de aplicacion y no construyen URLs ni leen respuestas de `fetch`. El backend incluido es una fixture local y no se usa ningun proveedor publico.

## Solicitudes

| Operacion | Metodo y ruta | Entrada |
| --- | --- | --- |
| Lista | `GET /v1/incidents` | `Authorization`, `X-Course-Actor` |
| Detalle | `GET /v1/incidents/:id` | ID codificado en la ruta y las mismas cabeceras |
| Crear | `POST /v1/incidents` | `{ category, description, location }` y `Idempotency-Key` |

La autenticacion y los identificadores usados en pruebas son ficticios. La clave de idempotencia evita duplicar una creacion si se reintenta.

## Respuestas y validacion

Cada incidencia remota usa el sobre `{ id, version, status, payload }`. `id` y `status` deben ser cadenas no vacias, `version` un entero no negativo y `payload` un objeto o `null`. Los campos futuros del sobre se ignoran.

La lista devuelve `{ items: Resource[] }` y la creacion devuelve `{ incident: Resource }`. El detalle devuelve un `Resource`; un 404 se representa como `null`. `payload: null` es una respuesta valida: se conserva como null y no se sustituyen descripcion, ubicacion ni otros datos.

El DTO remoto no es el modelo de pantalla. El cliente devuelve `RemoteIncident`, que mantiene el sobre y el payload sin mutarlo. La conversion a modelos de aplicacion debe validar los campos de dominio antes de usarlos; un DTO incompleto produce error de contrato.

## Errores controlados

| Caso | Representacion |
| --- | --- |
| Sobre, lista o JSON invalido | `IncidentClientError.kind = contract` |
| Tiempo mayor que `timeoutMs` | `kind = timeout` |
| HTTP 500 o superior | `kind = server`, conserva el status |
| Red, 4xx distinto de 404 o desconexion | `kind = network` |

Los errores tienen mensajes publicos genericos. La telemetria solo registra `kind`, `status` y `attempt`, y pasa por `redactForTelemetry`; nunca registra el cuerpo remoto, tokens, nombres, ubicaciones o texto libre.

## Reproduccion local

```text
npm test -- --ci --runInBand course-tests/public/week-05.test.ts course-tests/week-05-client.test.ts
npm run backend:self-test
make verify-week-05
make public-test-week-05
```

Las pruebas de cliente simulan `success`, `nullable`, `malformed`, `slow` mediante abort y `server_error`; `course-backend/server.mjs` permite repetir las mismas variantes con `X-Course-Scenario` sin Internet publico.