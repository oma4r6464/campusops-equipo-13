import type { IncidentGateway } from '../../application/incidents/incidentGateway';
import type { Incident, IncidentRepository } from '../../domain/incidents/types';
import { createInMemoryIncidentRepository } from './inMemoryIncidentRepository';

/** Modo local/offline determinista (semana 2): mismo puerto que el cliente cloud. */
export function createInMemoryIncidentGateway(
  repository: IncidentRepository = createInMemoryIncidentRepository(),
): IncidentGateway {
  const created: Incident[] = [];
  const operations = new Map<string, Incident>();

  return {
    async list() {
      const incidents = [...(await repository.list()), ...created];
      return { kind: 'success', incidents, omittedWithoutPayload: 0 };
    },
    async get(id) {
      const incident = created.find((item) => item.id === id) ?? (await repository.findById(id));
      return incident ? { kind: 'success', incident } : { kind: 'not_found' };
    },
    async create(draft, operationKey) {
      const previous = operations.get(operationKey);
      if (previous) return { kind: 'success', incident: previous };
      const incident: Incident = {
        id: `LOCAL-${String(created.length + 1).padStart(3, '0')}`,
        title: draft.description.slice(0, 60),
        description: draft.description,
        category: draft.category,
        status: 'open',
        priority: 'medium',
        locationLabel: draft.location,
        reporterProfile: 'reporter',
        assignedTechnicianId: null,
        updatedAt: null,
      };
      created.push(incident);
      operations.set(operationKey, incident);
      return { kind: 'success', incident };
    },
  };
}
