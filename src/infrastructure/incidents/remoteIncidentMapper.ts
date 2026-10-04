import type { RemoteIncident } from '../../api/courseIncidentClient';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
  type Incident,
} from '../../domain/incidents/types';

export type MappedRemoteIncident =
  | Readonly<{ kind: 'incident'; incident: Incident }>
  | Readonly<{ kind: 'null_payload'; id: string; version: number }>
  | Readonly<{ kind: 'malformed' }>;

const TITLE_MAX = 60;

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * El sobre ya paso `parseRemoteEnvelope`; aqui se valida el DTO de dominio ANTES de mapearlo.
 * Nada se inventa: payload null no produce incidencia y un payload incompleto es 'malformed'.
 */
export function mapRemoteIncident(resource: RemoteIncident): MappedRemoteIncident {
  const { payload } = resource;
  if (payload === null) return { kind: 'null_payload', id: resource.id, version: resource.version };

  const { category, description, location, priority, assignedTechnicianId } = payload;
  const assigned = assignedTechnicianId === undefined ? null : assignedTechnicianId;

  if (
    !oneOf(INCIDENT_STATUSES, resource.status) ||
    !oneOf(INCIDENT_CATEGORIES, category) ||
    !nonEmpty(description) ||
    !nonEmpty(location) ||
    !oneOf(INCIDENT_PRIORITIES, priority) ||
    (assigned !== null && !nonEmpty(assigned))
  ) {
    return { kind: 'malformed' };
  }

  const text = description.trim();
  return {
    kind: 'incident',
    incident: {
      id: resource.id,
      // El backend no publica titulo: se deriva del texto de la descripcion, no de datos externos.
      title: text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text,
      description: text,
      category,
      status: resource.status,
      priority,
      locationLabel: location.trim(),
      // El backend solo permite crear a reporteros y el DTO no trae perfil.
      reporterProfile: 'reporter',
      assignedTechnicianId: assigned,
      updatedAt: null,
    },
  };
}
