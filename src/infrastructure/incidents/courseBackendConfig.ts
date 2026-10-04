import { createCourseIncidentClient } from '../../api/courseIncidentClient';
import { createCloudIncidentGateway } from './cloudIncidentGateway';

// Fixtures publicos del backend didactico (docs/CAMPUSOPS_API.md): no son secretos ni
// autenticacion real. En emulador Android usar EXPO_PUBLIC_COURSE_BACKEND_URL=http://10.0.2.2:4310
const DEFAULT_URL = 'http://127.0.0.1:4310';
const FIXTURE_ACTOR = 'reporter-1';
const FIXTURE_CREDENTIAL = 'course-valid-token';

export function createCourseIncidentGateway(
  onTelemetry?: (event: unknown) => void,
) {
  const client = createCourseIncidentClient({
    baseUrl: process.env.EXPO_PUBLIC_COURSE_BACKEND_URL || DEFAULT_URL,
    actorId: process.env.EXPO_PUBLIC_COURSE_ACTOR || FIXTURE_ACTOR,
    accessToken: FIXTURE_CREDENTIAL,
    timeoutMs: 2000,
    ...(onTelemetry ? { onTelemetry } : {}),
  });
  return createCloudIncidentGateway(client);
}

/** Clave estable por intento: no depende de datos del usuario ni de la red. */
export function createOperationKey(): string {
  return `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
