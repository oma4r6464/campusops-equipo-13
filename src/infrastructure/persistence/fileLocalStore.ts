import {
  DuplicateOperationError,
  StoreNotOpenError,
  type LocalStore,
  type LocalStoreTx,
} from '../../application/offline/localStore';
import type { PendingOperation, StoredIncident } from '../../domain/offline/types';
import type { FileSystem } from './fileSystem';

/** Forma serializada en disco. `schemaVersion` 0 = almacenamiento vacio/nuevo. */
export type StoreSnapshot = {
  schemaVersion: number;
  incidents: Record<string, StoredIncident>;
  queue: PendingOperation[];
};

export class CorruptStoreError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Archivo de almacenamiento corrupto: ${path} (${String(cause)})`);
    this.name = 'CorruptStoreError';
  }
}

const emptySnapshot = (): StoreSnapshot => ({ schemaVersion: 0, incidents: {}, queue: [] });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * LocalStore basado en un archivo JSON con escritura atomica:
 *   1. se escribe `<path>.tmp` (con fsync)
 *   2. se renombra `<path>.tmp` -> `<path>` (atomico)
 * Si el proceso cae entre 1 y 2, `<path>` conserva el ultimo estado confirmado
 * y `open()` descarta el `.tmp` huerfano.
 */
export class FileLocalStore implements LocalStore {
  private state: StoreSnapshot | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly fs: FileSystem,
    private readonly path: string,
  ) {}

  get tmpPath(): string {
    return `${this.path}.tmp`;
  }

  async open(): Promise<void> {
    // Recuperacion: una escritura sin renombrar nunca fue confirmada.
    await this.fs.remove(this.tmpPath);
    const raw = await this.fs.readText(this.path);
    if (raw === null) {
      this.state = emptySnapshot();
      return;
    }
    try {
      this.state = JSON.parse(raw) as StoreSnapshot;
    } catch (error) {
      // No se borra nada: se exige intervencion en lugar de perder datos.
      throw new CorruptStoreError(this.path, error);
    }
  }

  async close(): Promise<void> {
    await this.chain.catch(() => undefined);
    this.state = null;
  }

  /** Copia de solo lectura del estado confirmado (util para pruebas/diagnostico). */
  snapshot(): StoreSnapshot {
    return clone(this.requireState());
  }

  transaction<T>(fn: (tx: LocalStoreTx) => Promise<T>): Promise<T> {
    // Serializa transacciones para evitar escrituras intercaladas.
    const run = async (): Promise<T> => {
      const committed = this.requireState();
      const working = clone(committed);
      const result = await fn(this.createTx(working));
      await this.persist(working);
      this.state = working; // solo se publica tras confirmar en disco
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  // --- Atajos fuera de transaccion: cada uno es su propia transaccion ---

  getSchemaVersion(): Promise<number> {
    return Promise.resolve(this.requireState().schemaVersion);
  }
  setSchemaVersion(version: number): Promise<void> {
    return this.transaction((tx) => tx.setSchemaVersion(version));
  }

  readonly incidents: LocalStoreTx['incidents'] = {
    list: () => Promise.resolve(clone(Object.values(this.requireState().incidents))),
    get: (id) => Promise.resolve(clone(this.requireState().incidents[id] ?? null)),
    upsert: (incident) => this.transaction((tx) => tx.incidents.upsert(incident)),
    remove: (id) => this.transaction((tx) => tx.incidents.remove(id)),
  };

  readonly queue: LocalStoreTx['queue'] = {
    list: () => Promise.resolve(clone(this.requireState().queue)),
    get: (operationId) =>
      Promise.resolve(clone(this.requireState().queue.find((o) => o.operationId === operationId) ?? null)),
    enqueue: (op) => this.transaction((tx) => tx.queue.enqueue(op)),
    update: (op) => this.transaction((tx) => tx.queue.update(op)),
    remove: (operationId) => this.transaction((tx) => tx.queue.remove(operationId)),
  };

  // --- Internos ---

  private requireState(): StoreSnapshot {
    if (!this.state) throw new StoreNotOpenError();
    return this.state;
  }

  private async persist(snapshot: StoreSnapshot): Promise<void> {
    await this.fs.writeText(this.tmpPath, JSON.stringify(snapshot));
    await this.fs.rename(this.tmpPath, this.path);
  }

  private createTx(s: StoreSnapshot): LocalStoreTx {
    return {
      getSchemaVersion: async () => s.schemaVersion,
      setSchemaVersion: async (version) => {
        s.schemaVersion = version;
      },
      incidents: {
        list: async () => clone(Object.values(s.incidents)),
        get: async (id) => clone(s.incidents[id] ?? null),
        upsert: async (incident) => {
          s.incidents[incident.id] = clone(incident);
        },
        remove: async (id) => {
          delete s.incidents[id];
        },
      },
      queue: {
        list: async () => clone(s.queue),
        get: async (operationId) => clone(s.queue.find((o) => o.operationId === operationId) ?? null),
        enqueue: async (op) => {
          if (s.queue.some((o) => o.operationId === op.operationId)) {
            throw new DuplicateOperationError(op.operationId);
          }
          s.queue.push(clone(op));
        },
        update: async (op) => {
          const index = s.queue.findIndex((o) => o.operationId === op.operationId);
          if (index === -1) throw new Error(`operationId no encontrado: ${op.operationId}`);
          s.queue[index] = clone(op);
        },
        remove: async (operationId) => {
          s.queue = s.queue.filter((o) => o.operationId !== operationId);
        },
      },
    };
  }
}
