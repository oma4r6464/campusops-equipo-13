import type { Incident, IncidentRepository } from '../../domain/incidents/types';

export type IncidentSummary = Readonly<{
  id: string;
  title: string;
  status: Incident['status'];
  priority: Incident['priority'];
  locationLabel: string;
}>;

export type IncidentDetail = Incident;

export type IncidentUseCases = Readonly<{
  listIncidents(): Promise<readonly IncidentSummary[]>;
  getIncidentDetail(id: string): Promise<IncidentDetail | null>;
}>;

export function createIncidentUseCases(repository: IncidentRepository): IncidentUseCases {
  return {
    async listIncidents() {
      const incidents = await repository.list();
      return incidents.map(({ id, title, status, priority, locationLabel }) => ({
        id,
        title,
        status,
        priority,
        locationLabel,
      }));
    },
    getIncidentDetail(id) {
      return repository.findById(id);
    },
  };
}
