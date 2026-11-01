import { createCourseIncidentClient, IncidentClientError } from '../src/api/courseIncidentClient';
import { DEFAULT_RETRY_POLICY, MAX_RETRY_ATTEMPT, planRetry } from '../src/api/retryPlan';

const KEY = 'resolve-campus-inc-001-op-1';
const valid = { id: 'campus-inc-001', version: 1, status: 'in_progress', payload: { category: 'connectivity' } };

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const clientFor = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) =>
  createCourseIncidentClient({
    baseUrl: 'http://fixture',
    actorId: 'technician-1',
    accessToken: 'course-valid-token',
    fetchImpl,
    sleepImpl: jest.fn().mockResolvedValue(undefined),
    retry: {},
    ...extra,
  });

describe('planRetry', () => {
  test('429 respeta Retry-After valido', () => {
    expect(planRetry({ method: 'GET', status: 429, attempt: 2, retryAfterMs: 1000 })).toEqual({
      retry: true, delayMs: 1000, requiresStableIdempotencyKey: false,
    });
  });

  test('Retry-After mayor al tope o invalido no se obedece a ciegas', () => {
    expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: DEFAULT_RETRY_POLICY.maxRetryAfterMs + 1 }).retry).toBe(false);
    for (const retryAfterMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs })).toEqual({
        retry: true, delayMs: DEFAULT_RETRY_POLICY.baseDelayMs, requiresStableIdempotencyKey: false,
      });
    }
  });

  test('el intento 4 y posteriores no generan otro reintento', () => {
    for (const attempt of [MAX_RETRY_ATTEMPT, 5, 100]) {
      expect(planRetry({ method: 'GET', status: 503, attempt }).retry).toBe(false);
      expect(planRetry({ method: 'GET', status: 'timeout', attempt }).retry).toBe(false);
    }
    for (const attempt of [1, 2, 3]) {
      expect(planRetry({ method: 'GET', status: 503, attempt }).retry).toBe(true);
    }
  });

  test('las esperas son progresivas, finitas, configurables y estan acotadas', () => {
    const delays = [1, 2, 3].map((attempt) => planRetry({ method: 'GET', status: 503, attempt }).delayMs);
    expect(delays).toEqual([250, 500, 1000]);
    for (const delay of delays) expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_POLICY.maxDelayMs);

    const custom = [1, 2, 3].map((attempt) => planRetry({ method: 'GET', status: 503, attempt }, { baseDelayMs: 100, maxDelayMs: 300 }).delayMs);
    expect(custom).toEqual([100, 200, 300]);
    expect(planRetry({ method: 'GET', status: 503, attempt: 3 }, { baseDelayMs: Number.NaN, maxDelayMs: -5 }).delayMs).toBe(1000);
  });

  test('un POST sin identidad estable no se repite', () => {
    for (const idempotencyKey of [undefined, '', '   ', 'corta']) {
      for (const status of [503, 429, 'timeout'] as const) {
        expect(planRetry({ method: 'POST', status, attempt: 1, ...(idempotencyKey !== undefined ? { idempotencyKey } : {}) })).toEqual({
          retry: false, delayMs: 0, requiresStableIdempotencyKey: true,
        });
      }
    }
  });

  test('un POST con clave estable si puede repetirse tras una respuesta perdida', () => {
    expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: KEY })).toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
  });

  test('no reintenta respuestas que no son transitorias', () => {
    for (const status of [200, 201, 400, 401, 403, 404, 409, 422]) {
      expect(planRetry({ method: 'GET', status, attempt: 1 })).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: false });
    }
  });
});

