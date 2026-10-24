import { deduplicateOperations } from '../../domain/sync/deduplicateOperations';
import { resolveSync, type SyncFields, type SyncSnapshot } from '../../domain/sync/resolveSync';

/**
 * Forma minima de una operacion pendiente. El registro de la cola offline
 * (operationId, incidentId, baseVersion, ...) la satisface estructuralmente.
 */
export type SyncableOperation = Readonly<{
  operationId: string;
  incidentId: string;
  baseVersion: number;
}>;

export interface SyncQueuePort<TOperation extends SyncableOperation> {
  list(): Promise<readonly TOperation[]>;
  /** Retira la operacion de la cola. Solo se invoca tras confirmacion remota. */
  complete(operationId: string): Promise<void>;
}

export type LocalRecords = Readonly<{ base: SyncSnapshot; local: SyncSnapshot }>;

export interface SyncLocalPort<TOperation extends SyncableOperation> {
  /**
   * base: copia en operation.baseVersion.
   * local: estado local con el cambio de la operacion aplicado.
   */
  load(operation: TOperation): Promise<LocalRecords>;
}

export type PushRequest = Readonly<{
  operationId: string;
  incidentId: string;
  /** Version remota sobre la que se calculo la combinacion. */
  expectedVersion: number;
  fields: SyncFields;
}>;

export type PushResult =
  | Readonly<{ kind: 'confirmed' }>
  | Readonly<{ kind: 'not_confirmed' }>;

export interface SyncRemotePort {
  fetch(incidentId: string): Promise<SyncSnapshot>;
  /** Idempotente por operationId: reenviar la misma operacion no repite el efecto. */
  push(request: PushRequest): Promise<PushResult>;
}

export type SyncPorts<TOperation extends SyncableOperation = SyncableOperation> = Readonly<{
  queue: SyncQueuePort<TOperation>;
  local: SyncLocalPort<TOperation>;
  remote: SyncRemotePort;
}>;

export type SyncOutcome =
  | Readonly<{ operationId: string; kind: 'synced' }>
  | Readonly<{ operationId: string; kind: 'conflict'; fields: readonly string[] }>
  | Readonly<{ operationId: string; kind: 'failed'; reason: 'not_confirmed' | 'error' }>;

export type SyncReport = Readonly<{
  outcomes: readonly SyncOutcome[];
  /** operationId retirados de la cola (solo confirmados). */
  removed: readonly string[];
  /** operationId que siguen en la cola (conflicto o no confirmados). */
  pending: readonly string[];
}>;

export function createSyncService<TOperation extends SyncableOperation>(
  ports: SyncPorts<TOperation>,
) {
  async function syncOne(operation: TOperation): Promise<SyncOutcome> {
    const { operationId, incidentId } = operation;
    try {
      const { base, local } = await ports.local.load(operation);
      const remote = await ports.remote.fetch(incidentId);
      const resolution = resolveSync(base, local, remote);

      // Conflicto: se informa y la operacion original queda intacta en la cola.
      if (resolution.kind === 'conflict') {
        return { operationId, kind: 'conflict', fields: resolution.fields };
      }

      const result = await ports.remote.push({
        operationId,
        incidentId,
        expectedVersion: remote.version,
        fields: resolution.fields,
      });
      if (result.kind !== 'confirmed') {
        return { operationId, kind: 'failed', reason: 'not_confirmed' };
      }

      // Solo una operacion confirmada sale de la cola. Si esta limpieza falla,
      // la operacion se reenvia luego con el mismo operationId (idempotente).
      await ports.queue.complete(operationId);
      return { operationId, kind: 'synced' };
    } catch {
      return { operationId, kind: 'failed', reason: 'error' };
    }
  }

  return {
    async syncPendingOperations(): Promise<SyncReport> {
      const operations = deduplicateOperations(await ports.queue.list());
      const outcomes: SyncOutcome[] = [];
      // Secuencial a proposito: se respeta el orden FIFO de la cola.
      for (const operation of operations) {
        outcomes.push(await syncOne(operation));
      }
      return {
        outcomes,
        removed: outcomes.filter((o) => o.kind === 'synced').map((o) => o.operationId),
        pending: outcomes.filter((o) => o.kind !== 'synced').map((o) => o.operationId),
      };
    },
  };
}