# Política de sincronización — CampusOps (Semana 08)

## Identidad y cola

Cada cambio offline se guarda en SQLite como una operación con `operationId` estable, `incidentId`, `authorId`, `baseVersion`, contenido, fecha y estado. El mismo `operationId` se reutiliza al reintentar. La operación sólo se elimina cuando el servidor confirma el efecto; un error o un conflicto la conserva para diagnóstico y reintento.

Al reiniciar, una operación que estaba en `syncing` vuelve a `pending`. Las operaciones se envían en orden FIFO y la deduplicación conserva la primera entrada de cada `operationId` sin modificar las entradas originales.

## Combinación y conflicto

`resolveSync` compara cada campo con la versión base por contenido JSON:

- si sólo cambió localmente, conserva el valor local;
- si sólo cambió en remoto, conserva el valor remoto;
- si ambos cambiaron al mismo contenido, conserva ese contenido;
- si ambos cambiaron a contenidos distintos, devuelve `conflict` con los nombres ordenados.

En CampusOps, `work` agrupa estado y asignación. Por eso un inicio local y una reasignación remota producen conflicto: se conserva la intención local en la cola, pero nunca se sobrescribe la asignación remota automáticamente. La interfaz debe informar la incompatibilidad y una coordinación autorizada decide la resolución.

## Autorización y reintento

La operación se valida con el perfil y la asignación del actor antes de enviarse y el servidor vuelve a aplicar esa autorización. Un reintento usa la misma identidad para que el servidor no aplique dos veces el efecto. Una respuesta confirmada permite retirar la operación; un `401`, error de red, `409` o `403` no autoriza a descartarla.

## Evidencia

La suite de persistencia comprueba reinicio, migración, rollback e idempotencia en [course-tests/week-08-persistence.test.ts](../course-tests/week-08-persistence.test.ts). La combinación de cambios y el conflicto de `work` se comprueban en [course-tests/public/week-08.test.ts](../course-tests/public/week-08.test.ts). El índice de resultados reproducibles está en [migration-tests.json](../reports/week-08/migration-tests.json).
