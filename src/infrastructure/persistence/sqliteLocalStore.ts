import {
  DuplicateOperationError,
  StoreNotOpenError,
  type LocalStore,
  type LocalStoreTx,
} from '../../application/offline/localStore';
import type { PendingOperation, PendingOperationStatus, StoredIncident } from '../../domain/offline/types';
import type { SqlDriver } from './sqlDriver';

/**
 * LocalStore sobre SQLite. Asume el esquema actual (ver migrations/):
 *   incidents(id PK, version, data JSON)
 *   pending_operations(seq PK autoincrement, operation_id UNIQUE, incident_id,
 *     base_version, author_id, notes, photo_refs JSON, created_at, status)
 * La version de esquema se guarda en PRAGMA user_version (transaccional).
 */

type IncidentRow = { id: string; version: number; data: string };
type OperationRow = {
  operation_id: string;
  incident_id: string;
  base_version: number;
  author_id: string;
  notes: string;
  photo_refs: string;
  created_at: string;
  status: PendingOperationStatus;
};

const OP_COLUMNS =
  'operation_id, incident_id, base_version, author_id, notes, photo_refs, created_at, status';

const toIncident = (row: IncidentRow): StoredIncident => ({
  ...(JSON.parse(row.data) as Omit<StoredIncident, 'version'>),
  id: row.id,
  version: row.version,
});

const toOperation = (row: OperationRow): PendingOperation => ({
  operationId: row.operation_id,
  incidentId: row.incident_id,
  baseVersion: row.base_version,
  authorId: row.author_id,
  notes: row.notes,
  photoRefs: JSON.parse(row.photo_refs) as string[],
  createdAt: row.created_at,
  status: row.status,
});

const operationParams = (op: PendingOperation) =>
  [
    op.operationId,
    op.incidentId,
    op.baseVersion,
    op.authorId,
    op.notes,
    JSON.stringify(op.photoRefs),
    op.createdAt,
    op.status,
  ] as const;

export function createSqlTx(db: SqlDriver): LocalStoreTx {
  const first = async <T>(sql: string, params: (string | number)[] = []) =>
    (await db.all<T>(sql, params))[0] ?? null;

  return {
    async getSchemaVersion() {
      const row = await first<{ user_version: number }>('PRAGMA user_version');
      return row?.user_version ?? 0;
    },
    async setSchemaVersion(version) {
      if (!Number.isInteger(version) || version < 0) throw new Error(`version invalida: ${version}`);
      await db.exec(`PRAGMA user_version = ${version}`);
    },
    incidents: {
      async list() {
        return (await db.all<IncidentRow>('SELECT id, version, data FROM incidents ORDER BY id')).map(toIncident);
      },
      async get(id) {
        const row = await first<IncidentRow>('SELECT id, version, data FROM incidents WHERE id = ?', [id]);
        return row ? toIncident(row) : null;
      },
      async upsert(incident) {
        const { version, ...rest } = incident;
        await db.run(
          `INSERT INTO incidents (id, version, data) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          [incident.id, version, JSON.stringify(rest)],
        );
      },
      async remove(id) {
        await db.run('DELETE FROM incidents WHERE id = ?', [id]);
      },
    },
    queue: {
      async list() {
        return (await db.all<OperationRow>(`SELECT ${OP_COLUMNS} FROM pending_operations ORDER BY seq`)).map(
          toOperation,
        );
      },
      async get(operationId) {
        const row = await first<OperationRow>(
          `SELECT ${OP_COLUMNS} FROM pending_operations WHERE operation_id = ?`,
          [operationId],
        );
        return row ? toOperation(row) : null;
      },
      async enqueue(op) {
        const exists = await first('SELECT 1 FROM pending_operations WHERE operation_id = ?', [op.operationId]);
        if (exists) throw new DuplicateOperationError(op.operationId);
        await db.run(
          `INSERT INTO pending_operations (${OP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [...operationParams(op)],
        );
      },
      async update(op) {
        const exists = await first('SELECT 1 FROM pending_operations WHERE operation_id = ?', [op.operationId]);
        if (!exists) throw new Error(`operationId no encontrado: ${op.operationId}`);
        const [id, ...rest] = operationParams(op);
        await db.run(
          `UPDATE pending_operations SET incident_id = ?, base_version = ?, author_id = ?, notes = ?,
             photo_refs = ?, created_at = ?, status = ? WHERE operation_id = ?`,
          [...rest, id],
        );
      },
      async remove(operationId) {
        await db.run('DELETE FROM pending_operations WHERE operation_id = ?', [operationId]);
      },
    },
  };
}

export class SqliteLocalStore implements LocalStore {
  private db: SqlDriver | null = null;
  private tx: LocalStoreTx | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly openDriver: () => Promise<SqlDriver>) {}

  async open(): Promise<void> {
    this.db = await this.openDriver();
    this.tx = createSqlTx(this.db);
  }

  async close(): Promise<void> {
    await this.chain.catch(() => undefined);
    await this.db?.close();
    this.db = null;
    this.tx = null;
  }

  /** Atomica: BEGIN IMMEDIATE ... COMMIT; ante cualquier error, ROLLBACK y relanza. */
  transaction<T>(fn: (tx: LocalStoreTx) => Promise<T>): Promise<T> {
    return this.sqlTransaction((_, tx) => fn(tx));
  }

  /** Igual que transaction, pero con acceso al driver SQL (uso: migraciones/DDL). */
  sqlTransaction<T>(fn: (db: SqlDriver, tx: LocalStoreTx) => Promise<T>): Promise<T> {
    return this.serial(async (db, tx) => {
      await db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db, tx);
        await db.exec('COMMIT');
        return result;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  getSchemaVersion(): Promise<number> {
    return this.serial((_, tx) => tx.getSchemaVersion());
  }
  setSchemaVersion(version: number): Promise<void> {
    return this.transaction((tx) => tx.setSchemaVersion(version));
  }

  readonly incidents: LocalStoreTx['incidents'] = {
    list: () => this.serial((_, tx) => tx.incidents.list()),
    get: (id) => this.serial((_, tx) => tx.incidents.get(id)),
    upsert: (incident) => this.transaction((tx) => tx.incidents.upsert(incident)),
    remove: (id) => this.transaction((tx) => tx.incidents.remove(id)),
  };

  readonly queue: LocalStoreTx['queue'] = {
    list: () => this.serial((_, tx) => tx.queue.list()),
    get: (operationId) => this.serial((_, tx) => tx.queue.get(operationId)),
    enqueue: (op) => this.transaction((tx) => tx.queue.enqueue(op)),
    update: (op) => this.transaction((tx) => tx.queue.update(op)),
    remove: (operationId) => this.transaction((tx) => tx.queue.remove(operationId)),
  };

  /** Una sola conexion: serializa todo acceso para no mezclar sentencias con una transaccion abierta. */
  private serial<T>(fn: (db: SqlDriver, tx: LocalStoreTx) => Promise<T>): Promise<T> {
    const run = () => {
      if (!this.db || !this.tx) throw new StoreNotOpenError();
      return fn(this.db, this.tx);
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
