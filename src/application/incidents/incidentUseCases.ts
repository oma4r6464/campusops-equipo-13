import {
  INCIDENT_CATEGORIES,
  type Incident,
  type NewIncidentDraft,
} from '../../domain/incidents/types';
import type {
  IncidentCreateResult,
  IncidentDetailResult,
  IncidentFailure,
  IncidentGateway,
} from './incidentGateway';

export type IncidentSummary = Readonly<{
  id: string;
  title: string;
  status: Incident['status'];
  priority: Incident['priority'];
  locationLabel: string;
}>;

export type IncidentDetail = Incident;

export type IncidentSummaryListResult =
  | Readonly<{ kind: 'success'; incidents: readonly IncidentSummary[]; omittedWithoutPayload: number }>
  | IncidentFailure;

export type IncidentUseCases = Readonly<{
  listIncidents(): Promise<IncidentSummaryListResult>;
  getIncidentDetail(id: string): Promise<IncidentDetailResult>;
  createIncident(draft: NewIncidentDraft, operationKey: string): Promise<IncidentCreateResult>;
}>;

function toSummary({ id, title, status, priority, locationLabel }: Incident): IncidentSummary {
  return { id, title, status, priority, locationLabel };
}

/** Valida el borrador antes de salir de la app: no se envian peticiones que ya sabemos invalidas. */
function invalidFields(draft: NewIncidentDraft): readonly (keyof NewIncidentDraft)[] {
  const fields: (keyof NewIncidentDraft)[] = [];
  if (!INCIDENT_CATEGORIES.includes(draft.category)) fields.push('category');
  if (draft.description.trim().length === 0) fields.push('description');
  if (draft.location.trim().length === 0) fields.push('location');
  return fields;
}

export function createIncidentUseCases(gateway: IncidentGateway): IncidentUseCases {
  return {
    async listIncidents() {
      const result = await gateway.list();
      if (result.kind !== 'success') return result;
      return {
        kind: 'success',
        incidents: result.incidents.map(toSummary),
        omittedWithoutPayload: result.omittedWithoutPayload,
      };
    },
    getIncidentDetail(id) {
      return gateway.get(id);
    },
    async createIncident(draft, operationKey) {
      const fields = invalidFields(draft);
      if (fields.length > 0) return { kind: 'invalid', fields };
      return gateway.create(
        {
          category: draft.category,
          description: draft.description.trim(),
          location: draft.location.trim(),
        },
        operationKey,
      );
    },
  };
}
