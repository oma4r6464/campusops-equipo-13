import type { Actor } from '../../domain/incidents/authorization';

export type LoginResult =
  | Readonly<{ kind: 'success'; actor: Actor }>
  | Readonly<{ kind: 'invalid_actor' }>
  | Readonly<{ kind: 'unavailable' }>;


export interface AuthGateway {
  login(actorId: string): Promise<LoginResult>;
  logout(): void;
}

export interface SessionReader {
  currentActor(): Actor | null;
}

export type SessionService = SessionReader &
  Readonly<{
    login(actorId: string): Promise<LoginResult>;
    logout(): void;
  }>;

export function createSessionService(auth: AuthGateway): SessionService {
  let actor: Actor | null = null;
  return {
    currentActor: () => actor,
    async login(actorId) {
      const result = await auth.login(actorId);
      actor = result.kind === 'success' ? result.actor : null;
      return result;
    },
    logout() {
      auth.logout();
      actor = null;
    },
  };
}