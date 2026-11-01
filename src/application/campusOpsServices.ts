import { createIncidentUseCases, type IncidentUseCases } from './incidents/incidentUseCases';
import type { IncidentGateway } from './incidents/incidentGateway';
import type { GeocodingLookupResult, IncidentLocation } from '../campusops/contracts';
import { selectIncidentLocation } from '../campusops/locationValidation';
import {
  createBackendStatusUseCase,
  type BackendHealthReader,
  type BackendStatus,
} from './system/backendStatusUseCase';

export type CampusOpsServices = IncidentUseCases &
  Readonly<{
    getBackendStatus(): Promise<BackendStatus>;
    resolveIncidentLocation(manualLabel: string): Promise<IncidentLocation>;
    /** Clave estable por intento de creacion: reutilizarla al reintentar evita duplicados. */
    newOperationKey(): string;
  }>;

export function createCampusOpsServices(dependencies: Readonly<{
  incidentGateway: IncidentGateway;
  backendHealthReader: BackendHealthReader;
  newOperationKey: () => string;
  locationProvider?: (query: string) => Promise<GeocodingLookupResult>;
}>): CampusOpsServices {
  return {
    ...createIncidentUseCases(dependencies.incidentGateway),
    getBackendStatus: createBackendStatusUseCase(dependencies.backendHealthReader),
    async resolveIncidentLocation(manualLabel) {
      const result = dependencies.locationProvider
        ? await dependencies.locationProvider(manualLabel)
        : { kind: 'unavailable' as const, reason: 'network' as const };
      return selectIncidentLocation(
        result.kind === 'available' ? result.value : { error: result.reason },
        manualLabel,
      );
    },
    newOperationKey: dependencies.newOperationKey,
  };
}
