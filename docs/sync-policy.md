# Politica de sincronizacion (Semana 08)

## Proposito

Definir como CampusOps reconcilia los cambios hechos sin conexion con el estado remoto sin perder la intencion local ni duplicar efectos al reintentar.

## Modelo

Cada registro sincronizable se describe con tres copias (`SyncSnapshot`: `id`, `version`, `fields`):

- `base`: la copia en la `baseVersion` de la operacion pendiente.
- `local`: la copia local con el cambio de la operacion aplicado.
- `remote`: la copia actual del servidor.

La incidencia se proyecta a campos (`incidentToSyncRecord`). La asignacion y el estado viajan juntos en el campo `work` (`assignedTechnicianId`, `status`).

## Reglas de resolucion (`resolveSync`)

La comparacion es por campo y estructural (insensible al orden de claves):

| base vs local | base vs remote | Resultado |
| --- | --- | --- |
| sin cambio | sin cambio | se conserva base |
| cambia | sin cambio | se conserva el cambio local |
| sin cambio | cambia | se conserva el cambio remoto |
| cambia | cambia, mismo valor | converge, sin conflicto |
| cambia | cambia, valor distinto | conflicto en ese campo |

- Un campo agregado o eliminado cuenta como cambio.
- `work` se compara completo: si cambia local y remotamente es conflicto, aunque difieran subcampos distintos (por ejemplo, `status` local y `assignedTechnicianId` remoto).
- Una asignacion local antigua que no cambio respecto a `base` nunca reemplaza una reasignacion remota.
- Si hay uno o mas conflictos, `resolveSync` devuelve `{ kind: 'conflict', fields }` con todos los campos en conflicto y no produce una combinacion parcial.
- No muta `base`, `local` ni `remote`, y el resultado no comparte referencias con ellos.

## Conflictos

- El conflicto se informa en el reporte de sincronizacion (`kind: 'conflict'`, `fields`).
- No se envia nada al servidor para esa operacion.
- La operacion original permanece intacta en la cola; no se descarta ni se reescribe.
- Esta politica no resuelve el conflicto automaticamente: queda pendiente de una decision posterior.

## Idempotencia

- `operationId` identifica de forma estable una operacion.
- `deduplicateOperations` conserva la primera aparicion de cada `operationId`, mantiene el orden y devuelve una lista nueva sin mutar la entrada.
- El envio incluye `operationId`; el servidor debe tratar un reenvio con el mismo `operationId` como la misma operacion (sin repetir el efecto).
- Si una operacion se confirma pero falla el retiro de la cola, se reenvia en la siguiente sincronizacion con el mismo `operationId`.

## Cola

- Una operacion se retira solo despues de que el servidor la confirma (`confirmed`).
- No se retiran operaciones con conflicto, sin confirmacion (`not_confirmed`) ni con error (red, lectura local).
- Las operaciones se procesan en orden FIFO.
- La cola concreta se conecta mediante puertos (`SyncQueuePort`, `SyncLocalPort`, `SyncRemotePort`); el registro de la cola offline los satisface estructuralmente.

## Pruebas

`course-tests/week-08-sync.test.ts` cubre combinacion, conflicto, idempotencia, no mutacion y el comportamiento de la cola; `course-tests/public/week-08.test.ts` cubre el contrato publico. La evidencia esta en `reports/week-08/migration-tests.json`.

## Fuera de alcance

- Resolucion manual o automatica de conflictos.
- Politicas de reintento y espera entre intentos.
- Orden entre operaciones sobre el mismo registro mas alla del orden FIFO de la cola.