import { createCourseIncidentClient, IncidentClientError } from '../src/api/courseIncidentClient';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const valid = { id: 'campus-inc-001', version: 1, status: 'assigned', payload: { category: 'connectivity' } };
const options = (fetchImpl: typeof fetch) => ({ baseUrl: 'http://fixture', actorId: 'coordinator-1', accessToken: 'course-valid-token', fetchImpl });

test('consulta lista y detalle sin mezclar DTO remoto con la capa de UI', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(response({ items: [valid] }))
    .mockResolvedValueOnce(response(valid));
  const client = createCourseIncidentClient(options(fetchImpl));

  await expect(client.list()).resolves.toEqual([valid]);
  await expect(client.findById(valid.id)).resolves.toEqual(valid);
  expect(fetchImpl).toHaveBeenCalledWith('http://fixture/v1/incidents', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer course-valid-token' }),
  }));
});

test('conserva payload null como limite valido y no inventa datos', async () => {
  const nullable = { ...valid, payload: null };
  const client = createCourseIncidentClient(options(jest.fn().mockResolvedValue(response({ items: [nullable] }))));

  await expect(client.list()).resolves.toEqual([nullable]);
});

test.each([
  ['objeto malformado', response({ items: [{ id: '', version: 1, status: 'open', payload: null }] }), 'contract'],
  ['DTO incompleto', response({ items: [{ id: 'x', version: 1, status: 'open' }] }), 'contract'],
  ['JSON malformado', { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } } as unknown as Response, 'contract'],
  ['error 500', response({ code: 'controlled_failure' }, 500), 'server'],
])('clasifica %s sin lanzar un error no controlado', async (_name, result, kind) => {
  const client = createCourseIncidentClient(options(jest.fn().mockResolvedValue(result)));

  await expect(client.list()).rejects.toMatchObject({ kind });
});

test('clasifica timeout de forma distinguible', async () => {
  const fetchImpl = jest.fn().mockImplementation((_input: RequestInfo, init: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const client = createCourseIncidentClient({ ...options(fetchImpl), timeoutMs: 1 });

  await expect(client.list()).rejects.toBeInstanceOf(IncidentClientError);
  await expect(client.list()).rejects.toMatchObject({ kind: 'timeout' });
});

test('emite telemetria tecnica sin datos sensibles', async () => {
  const events: unknown[] = [];
  const fetchImpl = jest.fn().mockRejectedValue(new Error('synthetic-token leaked in upstream detail'));
  const client = createCourseIncidentClient({ ...options(fetchImpl), onTelemetry: (event) => events.push(event) });

  await expect(client.list()).rejects.toMatchObject({ kind: 'network' });
  expect(events).toEqual([{ kind: 'network', status: null, attempt: 1 }]);
  expect(JSON.stringify(events)).not.toContain('synthetic-token');
});

test('crea una incidencia con DTO separado y clave de idempotencia', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ incident: valid }, 201));
  const client = createCourseIncidentClient(options(fetchImpl));

  await expect(client.create({ category: 'connectivity', description: 'Falla ficticia', location: 'Zona A' }, 'week05-001')).resolves.toEqual(valid);
  expect(fetchImpl).toHaveBeenCalledWith('http://fixture/v1/incidents', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'Idempotency-Key': 'week05-001' }),
  }));
});