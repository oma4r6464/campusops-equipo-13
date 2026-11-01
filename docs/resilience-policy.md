# Política de resiliencia — CampusOps (Semana 09)

## Alcance

Aplica al cliente HTTP `src/api/courseIncidentClient.ts` y a la función pura `planRetry` (`src/api/retryPlan.ts`, expuesta también en `src/course-evaluation/index.ts`). Todas las pruebas usan respuestas simuladas y el backend didáctico local; no requieren Internet público.

## Cuándo reintentar

Se reintenta únicamente una respuesta transitoria: timeout del cliente o estado `408`, `429`, `500`, `502`, `503` o `504`. Cualquier otro estado (`400`, `401`, `403`, `404`, `409`, `422`, etc.) no se reintenta, porque repetir la misma solicitud produciría el mismo resultado o ocultaría un conflicto que debe resolver una persona.

| Regla | Valor | Dónde se comprueba |
|---|---|---|
| Intentos | Se reintenta tras los intentos 1, 2 y 3. A partir del intento 4 no hay otro reintento (máximo 4 solicitudes en total). | `el intento 4 y posteriores no generan otro reintento` |
| Espera progresiva | `baseDelayMs × 2^(intento−1)`, con tope `maxDelayMs`. Por defecto 250, 500 y 1000 ms; tope 2000 ms. | `las esperas son progresivas, finitas, configurables y estan acotadas` |
| Configuración | `baseDelayMs`, `maxDelayMs` y `maxRetryAfterMs` se reciben en la opción `retry` del cliente. Un valor no finito o negativo se ignora y se usa el valor por defecto. | mismo caso |
| `Retry-After` | Si el servicio envía un valor válido (segundos o fecha HTTP), la espera es exactamente ese valor. Si pide más de `maxRetryAfterMs` (5000 ms por defecto) no se reintenta: el cliente no recorta la espera porque eso desobedecería al servicio. Un valor inválido se ignora y se usa la espera progresiva. | `429 respeta Retry-After valido`, `Retry-After mayor al tope o invalido...` |
| Activación | El cliente no reintenta salvo que se pase `retry`. La app lo activa en `src/infrastructure/incidents/courseBackendConfig.ts`. | `sin la opcion retry el cliente conserva el comportamiento anterior` |

## Identidad estable en operaciones con efecto

Un `POST` (crear, resolver, cerrar, comentar, agregar evidencia) solo se repite si lleva `Idempotency-Key` de al menos 8 caracteres, el mismo mínimo que exige el backend didáctico. Sin esa clave `planRetry` devuelve `retry: false` y `requiresStableIdempotencyKey: true`, y el cliente envía la solicitud una sola vez.

Cuando el servidor procesa el cambio pero la respuesta no llega (timeout con efecto ya guardado), el reintento reutiliza la misma clave y exactamente el mismo cuerpo. El servidor reconoce la operación y devuelve el resultado original con `duplicate: true` sin volver a escribir historial, evidencias ni notificaciones. Si la misma clave llegara con otro contenido, el servidor responde `409 idempotency_key_reused`. La puerta de enlace conserva la versión base por clave para que el contenido no cambie entre intentos (`cloudIncidentActionGateway.ts`).

## Cuándo usar fallback

- Lectura (`GET`) que agota sus reintentos: la pantalla conserva el estado previo y ofrece reintento manual (`retryList` en `CampusOpsScreen.tsx`); no entra en un bucle automático.
- Escritura que no puede confirmarse: la intención se conserva como operación con `operationId` estable en la cola offline (ver [sync-policy.md](sync-policy.md)); un error de red, `401`, `403` o `409` no autoriza a descartarla.
- Geocodificación no disponible (timeout, `429` o desconexión): la regla del curso es conservar la ubicación manual capturada por la persona, sin inventar coordenadas (ver [CAMPUSOPS_API.md](CAMPUSOPS_API.md)).

## Cuándo informar el fallo

Se informa a la persona, sin más reintentos automáticos, cuando:

- se alcanzó el intento 4 o `Retry-After` supera el tope;
- el `POST` no tiene identidad estable;
- el estado no es transitorio (`401` sesión, `403` permiso, `409` conflicto, `422` datos inválidos).

Los mensajes públicos son genéricos: no incluyen estado interno, cuerpo de la respuesta ni credenciales.

## Registro de intentos y tiempos

Con `retry` activo, cada fallo emite por `onTelemetry` un evento con `kind`, `status`, `attempt`, `durationMs` y, si se programa otro intento, `delayMs`. El evento pasa por `redactForTelemetry`; no contiene tokens, actor, ubicación, cuerpo de la solicitud ni la clave de idempotencia (probado en `registra intentos y tiempos sin exponer informacion sensible`).

## Riesgo residual

La espera se calcula sin aleatoriedad (sin jitter), por lo que varios clientes que fallen a la vez reintentarían al mismo ritmo; es aceptable en el backend didáctico de un solo cliente. Una clave con 8 o más caracteres se considera estable por contrato, pero `planRetry` no puede verificar que el llamador realmente la reutilice; esa garantía recae en la puerta de enlace y se comprueba con la prueba de respuesta perdida.

## Reproducción

```bash
npm test -- --ci --runInBand course-tests/week-09-retry.test.ts course-tests/public/week-09.test.ts
```

Los escenarios quedan indexados en [retry-metrics.json](../reports/week-09/retry-metrics.json) y [fault-injection.json](../reports/week-09/fault-injection.json).