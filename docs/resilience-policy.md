# Política de resiliencia: ubicación de incidencias

## Proveedor

La integración de esta entrega usa el doble controlado del curso en `GET /v1/geocoding?q=...`, expuesto por el backend didáctico local. Sus respuestas (incluidas las coordenadas `0, 0`) son fixtures ficticios; no identifican ubicaciones reales y no se consulta ningún servicio público. La API y sus escenarios se describen en [CAMPUSOPS_API.md](./CAMPUSOPS_API.md).

El cliente usa el mismo `EXPO_PUBLIC_COURSE_BACKEND_URL` que el resto del backend. Para Android, el emulador debe usar `http://10.0.2.2:4310`; un dispositivo físico requiere la IP autorizada en la red de laboratorio. No se debe exponer el simulador a Internet. Los actores y credenciales del curso son datos públicos de prueba, no autenticación de producción.

El adaptador valida etiqueta y coordenadas antes de devolver una ubicación. Acepta solo etiquetas textuales no vacías, latitud finita entre -90 y 90 y longitud finita entre -180 y 180. Un cuerpo malformado, incompleto o fuera de rango se considera respuesta no disponible y no se convierte en una coordenada aproximada.

## Ejecución

Al crear una incidencia, la app consulta la ubicación escrita como referencia al doble. El timeout del cliente es de 2 segundos. Una respuesta 429, un error del servidor, un timeout, una desconexión o una respuesta inválida se clasifica como no disponible; no se propagan detalles de transporte ni del proveedor a la pantalla. La entrada manual sigue habilitada y se usa sin coordenadas si la consulta falla.

Los fallos del transporte no se reintentan automáticamente para esta consulta interactiva: el fallback manual está disponible de inmediato y evita añadir espera cuando el servicio ya ha indicado que no puede responder. Los escenarios reproducibles son locales y no consumen cuotas externas. `planRetry`, usado por operaciones de sincronización, limita reintentos a los primeros tres intentos, respeta un `Retry-After` finito y no reintenta POST sin una clave de idempotencia estable.

## Caché

El adaptador mantiene una caché en memoria por instancia, de máximo 100 entradas y duración de cinco minutos. La clave normaliza espacios repetidos, espacios exteriores y mayúsculas/minúsculas; la consulta HTTP conserva el texto introducido salvo espacios exteriores. Una entrada expirada se elimina al consultar.

Solo se cachean respuestas HTTP exitosas que contienen etiqueta y coordenadas válidas. Respuestas incompletas, JSON inválido, coordenadas inválidas, HTTP 429, errores del servidor, timeout y desconexión nunca se guardan. La caché se pierde al reiniciar la app y no persiste consultas ni ubicaciones en almacenamiento local.

## Ubicación manual

El campo de ubicación permite escribir un edificio, una zona o una referencia. Ante una respuesta no disponible, el selector devuelve `{ source: 'manual', label }`, con el texto manual del usuario y sin `latitude` ni `longitude`. La pantalla informa que usó esa referencia y la conserva para crear la incidencia. No se sustituye por coordenadas inventadas ni por una etiqueta vacía.

Si la respuesta del proveedor es válida, el selector conserva la etiqueta y ambas coordenadas verificadas. La incidencia del contrato actual solo persiste la ubicación como texto; no se agregan coordenadas al DTO de incidencia.
