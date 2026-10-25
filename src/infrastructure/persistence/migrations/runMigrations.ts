import type { SqliteLocalStore } from '../sqliteLocalStore';
import { MIGRATIONS, type Migration } from './migrations';

export type MigrationResult = Readonly<{
  from: number;
  to: number;
  applied: readonly string[];
}>;

export type MigrationOptions = Readonly<{
  migrations?: readonly Migration[];
  /** Objetivo; por defecto la ultima migracion. Permite crear fixtures v1 en pruebas. */
  targetVersion?: number;
  /**
   * Hook de pruebas: se invoca tras aplicar cada migracion, antes del COMMIT.
   * Si lanza, se hace ROLLBACK completo. No se usa en codigo de produccion.
   */
  afterStep?: (version: number) => void | Promise<void>;
}>;

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number,
    public readonly failedVersion: number | null,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

function validateOrder(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError(`migraciones fuera de orden: esperado v${i + 1}, recibido v${m.version}`, 0, null);
    }
  });
}

/**
 * Aplica todas las migraciones pendientes en UNA transaccion:
 * o quedan todas aplicadas (y user_version actualizado), o ninguna.
 */
export async function runMigrations(
  store: SqliteLocalStore,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const migrations = options.migrations ?? MIGRATIONS;
  validateOrder(migrations);
  const target = options.targetVersion ?? migrations.length;

  return store.sqlTransaction(async (db, tx) => {
    const from = await tx.getSchemaVersion();
    if (from > migrations.length) {
      throw new MigrationError(
        `esquema v${from} es mas nuevo que la app (v${migrations.length}); no se degrada`,
        from,
        null,
      );
    }
    const pending = migrations.filter((m) => m.version > from && m.version <= target);
    let current: number | null = null;
    try {
      for (const migration of pending) {
        current = migration.version;
        await migration.up(db);
        await tx.setSchemaVersion(migration.version);
        await options.afterStep?.(migration.version);
      }
    } catch (error) {
      throw new MigrationError(
        `fallo migracion v${current} desde v${from}: ${String(error)}`,
        from,
        current,
        error,
      );
    }
    return { from, to: Math.max(from, target), applied: pending.map((m) => `v${m.version}-${m.name}`) };
  });
}
