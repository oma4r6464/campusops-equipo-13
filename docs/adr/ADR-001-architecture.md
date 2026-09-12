# ADR-001 - Arquitectura interna de CampusOps

## Contexto

CampusOps debe crecer hacia lista, detalle, creacion y seguimiento de incidencias, sesion por tres perfiles, persistencia local, sincronizacion y proveedores de ubicacion. En Semana 02 el alcance ejecutable es menor: lista y detalle con datos ficticios. La decision importante es separar responsabilidades para que una pantalla no dependa de un proveedor, almacenamiento o transporte concreto.

React Native, Expo y TypeScript ya estan definidos por el curso. Esta ADR compara solo la organizacion interna del codigo.

## Alternativas

### Alternativa A: componentes conectados directo a servicios

Las pantallas importan funciones de backend, almacenamiento o datos fake y resuelven por si mismas la carga de incidencias. Es rapida para una demo inicial y reduce archivos, pero mezcla presentacion, reglas y proveedor. Probar una pantalla obliga a conocer detalles de infraestructura y cambiar el origen de datos impacta directamente en UI.

### Alternativa B: capas con puertos e implementaciones sustituibles

La UI consume casos de uso de application. Application coordina contratos definidos en domain. Infrastructure implementa esos contratos con un repositorio en memoria para esta semana y adaptadores reemplazables despues. El costo es tener mas archivos y una raiz de composicion, pero permite probar reglas sin React Native y cambiar backend, almacenamiento o ubicacion sin rehacer pantallas.

## Decision

Elegimos la alternativa B: separacion por limites `ui`, `application`, `domain` e `infrastructure`, con `App.tsx` como raiz de composicion. La pantalla `CampusOpsScreen` recibe `CampusOpsServices` y no importa infraestructura. Los casos de uso de aplicacion dependen del contrato `IncidentRepository`; la implementacion actual es `createInMemoryIncidentRepository`, un fake determinista apropiado para Semana 02.

## Razones

- Facilita pruebas porque `application` puede validarse con dobles del repositorio y la UI puede recibir servicios controlados.
- Reduce el costo de cambiar proveedor: el fake de incidencias, un futuro backend HTTP, almacenamiento local o geocodificacion entran por interfaces.
- Mantiene el alcance semanal: solo lista y detalle son ejecutables; sesion, persistencia y ubicacion quedan representadas como limites previstos, no como implementaciones anticipadas.
- Evita la dependencia prohibida UI -> infrastructure; la composicion se concentra en `App.tsx`.

## Consecuencias y trade-off

El beneficio principal es testabilidad y reemplazo de proveedores con menos cambios colaterales. El costo es mayor complejidad inicial: mas carpetas, tipos y funciones de fabrica para un flujo pequeno. Aceptamos ese costo porque CampusOps tendra reglas de sesion, persistencia offline, sincronizacion y ubicacion en semanas posteriores.

La consecuencia operativa es que cualquier nuevo proveedor debe implementar un puerto del dominio o de aplicacion, y las pantallas deben seguir recibiendo servicios desde la composicion. Si una pantalla importa directamente `src/infrastructure` o `src/api`, el diseno y el codigo dejan de coincidir.

## Verificacion

El script `npm run architecture:check` revisa los imports bajo `src` y falla si `src/ui` depende de `src/infrastructure` o `src/api`, si `src/application` depende de infraestructura o UI, o si `src/domain` importa capas externas. Durante el desarrollo se comprobo una contradiccion UI -> infrastructure y luego se corrigio retirando ese import.
