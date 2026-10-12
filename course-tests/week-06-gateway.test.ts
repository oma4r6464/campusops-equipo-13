import { createCourseIncidentClient } from '../src/api/courseIncidentClient';
import { createCloudIncidentActionGateway } from '../src/infrastructure/incidents/cloudIncidentActionGateway';
import { createCourseAuthGateway } from '../src/infrastructure/session/courseAuthGateway';

const TOKEN = 'course-valid-token';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const remote = (version: number, status: string) => ({
  id: 'campus-inc-001',
  version,
  status,
  payload: {
    category: 'connectivity',
    description: 'Sin conexion en laboratorio ficticio',
    location: 'Edificio de prueba A',
    priority: 'medium',
    reporterId: 'reporter-1',
    assignedTechnicianId: 'technician-1',
  },
});

const loginBody = { actorId: 'technician-1', role: 'technician', accessToken: TOKEN, refreshToken: 'r-0', expiresIn: 60 };

describe('courseAuthGateway', () => {
  test('login valido mapea el perfil y no filtra el token en el resultado', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(loginBody));
    const auth = createCourseAuthGateway({ baseUrl: 'http://fixture', fetchImpl });

    const result = await auth.login('technician-1');

    expect(result).toEqual({ kind: 'success', actor: { actorId: 'technician-1', profile: 'technician' } });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(auth.credentials()).toEqual({ actorId: 'technician-1', accessToken: TOKEN });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://fixture/v1/session/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ actorId: 'technician-1' }) }),
    );
  });

  test('actor desconocido (401) o respuesta invalida no dejan credenciales', async () => {
    const unknown = createCourseAuthGateway({ baseUrl: 'http://fixture', fetchImpl: jest.fn().mockResolvedValue(response({ code: 'unknown_fixture_actor' }, 401)) });
    await expect(unknown.login('intruso-9')).resolves.toEqual({ kind: 'invalid_actor' });
    expect(unknown.credentials()).toBeNull();

    const broken = createCourseAuthGateway({ baseUrl: 'http://fixture', fetchImpl: jest.fn().mockResolvedValue(response({ actorId: 'x', role: 'admin', accessToken: TOKEN })) });
    await expect(broken.login('x')).resolves.toEqual({ kind: 'unavailable' });
    expect(broken.credentials()).toBeNull();
  });

  test('logout borra las credenciales y el cliente deja de enviar token', async () => {
    const auth = createCourseAuthGateway({ baseUrl: 'http://fixture', fetchImpl: jest.fn().mockResolvedValue(response(loginBody)) });
    await auth.login('technician-1');
    const fetchImpl = jest.fn().mockResolvedValue(response({ items: [] }));
    const client = createCourseIncidentClient({ baseUrl: 'http://fixture', credentials: auth.credentials, fetchImpl });

    await client.list();
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'X-Course-Actor': 'technician-1' });

    auth.logout();
    await client.list();
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ Authorization: '', 'X-Course-Actor': '' });
  });
});

describe('cloudIncidentActionGateway', () => {
  const gatewayWith = (fetchImpl: typeof fetch) =>
    createCloudIncidentActionGateway(
      createCourseIncidentClient({ baseUrl: 'http://fixture', actorId: 'technician-1', accessToken: TOKEN, fetchImpl }),
    );

  test('accion permitida: envia baseVersion, diagnostico y Idempotency-Key', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(remote(2, 'in_progress')))
      .mockResolvedValueOnce(response({ incident: remote(3, 'resolved') }, 201));

    const result = await gatewayWith(fetchImpl).perform({
      id: 'campus-inc-001', operation: 'resolve', diagnosis: 'Cable reemplazado', operationKey: 'op-key-0001',
    });

    expect(result).toMatchObject({ kind: 'success', incident: { status: 'resolved' } });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://fixture/v1/incidents/campus-inc-001/actions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'op-key-0001' }),
        body: JSON.stringify({ action: 'resolve', baseVersion: 2, diagnosis: 'Cable reemplazado' }),
      }),
    );
  });

  test('403 del servidor es un error de autorizacion controlado', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(remote(1, 'assigned')))
      .mockResolvedValueOnce(response({ code: 'forbidden' }, 403));
    await expect(
      gatewayWith(fetchImpl).perform({ id: 'campus-inc-001', operation: 'start', diagnosis: null, operationKey: 'op-key-0002' }),
    ).resolves.toEqual({ kind: 'forbidden', reason: 'server_denied' });
  });

  test('409 es conflicto y 401 es unauthenticated', async () => {
    const conflict = jest.fn().mockResolvedValueOnce(response(remote(1, 'assigned'))).mockResolvedValueOnce(response({ code: 'version_conflict' }, 409));
    await expect(gatewayWith(conflict).perform({ id: 'campus-inc-001', operation: 'start', diagnosis: null, operationKey: 'op-key-0003' })).resolves.toEqual({ kind: 'conflict' });

    const expired = jest.fn().mockResolvedValue(response({ code: 'unauthorized' }, 401));
    await expect(gatewayWith(expired).perform({ id: 'campus-inc-001', operation: 'start', diagnosis: null, operationKey: 'op-key-0004' })).resolves.toEqual({ kind: 'unauthenticated' });
  });
});