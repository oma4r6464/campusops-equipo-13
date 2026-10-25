import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue } from './sqlDriver';

/**
 * Driver sobre el SQLite incluido en Node (>= 22.13, ver .nvmrc).
 * Uso exclusivo en pruebas/herramientas: no importar desde la app RN.
 */
export function createNodeSqliteDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async close() {
      db.close();
    },
  };
}
