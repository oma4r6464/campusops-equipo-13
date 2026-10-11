import { createCourseIncidentClient } from '../../api/courseIncidentClient';
import { createIncidentOperations } from '../../application/incidents/incidentOperations';
import { createSessionService } from '../../application/session/session';
import { createCloudIncidentActionGateway } from '../incidents/cloudIncidentActionGateway';
import { createCloudIncidentGateway } from '../incidents/cloudIncidentGateway';
import { createCourseAuthGateway } from './courseAuthGateway';

const DEFAULT_URL = 'http://127.0.0.1:4310';

export function createCourseSessionServices(onTelemetry?: (event: unknown) => void) {
  const baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL || DEFAULT_URL;
  const auth = createCourseAuthGateway({ baseUrl, timeoutMs: 2000 });
  const client = createCourseIncidentClient({
    baseUrl,
    credentials: auth.credentials,
    timeoutMs: 2000,
    ...(onTelemetry ? { onTelemetry } : {}),
  });
  const session = createSessionService(auth);
  const operations = createIncidentOperations({
    session,
    incidents: createCloudIncidentGateway(client),
    actions: createCloudIncidentActionGateway(client),
  });
  return { session, operations };
}