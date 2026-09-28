# Controles de seguridad y privacidad

## Alcance y activos

Semana 04 usa exclusivamente datos ficticios. No se usan credenciales reales, nombres reales, ubicaciones reales, fotografías reales ni comentarios internos reales. Los activos identificados en [docs/threat-model.md](threat-model.md) son la sesión, fotografías/evidencia, ubicación y asignaciones.

## Controles implementados

| Amenaza | Control en código | Prueba/evidencia |
|---|---|---|
| Token o dato personal en logs anidados | `src/security/redactForTelemetry.ts` reconstruye objetos y listas, normaliza claves y sustituye `authorization`, tokens, identificadores personales, ubicación, fotos, evidencia, comentarios internos e historial de asignación por `[REDACTED]`. | `course-tests/public/week-04.test.ts` y `course-tests/week-04-security.test.ts`; resultado en `reports/week-04/negative-tests.json`. |
| Entrada original alterada durante la sanitización | El sanitizador no muta la entrada: crea nuevos arrays y objetos y conserva el contexto técnico permitido (`incidentId`, `status`, `attempt`, `durationMs`). | Caso negativo de no mutación en `course-tests/week-04-security.test.ts`. |
| Error técnico expone detalles del backend | `createCourseBackendHealthReader` envía al callback sólo `status`, `attempt` y `durationMs`, pasando el evento por `redactForTelemetry`; el mensaje de excepción no se registra. | Camino `offline` probado en `course-tests/week-04-security.test.ts`. |
| Mensajes públicos con detalle interno | `src/api/courseBackend.ts` mantiene el backend local reproducible, pero los errores propagados usan un mensaje genérico y no incluyen status HTTP, payload recibido ni tokens de error. | Casos de error HTTP y contrato inválido en `course-tests/week-04-security.test.ts`. |
| Backend didáctico con CORS abierto | `course-backend/server.mjs` usa `COURSE_BACKEND_ALLOWED_ORIGIN` con valor local ficticio por defecto, en lugar de responder con `access-control-allow-origin: *`. | `npm run backend:self-test` conserva el contrato y `reports/week-04/negative-tests.json` documenta el control. |
| Secretos escritos en el repositorio | Revisión reproducible con `tools/course_public_evaluator.py`, que escanea claves privadas, tokens GitHub, claves AWS y nombres `EXPO_PUBLIC_*` peligrosos. | `reports/week-04/secret-scan.json`. |

## Almacenamiento elegido

CampusOps no persiste sesión ni datos sensibles en esta entrega. Los datos de pantalla permanecen en memoria y los futuros tokens de sesión deberán guardarse con `expo-secure-store`, usando el almacén seguro del sistema operativo, en lugar de AsyncStorage o archivos JSON. AsyncStorage es simple y multiplataforma, pero no ofrece cifrado ni protección adecuada para credenciales; SecureStore reduce esa exposición, a cambio de límites de tamaño, dependencia del dispositivo y pérdida potencial al desinstalar la app. Ubicación, fotos, comentarios internos e identificadores personales no deben persistirse localmente salvo una necesidad aprobada, con minimización, expiración y control de acceso. `.env.example` conserva sólo nombres de variables y valores ficticios vacíos para no normalizar credenciales o endpoints reales en archivos versionados.

## Riesgo residual

La sanitización depende de que cada salida pase por el helper; una biblioteca externa de analítica, un crash reporter o un `console` añadido fuera de esta ruta todavía podría capturar datos. La lista de claves no sustituye la autorización del backend, el cifrado en tránsito ni la gestión real de sesión. El backend didáctico conserva tokens ficticios publicados por el contrato del curso; esos valores no son autenticación de producción. El escaneo detecta patrones conocidos, no secretos con formatos nuevos. Estos límites se controlan en semanas posteriores con revisión de dependencias, pruebas de integración y una configuración de logging de producción sin datos sensibles.

## Reproducción

Ejecutar `npm test -- --runInBand course-tests/public/week-04.test.ts course-tests/week-04-security.test.ts src/core/telemetry/sanitizer.test.ts`, `npm run typecheck`, `npm run lint`, `npm run backend:self-test` y `python tools/course_public_evaluator.py --week 04 --mode verify --execute-toolchain`. Los resultados observados se indexan en `reports/week-04/negative-tests.json`, `reports/week-04/secret-scan.json` y `evidence/week-04/engineering.json`.
