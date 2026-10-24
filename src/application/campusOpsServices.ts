import { createIncidentUseCases, type IncidentUseCases } from './incidents/incidentUseCases';
import type { IncidentGateway } from './incidents/incidentGateway';
import {
  createSyncService,
  type SyncPorts,
  type SyncReport,
} from './sync/syncPendingOperations';
import {
  createBackendStatusUseCase,
  type BackendHealthReader,
  type BackendStatus,
} from './system/backendStatusUseCase';

export type CampusOpsServices = IncidentUseCases &
  Readonly<{
    getBackendStatus(): Promise<BackendStatus>;
    /** Clave estable por intento de creacion: reutilizarla al reintentar evita duplicados. */
    newOperationKey(): string;
    /** Sincroniza la cola offline. Sin puertos de sincronizacion no hay nada que enviar. */
    syncPendingOperations(): Promise<SyncReport>;
  }>;

const EMPTY_SYNC_REPORT: SyncReport = { outcomes: [], removed: [], pending: [] };

export function createCampusOpsServices(dependencies: Readonly<{
  incidentGateway: IncidentGateway;
  backendHealthReader: BackendHealthReader;
  newOperationKey: () => string;
  sync?: SyncPorts;
}>): CampusOpsServices {
  const syncService = dependencies.sync === undefined ? null : createSyncService(dependencies.sync);
  return {
    ...createIncidentUseCases(dependencies.incidentGateway),
    getBackendStatus: createBackendStatusUseCase(dependencies.backendHealthReader),
    newOperationKey: dependencies.newOperationKey,
    syncPendingOperations: () =>
      syncService === null ? Promise.resolve(EMPTY_SYNC_REPORT) : syncService.syncPendingOperations(),
  };
}