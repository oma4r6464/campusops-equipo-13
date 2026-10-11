import type {
  Clock,
  SafeSessionSnapshot,
  SessionState,
} from './sessionTypes';
import { systemClock } from './sessionTypes';

export class SessionStateMachine {
  private state: SessionState = { kind: 'unauthenticated' };
  private readonly clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  getState(): SessionState {
    this.ensureExpirationUpdated();
    return this.state;
  }

  getSafeSnapshot(): SafeSessionSnapshot {
    const current = this.getState();
    switch (current.kind) {
      case 'unauthenticated':
        return { kind: 'unauthenticated', hasToken: false };
      case 'logging_in':
        return { kind: 'logging_in', actorId: current.actorId, hasToken: false };
      case 'authenticated':
        return {
          kind: 'authenticated',
          actorId: current.actorId,
          role: current.role,
          hasToken: true,
          isExpired: false,
        };
      case 'expired':
        return {
          kind: 'expired',
          actorId: current.actorId,
          role: current.role,
          hasToken: false,
          isExpired: true,
        };
      case 'refreshing':
        return {
          kind: 'refreshing',
          actorId: current.actorId,
          role: current.role,
          hasToken: false,
        };
    }
  }

  login(actorId: string): void {
    if (this.state.kind !== 'unauthenticated') {
      this.logout();
    }
    this.state = {
      kind: 'logging_in',
      actorId,
    };
  }

  loginSucceeded(params: Readonly<{
    actorId: string;
    role: string;
    accessToken: string;
    refreshToken: string;
    expiresInMs: number;
  }>): void {
    const expiresAt = this.clock.now() + params.expiresInMs;
    this.state = {
      kind: 'authenticated',
      actorId: params.actorId,
      role: params.role,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt,
    };
  }

  loginFailed(): void {
    this.state = { kind: 'unauthenticated' };
  }

  private ensureExpirationUpdated(): void {
    if (this.state.kind === 'authenticated') {
      if (this.clock.now() >= this.state.expiresAt) {
        this.state = {
          kind: 'expired',
          actorId: this.state.actorId,
          role: this.state.role,
          refreshToken: this.state.refreshToken,
          expiredAt: this.clock.now(),
        };
      }
    }
  }

  isExpired(): boolean {
    this.ensureExpirationUpdated();
    return this.state.kind === 'expired';
  }

  startRefresh(requestId?: string): void {
    this.ensureExpirationUpdated();

    if (this.state.kind === 'refreshing') {
      if (requestId && !this.state.pendingRequests.includes(requestId)) {
        this.state = {
          ...this.state,
          pendingRequests: [...this.state.pendingRequests, requestId],
        };
      }
      return;
    }

    if (this.state.kind === 'authenticated' || this.state.kind === 'expired') {
      const pendingRequests = requestId ? [requestId] : [];
      this.state = {
        kind: 'refreshing',
        actorId: this.state.actorId,
        role: this.state.role,
        refreshToken: this.state.refreshToken,
        pendingRequests,
      };
      return;
    }

    throw new Error(`Cannot start refresh from session state: ${this.state.kind}`);
  }

  refreshSucceeded(params: Readonly<{
    accessToken: string;
    refreshToken: string;
    expiresInMs: number;
  }>): readonly string[] {
    if (this.state.kind !== 'refreshing') {
      throw new Error(`Cannot complete refresh from state: ${this.state.kind}`);
    }

    const retriedRequests = [...this.state.pendingRequests];
    const expiresAt = this.clock.now() + params.expiresInMs;

    this.state = {
      kind: 'authenticated',
      actorId: this.state.actorId,
      role: this.state.role,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt,
    };

    return retriedRequests;
  }

  refreshFailed(): void {
    // Transición segura tras fallo de renovación: se purgan todos los tokens y credenciales
    this.state = { kind: 'unauthenticated' };
  }

  logout(): void {
    // Logout seguro: purga tokens, datos de usuario y cancela colas
    this.state = { kind: 'unauthenticated' };
  }
}
