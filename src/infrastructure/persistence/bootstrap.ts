import { loadOfflineState, type OfflineState } from '../../application/offline/offlineQueue';
import { runMigrations, type MigrationOptions, type MigrationResult } from './migrations/runMigrations';
import type { SqlDriver } from './sqlDriver';
import { SqliteLocalStore } from './sqliteLocalStore';

export type BootstrapResult = Readonly<{
  store: SqliteLocalStore;
  migration: MigrationResult;
  state: OfflineState;
}>;

/**
 * Arranque de persistencia: abrir -> migrar (atomico) -> hidratar.
 * Si la migracion falla, se cierra la conexion y se relanza el error;
 * la base queda en su version anterior, intacta.
 * Siempre migra a la ultima version: hidratar un esquema a medio migrar no es valido.
 */
export async function bootstrapPersistence(
  openDriver: () => Promise<SqlDriver>,
  migrationOptions: Omit<MigrationOptions, 'targetVersion'> = {},
): Promise<BootstrapResult> {
  const store = new SqliteLocalStore(openDriver);
  await store.open();
  try {
    const migration = await runMigrations(store, migrationOptions);
    const state = await loadOfflineState(store);
    return { store, migration, state };
  } catch (error) {
    await store.close();
    throw error;
  }
}
