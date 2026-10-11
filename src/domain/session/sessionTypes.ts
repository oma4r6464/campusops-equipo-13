export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export type SessionState =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'logging_in'; actorId: string }>
  | Readonly<{
      kind: 'authenticated';
      actorId: string;
      role: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }>
  | Readonly<{
      kind: 'expired';
      actorId: string;
      role: string;
      refreshToken: string;
      expiredAt: number;
    }>
  | Readonly<{
      kind: 'refreshing';
      actorId: string;
      role: string;
      refreshToken: string;
      pendingRequests: readonly string[];
    }>;

export type SafeSessionSnapshot = Readonly<{
  kind: SessionState['kind'];
  actorId?: string;
  role?: string;
  isExpired?: boolean;
  hasToken: boolean;
}>;
