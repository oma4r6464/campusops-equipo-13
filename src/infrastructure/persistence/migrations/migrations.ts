import type { SqlDriver } from '../sqlDriver';

export type Migration = Readonly<{
  version: number;
  name: string;
  up(db: SqlDriver): Promise<void>;
}>;

/**
 * v1: esquema inicial. La nota era un unico campo `note` y no habia fotos.
 */
const v1: Migration = {
  version: 1,
  name: 'initial-schema',
  async up(db) {
    await db.exec(`
      CREATE TABLE incidents (
        id      TEXT PRIMARY KEY NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 0),
        data    TEXT NOT NULL
      );
      CREATE TABLE pending_operations (
        seq          INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL UNIQUE,
        incident_id  TEXT NOT NULL,
        base_version INTEGER NOT NULL CHECK (base_version >= 0),
        author_id    TEXT NOT NULL,
        note         TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL,
        status       TEXT NOT NULL CHECK (status IN ('pending','syncing','failed'))
      );
    `);
  },
};

/**
 * v2: `note` -> `notes`, agrega `photo_refs` (JSON, default '[]') e indices.
 * Los datos existentes se conservan: RENAME COLUMN y ADD COLUMN no reescriben filas.
 */
const v2: Migration = {
  version: 2,
  name: 'notes-and-photo-refs',
  async up(db) {
    await db.exec(`
      ALTER TABLE pending_operations RENAME COLUMN note TO notes;
      ALTER TABLE pending_operations ADD COLUMN photo_refs TEXT NOT NULL DEFAULT '[]';
      CREATE INDEX idx_pending_operations_incident ON pending_operations (incident_id);
      CREATE INDEX idx_pending_operations_status ON pending_operations (status);
    `);
  },
};

/** Lista ordenada. Nunca editar una migracion publicada: agregar una nueva. */
export const MIGRATIONS: readonly Migration[] = [v1, v2];
export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;
