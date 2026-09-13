import { createIncidentUseCases, type IncidentUseCases } from './incidents/incidentUseCases';
import {
  createBackendStatusUseCase,
  type BackendHealthReader,
  type BackendStatus,
} from './system/backendStatusUseCase';
import type { IncidentRepository } from '../domain/incidents/types';

export type CampusOpsServices = IncidentUseCases &
  Readonly<{
    getBackendStatus(): Promise<BackendStatus>;
  }>;

export function createCampusOpsServices(dependencies: Readonly<{
  incidentRepository: IncidentRepository;
  backendHealthReader: BackendHealthReader;
}>): CampusOpsServices {
  return {
    ...createIncidentUseCases(dependencies.incidentRepository),
    getBackendStatus: createBackendStatusUseCase(dependencies.backendHealthReader),
  };
}
