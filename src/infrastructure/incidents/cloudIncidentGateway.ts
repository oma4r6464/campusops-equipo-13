import {
  IncidentClientError,
  type createCourseIncidentClient,
} from '../../api/courseIncidentClient';
import type {
  IncidentCreateResult,
  IncidentFailure,
  IncidentGateway,
} from '../../application/incidents/incidentGateway';
import type { Incident } from '../../domain/incidents/types';
import { mapRemoteIncident } from './remoteIncidentMapper';

type CloudClient = ReturnType<typeof createCourseIncidentClient>;

/** Traduce cualquier error a un fallo publico sin mensaje, payload ni detalles del upstream. */
export function toFailure(error: unknown): IncidentFailure {
  if (!(error instanceof IncidentClientError)) return { kind: 'unavailable' };
  switch (error.kind) {
    case 'contract':
      return { kind: 'malformed' };
    case 'timeout':
      return { kind: 'timeout' };
    case 'server':
      return { kind: 'server_error' };
    default:
      if (error.status === null) return { kind: 'unavailable' };
      return error.status === 404 ? { kind: 'not_found' } : { kind: 'rejected', status: error.status };
  }
}

export function createCloudIncidentGateway(client: CloudClient): IncidentGateway {
  return {
    async list() {
      try {
        const resources = await client.list();
        const incidents: Incident[] = [];
        let omittedWithoutPayload = 0;
        for (const resource of resources) {
          const mapped = mapRemoteIncident(resource);
          if (mapped.kind === 'malformed') return { kind: 'malformed' };
          if (mapped.kind === 'null_payload') omittedWithoutPayload += 1;
          else incidents.push(mapped.incident);
        }
        return { kind: 'success', incidents, omittedWithoutPayload };
      } catch (error) {
        return toFailure(error);
      }
    },

    async get(id) {
      try {
        const resource = await client.findById(id);
        if (resource === null) return { kind: 'not_found' };
        const mapped = mapRemoteIncident(resource);
        if (mapped.kind === 'incident') return { kind: 'success', incident: mapped.incident };
        return mapped;
      } catch (error) {
        return toFailure(error);
      }
    },

    async create(draft, operationKey): Promise<IncidentCreateResult> {
      try {
        const mapped = mapRemoteIncident(await client.create(draft, operationKey));
        // Una creacion exitosa siempre debe traer la incidencia completa.
        return mapped.kind === 'incident'
          ? { kind: 'success', incident: mapped.incident }
          : { kind: 'malformed' };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}
