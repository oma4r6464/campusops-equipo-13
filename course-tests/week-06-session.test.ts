import { SessionStateMachine } from '../src/domain/session/sessionStateMachine';
import type { Clock } from '../src/domain/session/sessionTypes';

describe('Week 06 - Ciclo de Estados de Sesión Segura CampusOps', () => {
  test('Login exitoso transiciona a logging_in y luego a authenticated con tokens y expiracion', () => {
    let currentTime = 10000;
    const clock: Clock = { now: () => currentTime };
    const machine = new SessionStateMachine(clock);

    expect(machine.getState().kind).toBe('unauthenticated');

    machine.login('technician-1');
    expect(machine.getState()).toEqual({
      kind: 'logging_in',
      actorId: 'technician-1',
    });

    machine.loginSucceeded({
      actorId: 'technician-1',
      role: 'technician',
      accessToken: 'jwt-access-token-001',
      refreshToken: 'refresh-token-001',
      expiresInMs: 60000,
    });

    const state = machine.getState();
    expect(state.kind).toBe('authenticated');
    if (state.kind === 'authenticated') {
      expect(state.actorId).toBe('technician-1');
      expect(state.role).toBe('technician');
      expect(state.accessToken).toBe('jwt-access-token-001');
      expect(state.refreshToken).toBe('refresh-token-001');
      expect(state.expiresAt).toBe(70000);
    }
  });

  test('Expiracion determinista usando reloj controlado sin esperas reales', () => {
    let currentTime = 10000;
    const clock: Clock = { now: () => currentTime };
    const machine = new SessionStateMachine(clock);

    machine.login('reporter-1');
    machine.loginSucceeded({
      actorId: 'reporter-1',
      role: 'reporter',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInMs: 5000,
    });

    // Antes de expirar
    currentTime = 14999;
    expect(machine.isExpired()).toBe(false);
    expect(machine.getState().kind).toBe('authenticated');

    // Al llegar a expiresAt
    currentTime = 15000;
    expect(machine.isExpired()).toBe(true);
    const expiredState = machine.getState();
    expect(expiredState.kind).toBe('expired');
    if (expiredState.kind === 'expired') {
      expect(expiredState.actorId).toBe('reporter-1');
      expect(expiredState.role).toBe('reporter');
      expect(expiredState.expiredAt).toBe(15000);
      expect((expiredState as Record<string, unknown>).accessToken).toBeUndefined();
    }
  });

  test('Renovacion fallida transiciona de forma segura a no autenticado y purga tokens', () => {
    let currentTime = 10000;
    const clock: Clock = { now: () => currentTime };
    const machine = new SessionStateMachine(clock);

    machine.login('coordinator-1');
    machine.loginSucceeded({
      actorId: 'coordinator-1',
      role: 'coordinator',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInMs: 5000,
    });

    machine.startRefresh('req-alpha');
    expect(machine.getState().kind).toBe('refreshing');

    // Petición concurrente se suma a la misma renovación single-flight
    machine.startRefresh('req-beta');
    const refreshingState = machine.getState();
    if (refreshingState.kind === 'refreshing') {
      expect(refreshingState.pendingRequests).toEqual(['req-alpha', 'req-beta']);
    }

    // Falla de refresh
    machine.refreshFailed();
    expect(machine.getState()).toEqual({ kind: 'unauthenticated' });
    expect(machine.getSafeSnapshot()).toEqual({ kind: 'unauthenticated', hasToken: false });
  });

  test('Logout elimina sesion y no deja token persistido', () => {
    const machine = new SessionStateMachine();

    machine.login('reporter-1');
    machine.loginSucceeded({
      actorId: 'reporter-1',
      role: 'reporter',
      accessToken: 'secret-token',
      refreshToken: 'secret-refresh',
      expiresInMs: 30000,
    });

    machine.logout();

    expect(machine.getState()).toEqual({ kind: 'unauthenticated' });
    const snapshot = machine.getSafeSnapshot();
    expect(snapshot.hasToken).toBe(false);
    expect((snapshot as Record<string, unknown>).accessToken).toBeUndefined();
    expect((snapshot as Record<string, unknown>).refreshToken).toBeUndefined();
  });

  test('Tokens sensibles no aparecen en logs ni snapshots de telemetria', () => {
    const machine = new SessionStateMachine();
    const tokenSecret = 'super-secret-raw-token-xyz';
    const refreshSecret = 'super-secret-refresh-abc';

    machine.login('reporter-1');
    machine.loginSucceeded({
      actorId: 'reporter-1',
      role: 'reporter',
      accessToken: tokenSecret,
      refreshToken: refreshSecret,
      expiresInMs: 60000,
    });

    const safeSnapshot = machine.getSafeSnapshot();
    const serialized = JSON.stringify(safeSnapshot);

    expect(serialized).not.toContain(tokenSecret);
    expect(serialized).not.toContain(refreshSecret);
    expect(safeSnapshot).toEqual({
      kind: 'authenticated',
      actorId: 'reporter-1',
      role: 'reporter',
      hasToken: true,
      isExpired: false,
    });
  });

  test('Renovacion exitosa actualiza tokens, reinicia expiracion y devuelve peticiones a reintentar', () => {
    let currentTime = 10000;
    const clock: Clock = { now: () => currentTime };
    const machine = new SessionStateMachine(clock);

    machine.login('reporter-1');
    machine.loginSucceeded({
      actorId: 'reporter-1',
      role: 'reporter',
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresInMs: 5000,
    });

    machine.startRefresh('req-1');
    machine.startRefresh('req-2');

    currentTime = 12000;
    const retried = machine.refreshSucceeded({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresInMs: 60000,
    });

    expect(retried).toEqual(['req-1', 'req-2']);
    const state = machine.getState();
    expect(state.kind).toBe('authenticated');
    if (state.kind === 'authenticated') {
      expect(state.accessToken).toBe('new-access-token');
      expect(state.refreshToken).toBe('new-refresh-token');
      expect(state.expiresAt).toBe(72000);
    }
  });
});
