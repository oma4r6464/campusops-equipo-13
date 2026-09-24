# Evidencia 2 - Origen CORS

Antes: `access-control-allow-origin: *`

Después: origen configurable mediante `COURSE_BACKEND_ALLOWED_ORIGIN`, con valor local predeterminado `http://localhost:8081`.

Esto limita el backend didáctico a un origen local conocido.