describe('cliente con reintentos', () => {
  test('429 espera el Retry-After del servicio y luego recupera la respuesta', async () => {
    const sleepImpl = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ code: 'rate_limited' }, 429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(response({ items: [valid] }));

    await expect(clientFor(fetchImpl, { sleepImpl }).list()).resolves.toEqual([valid]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).toHaveBeenCalledWith(1000);
  });

  test('con fallas permanentes hace 4 intentos como maximo y 3 esperas acotadas', async () => {
    const sleepImpl = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest.fn().mockResolvedValue(response({ code: 'controlled_failure' }, 503));

    await expect(clientFor(fetchImpl, { sleepImpl }).list()).rejects.toMatchObject({ kind: 'server', status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleepImpl.mock.calls.map(([ms]) => ms)).toEqual([250, 500, 1000]);
  });

  test('sin la opcion retry el cliente conserva el comportamiento anterior', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ code: 'controlled_failure' }, 503));
    const client = createCourseIncidentClient({ baseUrl: 'http://fixture', actorId: 'technician-1', accessToken: 'course-valid-token', fetchImpl });

    await expect(client.list()).rejects.toBeInstanceOf(IncidentClientError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('un POST sin identidad estable se envia una sola vez', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ code: 'controlled_failure' }, 503));

    await expect(clientFor(fetchImpl).perform(valid.id, { action: 'close', baseVersion: 1 }, '')).rejects.toMatchObject({ kind: 'server' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('registra intentos y tiempos sin exponer informacion sensible', async () => {
    const events: unknown[] = [];
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ code: 'rate_limited' }, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response({ items: [valid] }));

    await clientFor(fetchImpl, { onTelemetry: (event: unknown) => events.push(event) }).list();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'network', status: 429, attempt: 1, delayMs: 2000 });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('course-valid-token');
    expect(serialized).not.toContain('technician-1');
  });
});

describe('respuesta perdida con efecto ya guardado en el servidor', () => {
  function createSimulatedServer(loseFirstResponse: boolean) {
    const operations = new Map<string, { fingerprint: string; result: unknown }>();
    const effects = { history: [] as string[], evidence: [] as string[], notifications: [] as string[] };
    const requests: { key: string | undefined; body: string }[] = [];
    let version = 1;
    let calls = 0;

    const fetchImpl = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const headers = init?.headers as Record<string, string>;
      const key = headers['Idempotency-Key'];
      const body = String(init?.body);
      requests.push({ key, body });

      const previous = operations.get(key as string);
      let result: unknown;
      if (previous) {
        if (previous.fingerprint !== body) return Promise.resolve(response({ code: 'idempotency_key_reused' }, 409));
        result = { ...(previous.result as object), duplicate: true };
      } else {
        const input = JSON.parse(body) as { action: string; evidenceId?: string };
        version += 1;
        effects.history.push(`${input.action}:${key}`);
        if (input.evidenceId) effects.evidence.push(input.evidenceId);
        effects.notifications.push(`${input.action}:${key}`);
        result = { incident: { ...valid, version, status: input.action === 'close' ? 'closed' : 'resolved' }, operationId: key, duplicate: false };
        operations.set(key as string, { fingerprint: body, result });
      }

      if (loseFirstResponse && calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      return Promise.resolve(response(result, 201));
    });

    return { fetchImpl: fetchImpl as unknown as typeof fetch, effects, requests };
  }

  test.each([
    ['resolve', { action: 'resolve', baseVersion: 1, diagnosis: 'Cable reemplazado', evidenceId: 'ev-001' }],
    ['close', { action: 'close', baseVersion: 1 }],
  ])('%s: el reintento usa la misma clave y contenido y no duplica el efecto', async (_name, input) => {
    const server = createSimulatedServer(true);
    const client = clientFor(server.fetchImpl, { timeoutMs: 5 });

    const incident = await client.perform(valid.id, input, KEY);

    expect(incident.version).toBe(2);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual(server.requests[0]);
    expect(server.requests.every((request) => request.key === KEY)).toBe(true);
    expect(server.effects.history).toHaveLength(1);
    expect(server.effects.notifications).toHaveLength(1);
    expect(server.effects.evidence).toHaveLength('evidenceId' in input ? 1 : 0);
  });
});