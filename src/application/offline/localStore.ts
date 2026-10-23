import type { PendingOperation, StoredIncident } from '../../domain/offline/types';

/**
 * Puerto de persistencia local durable (incidencias + cola offline).
 * La capa de aplicacion depende solo de esta interfaz; los adaptadores
 * (expo-sqlite, archivo JSON para pruebas) viven en infrastructure.
 */

/** Operaciones disponibles dentro de una transaccion. */
export interface LocalStoreTx {
  getSchemaVersion(): Promise<number>;
  setSchemaVersion(version: number): Promise<void>;

  incidents: Readonly<{
    list(): Promise<readonly StoredIncident[]>;
    get(id: string): Promise<StoredIncident | null>;
    upsert(incident: StoredIncident): Promise<void>;
    remove(id: string): Promise<void>;
  }>;

  queue: Readonly<{
    /** Devuelve los registros en orden de insercion (FIFO). */
    list(): Promise<readonly PendingOperation[]>;
    get(operationId: string): Promise<PendingOperation | null>;
    /** Falla con DuplicateOperationError si operationId ya existe. */
    enqueue(operation: PendingOperation): Promise<void>;
    update(operation: PendingOperation): Promise<void>;
    remove(operationId: string): Promise<void>;
  }>;
}

export interface LocalStore extends LocalStoreTx {
  /** Abre/recupera el almacenamiento (incluye limpieza de escrituras a medias). */
  open(): Promise<void>;
  close(): Promise<void>;
  /**
   * Ejecuta fn de forma atomica: si fn lanza, no se persiste ningun cambio
   * y el error se propaga al llamador.
   */
  transaction<T>(fn: (tx: LocalStoreTx) => Promise<T>): Promise<T>;
}

export class DuplicateOperationError extends Error {
  constructor(public readonly operationId: string) {
    super(`operationId duplicado: ${operationId}`);
    this.name = 'DuplicateOperationError';
  }
}

export class StoreNotOpenError extends Error {
  constructor() {
    super('LocalStore no esta abierto');
    this.name = 'StoreNotOpenError';
  }
}
