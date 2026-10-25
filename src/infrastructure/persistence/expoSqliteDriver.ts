import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './sqlDriver';

/** Driver de la app sobre expo-sqlite (Android de referencia). */
export async function createExpoSqliteDriver(databaseName: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  return {
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params: readonly SqlValue[] = []) {
      await db.runAsync(sql, [...params]);
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.getAllAsync<T>(sql, [...params]);
    },
    async close() {
      await db.closeAsync();
    },
  };
}
