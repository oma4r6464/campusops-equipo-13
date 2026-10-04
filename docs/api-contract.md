# Contrato de Datos de Integración API - CampusOps (Semana 05)

## Objetivo
Este documento establece el contrato de datos para la comunicación con el backend didáctico de CampusOps, específicamente enfocado en los flujos implementados en la Semana 05:
1. Consulta de lista de incidencias (`GET /v1/incidents`).
2. Consulta de detalle de una incidencia (`GET /v1/incidents/:id`).
3. Creación de nuevas incidencias (`POST /v1/incidents`).

## Justificación de Arquitectura (Evidencia Técnica)

Para asegurar una integración robusta y mantenible, la arquitectura de la aplicación establece un límite estricto entre tres capas de datos. Esta separación es fundamental para alimentar los criterios de calidad y toma de decisiones documentados en `evidence/week-05/engineering.json`:

1. **DTO Remoto (Data Transfer Object):** Es la representación exacta de los datos tal y como viajan por la red. Aislar este modelo permite que los cambios en la API no rompan la lógica interna de la aplicación. Es puramente un sobre de transporte.
2. **Modelo de Dominio:** Es la estructura interna que utiliza la aplicación para renderizar la UI y aplicar reglas de negocio. Se construye a partir del DTO tras pasar un proceso riguroso de validación (`parseRemoteResource`). Aísla a las vistas de detalles técnicos de transporte.
3. **Representación de Errores:** En lugar de lanzar excepciones genéricas o dejar que fallos de red (`500`, `timeout`) lleguen directamente a la UI, la capa de red atrapa estos eventos y los traduce a tipos de error de dominio manejables. Esto garantiza que la aplicación pueda mostrar estados degradados o mensajes útiles de manera predecible y segura.

## Modelos de Datos (Separación de Responsabilidades)

### 1. DTO Remoto (Data Transfer Object)

Todas las operaciones de lectura, escritura y actualización con el backend didáctico transportan el dato utilizando un **sobre remoto estándar**. Este objeto envuelve el contenido real de la incidencia e incluye la información necesaria para el control de concurrencia y validación.

**Campos obligatorios del sobre DTO:**
* `id` (string): Identificador único de la incidencia. No puede estar vacío.
* `version` (number): Entero no negativo que representa la versión del recurso. Usado para operaciones idempotentes y prevención de conflictos.
* `status` (string): Estado actual en el backend (ej. `open`, `assigned`, `resolved`). No puede estar vacío.
* `payload` (object | null): El contenido real de la incidencia.

**Regla crítica sobre `payload: null`:**
Es completamente válido, por contrato, que el servidor responda con un `payload: null` (por ejemplo, simulado vía la variante `X-Course-Scenario: nullable`). **Un payload nulo NO autoriza al cliente a inventar, predecir o inferir datos.** Si la aplicación procesa un `payload: null`, la interfaz debe representarlo como "Contenido no disponible", pero preservando el id, estado y versión de la incidencia que venían garantizados en el sobre principal.

### 2. Modelo de Dominio de CampusOps (App Domain)

Una vez que la aplicación recibe el DTO y pasa por el adaptador de validación, la información se extrae y se mapea hacia una entidad de dominio utilizada por los componentes de la interfaz de usuario.

El modelo de dominio utilizado por la app abstrae la estructura de red y expone de forma directa y tipada los siguientes datos (asumiendo un payload no nulo):
* `categoryId` (string): Categoría del problema reportado.
* `description` (string): Descripción detallada del reporte.
* `location` (string): Ubicación textual de la incidencia.
* Además, incorpora atributos críticos extraídos del sobre principal, como el `id`, `version` y `status`.

### 3. Representación de Errores (Error Types)

Para garantizar un manejo robusto, la aplicación consumirá modelos de error tipados desde el dominio de la app en lugar de delegar el manejo de códigos HTTP crudos a la UI.

* **Error de Validación (`MalformedDataError`):** Representa escenarios donde el servidor envía un DTO roto (falta id o estado) o el payload es semánticamente inconsistente. (Relacionado con la variante `malformed`).
* **Error de Timeout / Desconexión (`NetworkTimeoutError`):** Peticiones que exceden el tiempo máximo de respuesta o falta de internet.
* **Error de Servidor (`ServiceUnavailableError`):** Errores 500 originados en el backend (`server_error`).
* **Límite de Tasa (`RateLimitedError`):** Superación del límite de peticiones HTTP 429 (`rate_limited`).
* **Respuesta Vacía Válida:** (Manejado como un estado válido en el dominio sin lanzar excepción, procesando el DTO con payload null).

