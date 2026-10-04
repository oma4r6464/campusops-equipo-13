import { createIncidentUseCases, type IncidentUseCases } from './incidents/incidentUseCases';
import type { IncidentGateway } from './incidents/incidentGateway';
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
  }>;

export function createCampusOpsServices(dependencies: Readonly<{
  incidentGateway: IncidentGateway;
  backendHealthReader: BackendHealthReader;
  newOperationKey: () => string;
}>): CampusOpsServices {
  return {
    ...createIncidentUseCases(dependencies.incidentGateway),
    getBackendStatus: createBackendStatusUseCase(dependencies.backendHealthReader),
    newOperationKey: dependencies.newOperationKey,
  };
}
