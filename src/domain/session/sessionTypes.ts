export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export type SessionStateKind =
  | 'unauthenticated'
  | 'logging_in'
  | 'authenticated'
  | 'expired'
  | 'refreshing';

export type UnauthenticatedState = Readonly<{
  kind: 'unauthenticated';
}>;

export type LoggingInState = Readonly<{
  kind: 'logging_in';
  actorId: string;
}>;

export type AuthenticatedState = Readonly<{
  kind: 'authenticated';
  actorId: string;
  role: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}>;

export type ExpiredState = Readonly<{
  kind: 'expired';
  actorId: string;
  role: string;
  refreshToken: string;
  expiredAt: number;
}>;

export type RefreshingState = Readonly<{
  kind: 'refreshing';
  actorId: string;
  role: string;
  refreshToken: string;
  pendingRequests: readonly string[];
}>;

export type SessionState =
  | UnauthenticatedState
  | LoggingInState
  | AuthenticatedState
  | ExpiredState
  | RefreshingState;

export type SafeSessionSnapshot = Readonly<{
  kind: SessionStateKind;
  actorId?: string;
  role?: string;
  isExpired?: boolean;
  hasToken: boolean;
}>;
