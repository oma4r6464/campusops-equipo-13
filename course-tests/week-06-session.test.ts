import { SessionStateMachine } from '../src/domain/session';
import { coordinateRefresh } from '../src/course-evaluation';
import type { Clock } from '../src/domain/session';

describe('Semana 06: sesión segura y single-flight', () => {
  test('expira con un reloj controlable y no expone tokens en el snapshot', () => {
    let now = 1000;
    const clock: Clock = { now: () => now };
    const session = new SessionStateMachine(clock);

    session.login('reporter-1');
    session.loginSucceeded({
      actorId: 'reporter-1',
      role: 'reporter',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      expiresInMs: 100,
    });
    now = 1100;

    expect(session.getState().kind).toBe('expired');
    expect(JSON.stringify(session.getSafeSnapshot())).not.toContain('secret');
  });

  test('ignora un refresh obsoleto que llega después de logout', () => {
    const result = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'logout' },
      { type: 'refreshSucceeded', generation: 1, token: 'stale-token' },
    ]);

    expect(result).toEqual({
      status: 'anonymous',
      activeGeneration: null,
      refreshCalls: 1,
      retriedRequestIds: [],
      persistedToken: null,
    });
  });

  test('no vuelve a renovar una solicitud ya reintentada', () => {
    const result = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 'new-token' },
      { type: 'request401', requestId: 'a', generation: 1, attempt: 1 },
    ]);

    expect(result.refreshCalls).toBe(1);
    expect(result.retriedRequestIds).toEqual(['a']);
  });
});
