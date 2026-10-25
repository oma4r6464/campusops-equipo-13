# ADR-002: Persistencia local durable de incidencias y cola offline

- **Estado:** Aceptado
- **Fecha:** 2026-10-23
- **Relacionado:** ADR-001 (capas y adaptadores), `docs/CAMPUSOPS.md` (semana 8), `SECURITY.md` (cambio de dependencias), `docs/security-controls.md`

## Contexto

En la semana 8 hay que guardar incidencias y la cola offline fuera de memoria. Los requisitos son:

- La cola sobrevive al reinicio con `operationId`, `incidentId`, `baseVersion` y `authorId`.
- Las notas y las referencias de fotos siguen disponibles después del reinicio.
- Una migración de esquema fallida no deja estado parcial.

`docs/CAMPUSOPS_API.md` aclara además que las pruebas de funciones puras no demuestran persistencia real. Por eso las pruebas tienen que escribir en disco y volver a abrir el almacenamiento.

Por ADR-001, la capa de aplicación depende solo de la interfaz `LocalStore` (`src/application/offline/localStore.ts`), y las implementaciones viven en `infrastructure`.

## Alternativas

| Alternativa | Beneficio | Costo / riesgo |
|---|---|---|
| **A. SQLite** (`expo-sqlite` en la app, `node:sqlite` en las pruebas) | Transacciones con rollback nativas. Las migraciones corren en una transacción junto con `PRAGMA user_version`. La cola se puede consultar por estado o incidencia y en orden. El mismo SQL corre en la app y en las pruebas. | Agrega una dependencia nativa (`expo-sqlite`), lo que obliga a seguir el proceso de `SECURITY.md`. `node:sqlite` todavía figura como experimental en Node 22. |
| B. Archivo JSON con escritura atómica (`.tmp` y luego renombrar) | No agrega dependencias nativas y es fácil de inspeccionar. | Reescribe todo el archivo en cada cambio y no permite consultas. Las transacciones y migraciones son lógica propia, más difícil de auditar. |
| C. AsyncStorage / MMKV | Son simples y conocidos. | No tienen transacciones entre varias claves: una migración que se interrumpe puede dejar estado parcial, lo que viola el criterio de aceptación. `docs/security-controls.md` ya descarta AsyncStorage para datos sensibles. |

## Decisión

Elegimos la **alternativa A**:

- Una sola clase `SqliteLocalStore` implementa `LocalStore` sobre un `SqlDriver` mínimo con `exec`, `run`, `all` y `close`.
- En la app se usa `createExpoSqliteDriver`, basado en `expo-sqlite` e instalado con `npx expo install` en la versión compatible con el SDK 57.
- En las pruebas se usa `createNodeSqliteDriver`, basado en `node:sqlite`, que ya viene con Node 22.22 (`.nvmrc`). No hace falta ninguna dependencia de desarrollo extra.
- Cada transacción hace `BEGIN IMMEDIATE`, luego `COMMIT`, y ante cualquier error, `ROLLBACK`. El acceso a la conexión es estrictamente secuencial.
- La versión del esquema se guarda en `PRAGMA user_version`. En SQLite ese valor es transaccional, así que se revierte junto con el resto si la migración falla.
- Se activa `journal_mode = WAL` y `synchronous = FULL` para que lo confirmado sobreviva a una caída.

`FileLocalStore` (alternativa B) se conserva como implementación secundaria de la misma interfaz y sirve como referencia para la prueba de recuperación ante escrituras a medias. No se usa en la app.

## Datos sensibles (excepción aprobada a `security-controls.md`)

Las notas y las referencias de fotos de la cola **sí** se guardan localmente. El requisito offline de la semana 8 lo hace necesario. Se aplican estos controles:

- **Minimización:** solo se guardan los campos de `PendingOperation`. No se guardan tokens ni credenciales; esos siguen en `expo-secure-store`.
- **Expiración:** el registro se borra de `pending_operations` cuando la sincronización se confirma, y en ese momento se borra también el archivo de foto asociado.
- **Ubicación:** la base y las fotos viven en el almacenamiento privado de la app. `photoRefs` apunta a una copia dentro de `documentDirectory`, no a la ruta temporal del selector de fotos (`CAMPUSOPS.md`: la foto "no debe depender únicamente de una referencia temporal").
- **Pruebas:** usan solo datos ficticios.

## Consecuencias

- La app requiere un dev build o build nativo; ya era así con `expo-dev-client`.
- El código de los drivers no se mezcla entre plataformas: `nodeSqliteDriver.ts` no debe importarse desde la app y `expoSqliteDriver.ts` no debe importarse desde las pruebas.
- Si `node:sqlite` cambiara su API, solo hay que tocar `nodeSqliteDriver.ts`. La alternativa sería `better-sqlite3` como dependencia de desarrollo.

## Verificación

- `node -e "require('node:sqlite')"`: comprobado en Node local; CI usa 22.22 (`.nvmrc`).
- Pruebas de reinicio, migración exitosa y falla transaccional sobre `SqliteLocalStore` y `node:sqlite` en un archivo real. La evidencia queda en `reports/week-08/migration-tests.json`, con comando, resultado observado y SHA.
- Por el cambio de dependencia (`SECURITY.md`): `npm run typecheck`, `npm run lint`, `npm test`, `npm run audit:ci` y `npm run native:generate`.
