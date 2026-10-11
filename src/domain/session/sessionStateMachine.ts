import type { Clock, SafeSessionSnapshot, SessionState } from './sessionTypes';
import { systemClock } from './sessionTypes';

export class SessionStateMachine {
  private state: SessionState = { kind: 'unauthenticated' };
  private readonly clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  getState(): SessionState {
    this.updateExpiration();
    return this.state;
  }

  getSafeSnapshot(): SafeSessionSnapshot {
    const state = this.getState();
    if (state.kind === 'unauthenticated') return { kind: state.kind, hasToken: false };
    if (state.kind === 'logging_in') {
      return { kind: state.kind, actorId: state.actorId, hasToken: false };
    }
    if (state.kind === 'expired') {
      return { kind: state.kind, actorId: state.actorId, role: state.role, isExpired: true, hasToken: false };
    }
    return {
      kind: state.kind,
      actorId: state.actorId,
      role: state.role,
      hasToken: state.kind === 'authenticated',
      ...(state.kind === 'authenticated' ? { isExpired: false } : {}),
    };
  }

  login(actorId: string): void {
    this.logout();
    this.state = { kind: 'logging_in', actorId };
  }

  loginSucceeded(params: Readonly<{
    actorId: string;
    role: string;
    accessToken: string;
    refreshToken: string;
    expiresInMs: number;
  }>): void {
    this.state = {
      kind: 'authenticated',
      actorId: params.actorId,
      role: params.role,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: this.clock.now() + params.expiresInMs,
    };
  }

  loginFailed(): void {
    this.logout();
  }

  isExpired(): boolean {
    return this.getState().kind === 'expired';
  }

  startRefresh(requestId?: string): void {
    this.updateExpiration();
    if (this.state.kind === 'refreshing') {
      if (requestId && !this.state.pendingRequests.includes(requestId)) {
        this.state = { ...this.state, pendingRequests: [...this.state.pendingRequests, requestId] };
      }
      return;
    }
    if (this.state.kind !== 'authenticated' && this.state.kind !== 'expired') {
      throw new Error(`Cannot start refresh from session state: ${this.state.kind}`);
    }
    this.state = {
      kind: 'refreshing',
      actorId: this.state.actorId,
      role: this.state.role,
      refreshToken: this.state.refreshToken,
      pendingRequests: requestId ? [requestId] : [],
    };
  }

  refreshSucceeded(params: Readonly<{
    accessToken: string;
    refreshToken: string;
    expiresInMs: number;
  }>): readonly string[] {
    if (this.state.kind !== 'refreshing') {
      throw new Error(`Cannot complete refresh from session state: ${this.state.kind}`);
    }
    const retriedRequests = [...this.state.pendingRequests];
    this.state = {
      kind: 'authenticated',
      actorId: this.state.actorId,
      role: this.state.role,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: this.clock.now() + params.expiresInMs,
    };
    return retriedRequests;
  }

  refreshFailed(): void {
    this.logout();
  }

  logout(): void {
    this.state = { kind: 'unauthenticated' };
  }

  private updateExpiration(): void {
    if (this.state.kind === 'authenticated' && this.clock.now() >= this.state.expiresAt) {
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
