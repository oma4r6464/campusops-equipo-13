# Definición del problema — CampusOps

## Problema

La comunidad de un campus universitario (estudiantes y personal) necesita una herramienta centralizada y móvil para reportar, asignar y dar seguimiento a fallas de infraestructura (daños, fugas, problemas eléctricos o de red). Actualmente no existe un flujo claro, y los técnicos necesitan poder consultar sus tareas y registrar evidencia en el lugar de los hechos, incluso en zonas del campus sin conexión a internet.

## Alcance

### Incluye

- Gestión del ciclo de vida de los reportes (creación, asignación, atención y cierre).
- Control de sesión seguro para tres perfiles distintos (Reportante, Técnico, Coordinador).
- Capacidad de trabajo sin conexión (offline) para los técnicos, incluyendo sincronización de datos y manejo de conflictos (ej. reasignaciones concurrentes).
- Adjunto de evidencias fotográficas (acceso a cámara/galería) y ubicación (geocodificación o captura manual).

### No incluye

- Sistema de atención de emergencias críticas institucionales.
- Chat en tiempo real, notificaciones push (como requisito central), ni panel de administración web completo.
- Integración con sistemas de bases de datos de alumnos reales institucionales o pasarelas de pago.

## Actores y responsabilidades

- **Reportante:** Crear una incidencia, clasificar su categoría, describirla, adjuntar fotografías, indicar su ubicación y consultar el estado de sus reportes.
- **Técnico:** Consultar incidencias asignadas, iniciar su atención, registrar el diagnóstico/notas/fotografías y marcarla como resuelta. Puede trabajar sin conexión a internet.
- **Coordinador:** Revisar el conjunto de reportes, priorizar, asignar o reasignar técnicos a los casos, revisar el historial y evidencias, y cerrar una resolución o reabrir el caso.

## Flujo principal

1. Reportar: El reportante crea una incidencia con su descripción, ubicación y fotos. Queda en estado `open`.
2. Asignar: El coordinador la revisa, la prioriza y la asigna a un técnico. Pasa a estado `assigned`.
3. Atender: El técnico inicia la atención (`in_progress`), realiza el trabajo, documenta con notas o fotos, y finalmente marca la incidencia como `resolved`.
4. Cerrar: El coordinador revisa la solución aportada por el técnico y determina el cierre final (`closed`), o bien reabre el caso si no fue solucionado satisfactoriamente.

## Criterios de aceptación verificables

1. Dado un técnico que inicia la atención de una incidencia estando sin conexión a internet, cuando recupere la conexión, entonces el sistema debe sincronizar sus notas y evidencias.
2. Dado que un coordinador reasigna una incidencia mientras el técnico original la está atendiendo sin conexión, cuando el técnico vuelva a tener internet, entonces el sistema debe detectar y reportar el conflicto de asignación en vez de sobrescribir los datos.
3. Dado que un reportante intenta adjuntar una evidencia, cuando se le soliciten permisos de cámara y los rechace, entonces el sistema debe permitirle continuar el reporte sin cámara (escribiendo o seleccionando de galería).
