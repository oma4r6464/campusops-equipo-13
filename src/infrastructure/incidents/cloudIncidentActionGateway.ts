import {
  IncidentClientError,
  type createCourseIncidentClient,
} from '../../api/courseIncidentClient';
import type { IncidentActionGateway } from '../../application/incidents/incidentActionGateway';
import { toFailure } from './cloudIncidentGateway';
import { mapRemoteIncident } from './remoteIncidentMapper';

type CloudClient = ReturnType<typeof createCourseIncidentClient>;

export function createCloudIncidentActionGateway(client: CloudClient): IncidentActionGateway {
  // Reintentar con la misma clave debe enviar el mismo contenido: se recuerda la version base.
  const baseVersions = new Map<string, number>();

  return {
    async perform({ id, operation, diagnosis, operationKey }) {
      try {
        const current = await client.findById(id);
        if (current === null) return { kind: 'not_found' };

        const baseVersion = baseVersions.get(operationKey) ?? current.version;
        baseVersions.set(operationKey, baseVersion);

        const body =
          operation === 'resolve'
            ? { action: operation, baseVersion, diagnosis: diagnosis ?? '' }
            : { action: operation, baseVersion };

        const mapped = mapRemoteIncident(await client.perform(id, body, operationKey));
        return mapped.kind === 'incident'
          ? { kind: 'success', incident: mapped.incident }
          : { kind: 'malformed' };
      } catch (error) {
        if (error instanceof IncidentClientError && error.kind === 'network') {
          if (error.status === 401) return { kind: 'unauthenticated' };
          if (error.status === 403) return { kind: 'forbidden', reason: 'server_denied' };
          if (error.status === 409) return { kind: 'conflict' };
        }
        return toFailure(error);
      }
    },
  };
}