## Casos Especiales y Validaciones (Escenarios de Red)

El cliente debe poder simular y reaccionar a diferentes variantes de comportamiento en el backend de pruebas, utilizando la cabecera `X-Course-Scenario`. Las respuestas de la aplicación deben ser:

1. **Escenario `malformed` (Payload Incompleto / Inconsistente):**
   * **Reacción:** El adaptador de red (`parseRemoteResource`) debe rechazar activamente los objetos que no cumplan con el contrato DTO mínimo (falta `id`, `status` vacío, `version` negativa o ausente). El error debe transformarse en una excepción controlada para no inyectar datos sucios ni crashear el modelo de dominio.
2. **Escenario `server_error` (Código 500):**
   * **Reacción:** La aplicación atrapa el error a nivel HTTP y levanta un error de dominio genérico (Servicio no disponible) para la UI, habilitando la posibilidad de informar al usuario.
3. **Escenario `timeout_after_commit` / Lentitud (`slow`):**
   * **Reacción (Timeout):** El cliente puede (y debe) abortar la llamada localmente si excede un temporizador seguro. Sin embargo, en caso de operaciones de escritura (`POST`), la aplicación no asume que la operación falló irrevocablemente; el servidor pudo haber completado la transacción en ese lapso. Por ello, las escrituras usarán mecanismos seguros en base a `Idempotency-Key` en iteraciones futuras.
4. **Escenario `nullable` (Respuesta Vacía Válida):**
   * **Reacción:** Si el sobre devuelve `payload: null`, pasa las validaciones de estructura. La UI asume la indisponibilidad de la descripción del recurso pero respeta el ciclo de vida gestionando su `id` y `status`.

## Especificación de Endpoints (Semana 05)

*Nota: Los valores de autorización y actores mostrados son datos ficticios y de prueba, estipulados en la documentación del backend.*

### Cabeceras Comunes Requeridas

Todas las peticiones a la API bajo `/v1/` requieren las siguientes cabeceras (con datos simulados):
* `Authorization`: `Bearer course-valid-token`
* `X-Course-Actor`: ID del actor simulado (ej. `reporter-1`, `technician-1`, `coordinator-1`).

### 1. Consulta de Lista de Incidencias

* **Endpoint:** `GET /v1/incidents`
* **Descripción:** Retorna la lista de incidencias visibles para el actor actual.
* **Respuesta Exitosa (200 OK):**
```json
{
  "items": [
    {
      "id": "campus-inc-001",
      "version": 1,
      "status": "assigned",
      "payload": {
        "categoryId": "infrastructure",
        "description": "Fuga de agua en el baño principal",
        "location": "Edificio A, Piso 1",
        "reporterId": "reporter-1"
      }
    }
  ]
}
```

### 2. Consulta de Detalle de Incidencia

* **Endpoint:** `GET /v1/incidents/:id`
* **Descripción:** Retorna el sobre completo (DTO) de una única incidencia específica.
* **Respuesta Exitosa (200 OK):**
```json
{
  "id": "campus-inc-001",
  "version": 1,
  "status": "assigned",
  "payload": {
    "categoryId": "infrastructure",
    "description": "Fuga de agua en el baño principal",
    "location": "Edificio A, Piso 1",
    "reporterId": "reporter-1"
  }
}
```
* **Caso de Respuesta Nula Válida (200 OK):**
```json
{
  "id": "campus-inc-001",
  "version": 1,
  "status": "assigned",
  "payload": null
}
```

### 3. Creación de Incidencia

* **Endpoint:** `POST /v1/incidents`
* **Descripción:** Crea un nuevo reporte de incidencia con una categoría válida, descripción y `location` textual.
* **Cabeceras Adicionales Requeridas:**
  * `Idempotency-Key`: Cadena única y estable por operación para prevenir creación duplicada en caso de reintentos por error de red.
* **Cuerpo de Petición (JSON):**
```json
{
  "categoryId": "cleaning",
  "description": "Derrame de líquido en pasillo",
  "location": "Pasillo Central, Nivel 2"
}
```
* **Respuesta Exitosa (201 Created):** 
El servidor confirma la recepción devolviendo el sobre (DTO) de la incidencia con un `id` generado y `version` en `1`.
```json
{
  "id": "campus-inc-002",
  "version": 1,
  "status": "open",
  "payload": {
    "categoryId": "cleaning",
    "description": "Derrame de líquido en pasillo",
    "location": "Pasillo Central, Nivel 2",
    "reporterId": "reporter-1"
  }
}
```
