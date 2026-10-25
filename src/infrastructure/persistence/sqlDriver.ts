/**
 * Driver SQL minimo. Lo implementan expo-sqlite (app) y node:sqlite (pruebas),
 * de modo que el mismo SQL de esquema y migraciones se ejerce en ambos.
 * Las transacciones las gestiona SqliteLocalStore con BEGIN/COMMIT/ROLLBACK.
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  /** Ejecuta uno o varios statements sin parametros. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
