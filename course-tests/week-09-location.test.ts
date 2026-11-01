import { createCourseGeocodingClient } from '../src/api/courseGeocodingClient';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const clientOptions = (fetchImpl: typeof fetch) => ({
  baseUrl: 'http://fixture',
  actorId: 'reporter-1',
  accessToken: 'course-valid-token',
  fetchImpl,
});

test('obtiene ubicación ficticia y cachea resultados válidos por consulta normalizada', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    response({ label: 'Edificio ficticio A', latitude: 12.5, longitude: -45.25 }),
  );
  const client = createCourseGeocodingClient(clientOptions(fetchImpl));

  await expect(client.lookup('  Edificio A  ')).resolves.toEqual({
    kind: 'available',
    value: { label: 'Edificio ficticio A', latitude: 12.5, longitude: -45.25 },
  });
  await expect(client.lookup('edificio a')).resolves.toEqual({
    kind: 'available',
    value: { label: 'Edificio ficticio A', latitude: 12.5, longitude: -45.25 },
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith(
    'http://fixture/v1/geocoding?q=Edificio%20A',
    expect.objectContaining({ headers: expect.objectContaining({ 'X-Course-Actor': 'reporter-1' }) }),
  );
});

test('expira entradas de caché después de su TTL', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn().mockResolvedValue(
      response({ label: 'Zona ficticia', latitude: 0, longitude: 0 }),
    );
    const client = createCourseGeocodingClient({
      ...clientOptions(fetchImpl),
      cacheTtlMs: 100,
    });

    await client.lookup('Zona ficticia');
    jest.advanceTimersByTime(101);
    await client.lookup('Zona ficticia');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  ['respuesta incompleta', response({ label: 'Zona ficticia' }), 'invalid_response'],
  ['coordenadas inválidas', response({ label: 'Zona ficticia', latitude: 999, longitude: 0 }), 'invalid_response'],
  ['JSON malformado', { ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON'); } } as unknown as Response, 'invalid_response'],
  ['429', response({ code: 'rate_limited' }, 429), 'rate_limited'],
  ['500', response({ code: 'controlled_failure' }, 500), 'server'],
])('no cachea %s y lo devuelve como no disponible', async (_name, result, reason) => {
  const fetchImpl = jest.fn().mockResolvedValue(result);
  const client = createCourseGeocodingClient(clientOptions(fetchImpl));

  await expect(client.lookup('Zona ficticia')).resolves.toEqual({ kind: 'unavailable', reason });
  await client.lookup('Zona ficticia');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('clasifica timeout y desconexión de manera reproducible', async () => {
  const timeoutFetch = jest.fn().mockImplementation((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
  const timeoutClient = createCourseGeocodingClient({ ...clientOptions(timeoutFetch), timeoutMs: 1 });
  const disconnectedClient = createCourseGeocodingClient(
    clientOptions(jest.fn().mockRejectedValue(new Error('synthetic disconnect'))),
  );

  await expect(timeoutClient.lookup('Edificio ficticio')).resolves.toEqual({
    kind: 'unavailable',
    reason: 'timeout',
  });
  await expect(disconnectedClient.lookup('Edificio ficticio')).resolves.toEqual({
    kind: 'unavailable',
    reason: 'network',
  });
});
