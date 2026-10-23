import type { PendingOperation, StoredIncident } from '../../domain/offline/types';
import { validatePendingOperation, validateQueue } from '../../domain/offline/validation';
import type { LocalStore } from './localStore';

export type EnqueueInput = Readonly<{
  incidentId: string;
  authorId: string;
  notes: string;
  /** Referencias a copias en almacenamiento privado de la app (no URIs temporales). */
  photoRefs: readonly string[];
}>;

export type OfflineQueueDeps = Readonly<{
  store: LocalStore;
  newOperationId: () => string;
  now: () => Date;
}>;

export class InvalidOperationError extends Error {
  constructor(public readonly errors: readonly string[]) {
    super(`registro pendiente invalido: ${errors.join('; ')}`);
    this.name = 'InvalidOperationError';
  }
}

export class UnknownIncidentError extends Error {
  constructor(public readonly incidentId: string) {
    super(`incidencia no encontrada localmente: ${incidentId}`);
    this.name = 'UnknownIncidentError';
  }
}

export type OfflineState = Readonly<{
  incidents: readonly StoredIncident[];
  queue: readonly PendingOperation[];
}>;

/** Casos de uso de la cola offline sobre LocalStore. */
export function createOfflineQueue({ store, newOperationId, now }: OfflineQueueDeps) {
  return {
    /**
     * Encola un cambio. baseVersion se toma de la incidencia guardada localmente
     * en la misma transaccion, para que identidad, version y autor queden juntos.
     */
    enqueue(input: EnqueueInput): Promise<PendingOperation> {
      return store.transaction(async (tx) => {
        const incident = await tx.incidents.get(input.incidentId);
        if (!incident) throw new UnknownIncidentError(input.incidentId);
        const operation: PendingOperation = {
          operationId: newOperationId(),
          incidentId: input.incidentId,
          baseVersion: incident.version,
          authorId: input.authorId,
          notes: input.notes,
          photoRefs: [...input.photoRefs],
          createdAt: now().toISOString(),
          status: 'pending',
        };
        const result = validatePendingOperation(operation);
        if (!result.ok) throw new InvalidOperationError(result.errors);
        await tx.queue.enqueue(operation);
        return operation;
      });
    },

    listPending(): Promise<readonly PendingOperation[]> {
      return store.queue.list();
    },

    markSyncing(operationId: string): Promise<void> {
      return setStatus(store, operationId, 'syncing');
    },

    markFailed(operationId: string): Promise<void> {
      return setStatus(store, operationId, 'failed');
    },

    /** Sincronizacion confirmada: el registro se elimina (expiracion, ADR-002). */
    complete(operationId: string): Promise<void> {
      return store.queue.remove(operationId);
    },

    saveIncidents(incidents: readonly StoredIncident[]): Promise<void> {
      return store.transaction(async (tx) => {
        for (const incident of incidents) await tx.incidents.upsert(incident);
      });
    },
  };
}

export type OfflineQueue = ReturnType<typeof createOfflineQueue>;

async function setStatus(store: LocalStore, operationId: string, status: PendingOperation['status']) {
  await store.transaction(async (tx) => {
    const op = await tx.queue.get(operationId);
    if (!op) throw new Error(`operationId no encontrado: ${operationId}`);
    await tx.queue.update({ ...op, status });
  });
}

/**
 * Hidrata el estado tras un reinicio. Una operacion en `syncing` al momento de
 * la caida vuelve a `pending` (no se sabe si llego al servidor; operationId
 * permite reintento idempotente). Valida la cola leida antes de devolverla.
 */
export async function loadOfflineState(store: LocalStore): Promise<OfflineState> {
  return store.transaction(async (tx) => {
    for (const op of await tx.queue.list()) {
      if (op.status === 'syncing') await tx.queue.update({ ...op, status: 'pending' });
    }
    const queue = await tx.queue.list();
    const check = validateQueue(queue);
    if (!check.ok) throw new InvalidOperationError(check.errors);
    return { incidents: await tx.incidents.list(), queue };
  });
}
