# Modelo de Amenazas Inicial (Semana 03)

## 1. Activos a proteger
Los principales activos del sistema CampusOps que deben ser protegidos son:
- **Sesiones de usuario:** Tokens o identificadores que permiten a un usuario mantener acceso autenticado a la plataforma.
- **Fotografías subidas:** Evidencia fotográfica de incidencias o reportes que podrían contener información sensible del campus.
- **Ubicaciones (GPS):** Coordenadas geográficas asociadas a los reportes, que revelan la posición de los usuarios o de los equipos.
- **Asignaciones de tareas:** La relación de qué usuario está a cargo de resolver qué incidencia, la cual define responsabilidades y permisos.

## 2. Fronteras de confianza
Las fronteras de confianza delimitan las zonas donde los datos cambian de un nivel de seguridad a otro:
- **Dispositivo móvil (Cliente) ↔ Red ↔ API Backend:** El dispositivo del usuario es un entorno no confiable. Todos los datos que viajan desde la aplicación React Native hacia el servidor deben ser validados al cruzar esta frontera.
- **Aplicación ↔ Sistema de Archivos Local/Logs:** El almacenamiento local en el teléfono y los registros de la consola (logs) pueden ser accedidos por el sistema operativo o herramientas de depuración.

## 3. Amenazas Priorizadas y Controles

Se identificaron las siguientes amenazas utilizando datos ficticios como base para el análisis. Se priorizan en función del impacto inmediato sobre la integridad y confidencialidad del sistema.

### Prioridad 1: Exponer credenciales de la API en el código fuente
- **Riesgo:** Un desarrollador por error hace _commit_ de tokens, claves de acceso o contraseñas (ej. token ficticio `sk-12345XYZ`) en el repositorio. Un atacante con acceso al código fuente podría usar esta clave para suplantar al sistema.
- **Justificación de la prioridad:** Crítica. La exposición de secretos permite un compromiso total e inmediato de los servicios de backend asociados, evadiendo todas las demás defensas de la aplicación.
- **Control que lo reduce:** Escaneo automatizado de secretos en el código fuente antes y durante la Integración Continua (CI).
- **Prueba asociada:** El workflow de GitHub Actions fallará si se detecta un patrón de clave o secreto introducido en el código.
- **Riesgo residual:** Que se exponga una credencial que no coincida con los patrones de búsqueda predeterminados del motor de CI.

### Prioridad 2: Alterar asignaciones que no les corresponden
- **Riesgo:** Un usuario común intercepta o manipula una petición HTTP para cambiarse a sí mismo la asignación de una tarea de mantenimiento, evadiendo el proceso administrativo.
- **Justificación de la prioridad:** Alta. Destruye la integridad operativa del negocio y la confianza en la herramienta.
- **Control que lo reduce:** Validación en el Backend de que el rol del usuario autenticado tiene permisos para reasignar tareas.
- **Prueba asociada:** Pruebas de integración automatizadas (`npm test`) que envíen peticiones maliciosas con roles insuficientes y verifiquen un rechazo (HTTP 403/401).
- **Riesgo residual:** Vulnerabilidades tipo Insecure Direct Object Reference (IDOR) donde la autorización no chequee el recurso específico.

### Prioridad 3: Consultar incidencias de otros usuarios
- **Riesgo:** Un usuario, cambiando un parámetro en la URL de la API (ej. `/incidencias/999`), accede a detalles de incidencias reportadas por otros departamentos.
- **Justificación de la prioridad:** Media. Constituye una fuga de información de nivel moderado, asumiendo que las incidencias no contienen datos personales altamente sensibles.
- **Control que lo reduce:** Reglas de control de acceso a nivel de registro (Row-Level Security) en la API.
- **Prueba asociada:** Casos de prueba automatizados en Jest que intenten solicitar un recurso que no pertenece al usuario emisor del token.
- **Riesgo residual:** Fugas incidentales en listados generales no paginados u ofuscados.

### Prioridad 4: Filtrar datos sensibles en registros (logs)
- **Riesgo:** La aplicación escribe objetos enteros en la consola (ej. `console.log(userObject)`) incluyendo tokens de sesión o contraseñas en texto claro que quedan almacenados en los registros locales del dispositivo.
- **Justificación de la prioridad:** Media-Baja. Depende de que el dispositivo esté comprometido o un atacante tenga acceso físico o herramientas de _debugging_.
- **Control que lo reduce:** Reglas de linter (ESLint) estáticas que impidan el uso irrestricto de `console.log`, y funciones de sanitización de logs.
- **Prueba asociada:** El paso de _Linting_ (`npm run lint`) en el CI marcará un error y romperá la compilación si detecta declaraciones de consola no permitidas.
- **Riesgo residual:** Que otros servicios de terceros (Analytics, Crashlytics) capturen estados de la app inadvertidamente.

## 4. Verificación de controles
La verificación queda conectada a controles reproducibles: `make verify-week-03` revisa el escaneo de secretos y los reportes de evidencia, `make public-test-week-03` confirma los requisitos públicos de la actividad y `npm run lint` mantiene el control preventivo sobre registros inseguros.
