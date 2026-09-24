# Auditoría de seguridad — Semana 4

**Nombre:** Kevin Omar Sixto Lázaro
**Repositorio:** https://github.com/oma4r6464/campusops-equipo-13
**Rama:** week4/security-audit-KevinOmarSixtoLazaro

## Hallazgos

## Hallazgo 1 — Token de acceso estático en el backend de pruebas

### Problema encontrado
El backend de pruebas (`course-backend/campusops.mjs` y `course-backend/server.mjs`) siempre entrega el mismo token fijo `'course-valid-token'` sin importar qué actor inicia sesión, y valida las peticiones comparando exactamente ese string.

### Riesgo
Cualquiera que conozca ese string puede autenticarse como cualquier actor cambiando solo el header `x-course-actor`, sin credenciales reales. No hay unicidad ni expiración real del token.

### Decisión
No se corrigió. `docs/CAMPUSOPS_API.md` documenta explícitamente estos valores como "fixtures públicos, no secretos ni autenticación de producción", y `course-backend/self-test.mjs` y `course-backend/campusops-self-test.mjs` dependen de ese string exacto para validar el CI de semanas anteriores. Modificarlo rompería la autoevaluación del curso sin corregir una vulnerabilidad real de la aplicación.

---

## Hallazgo 2 — Mensajes de error con detalle técnico interno

### Problema encontrado
En `src/api/courseBackend.ts`, los errores lanzados incluían el código de estado HTTP y el nombre del contrato directamente en el mensaje.

### Riesgo
Si el error llegara sin filtrar a la interfaz o a un log accesible, expondría detalles internos del backend (status, nombre del contrato) útiles para un atacante.

### Solución
Se reemplazaron los mensajes expuestos por un mensaje genérico ("Servicio no disponible temporalmente."). El detalle técnico ahora solo se registra con `console.warn` para depuración interna, nunca en el `Error` que se propaga.

### Antes
```ts
throw new Error(`Backend health failed with ${response.status}`);
```

### Después
```ts
console.warn(`[courseBackend] health check failed with status ${response.status}`);
throw new Error('Servicio no disponible temporalmente.');
```

### Evidencia
Prueba automatizada en `course-tests/week-04-security.test.ts` que verifica que el mensaje lanzado nunca contiene el status HTTP ni el nombre del contrato, incluso cuando el backend responde con error o con un contrato inválido. Ver `docs/evidence/errores-sanitizados.png`.

---

## Hallazgo 3 — URL de backend hardcodeada como valor de respaldo

### Problema encontrado
`src/api/courseBackend.ts` tenía una URL fija (`DEFAULT_URL = 'http://127.0.0.1:4310'`) escrita en el código como respaldo si la variable de entorno no estaba definida.

### Riesgo
Mezclar configuración con código fuente deja cualquier valor ahí escrito expuesto para siempre en el historial de Git, incluso si en el futuro apuntara a un entorno real.

### Solución
Se eliminó el valor hardcodeado. Ahora la función exige explícitamente `EXPO_PUBLIC_COURSE_BACKEND_URL`; si falta, falla con el mismo mensaje genérico del Hallazgo 2 en vez de usar un valor por defecto silencioso.

### Antes
```ts
const DEFAULT_URL = 'http://127.0.0.1:4310';
export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_URL,
) { ... }
```

### Después
```ts
export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL,
) {
  if (!baseUrl) {
    console.warn('[courseBackend] EXPO_PUBLIC_COURSE_BACKEND_URL no está configurada.');
    throw new Error('Servicio no disponible temporalmente.');
  }
  ...
}
```

### Evidencia
Misma prueba automatizada (`course-tests/week-04-security.test.ts`), tercer caso: verifica que sin la variable de entorno configurada, la función falla explícitamente en vez de usar un valor por defecto oculto. Ver `docs/evidence/errores-sanitizados.png`.

---

## Hallazgo 4 — CORS abierto a cualquier origen

### Problema encontrado
`course-backend/server.mjs` respondía siempre con `access-control-allow-origin: '*'` en todas las rutas.

### Riesgo
Cualquier sitio web, desde cualquier origen, podía hacer peticiones al backend desde el navegador de un usuario y leer las respuestas.

### Solución
Se restringió el header a un origen explícito configurable por variable de entorno (`COURSE_BACKEND_ALLOWED_ORIGIN`, por defecto `http://127.0.0.1:8081`).

### Antes
```js
'access-control-allow-origin': '*',
```

### Después
```js
const ALLOWED_ORIGIN = process.env.COURSE_BACKEND_ALLOWED_ORIGIN ?? 'http://127.0.0.1:8081';
...
'access-control-allow-origin': ALLOWED_ORIGIN,
```

### Evidencia
`curl -i http://127.0.0.1:4310/health` muestra `access-control-allow-origin: http://127.0.0.1:8081` en vez de `*`. Además, `npm run backend:self-test` sigue pasando ("Controlled backend self-test passed"), confirmando que el cambio no afecta la lógica de negocio del backend. Ver `docs/evidence/cors-restringido.png`.