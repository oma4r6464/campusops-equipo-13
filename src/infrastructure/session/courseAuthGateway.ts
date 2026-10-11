import type { AuthGateway, LoginResult } from '../../application/session/session';
import type { UserProfile } from '../../domain/incidents/types';

export type CourseCredentials = Readonly<{ actorId: string; accessToken: string }>;

/** El token vive solo aqui (infraestructura); nunca llega a la aplicacion ni a los logs. */
export type CourseAuthGateway = AuthGateway & Readonly<{ credentials(): CourseCredentials | null }>;

const PROFILES: readonly string[] = ['reporter', 'technician', 'coordinator'];

function isProfile(value: unknown): value is UserProfile {
  return typeof value === 'string' && PROFILES.includes(value);
}

export function createCourseAuthGateway(
  options: Readonly<{ baseUrl: string; fetchImpl?: typeof fetch; timeoutMs?: number }>,
): CourseAuthGateway {
  const fetchImpl = options.fetchImpl ?? fetch;
  let current: CourseCredentials | null = null;

  return {
    credentials: () => current,
    logout() {
      current = null;
    },
    async login(actorId): Promise<LoginResult> {
      current = null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2000);
      try {
        const response = await fetchImpl(`${options.baseUrl}/v1/session/login`, {
          method: 'POST',
          signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId }),
        });
        if (response.status === 401) return { kind: 'invalid_actor' };
        if (!response.ok) return { kind: 'unavailable' };

        const body: unknown = await response.json();
        if (body === null || typeof body !== 'object') return { kind: 'unavailable' };
        const { actorId: id, role, accessToken } = body as Record<string, unknown>;
        if (
          typeof id !== 'string' ||
          id.length === 0 ||
          !isProfile(role) ||
          typeof accessToken !== 'string' ||
          accessToken.length === 0
        ) {
          return { kind: 'unavailable' };
        }
        current = { actorId: id, accessToken };
        return { kind: 'success', actor: { actorId: id, profile: role } };
      } catch {
        return { kind: 'unavailable' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}