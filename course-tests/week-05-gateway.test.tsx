import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { createCourseIncidentClient } from '../src/api/courseIncidentClient';
import { createCampusOpsServices } from '../src/application/campusOpsServices';
import type { IncidentGateway } from '../src/application/incidents/incidentGateway';
import { createIncidentUseCases } from '../src/application/incidents/incidentUseCases';
import { createCloudIncidentGateway } from '../src/infrastructure/incidents/cloudIncidentGateway';
import { createInMemoryIncidentGateway } from '../src/infrastructure/incidents/inMemoryIncidentGateway';
import { CampusOpsScreen } from '../src/ui/CampusOpsScreen';

const SECRET = 'synthetic-secret-token';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const validPayload = {
  category: 'connectivity',
  description: 'Sin senal wifi en el edificio C',
  location: 'Edificio C, planta baja',
  priority: 'medium',
};
const valid = { id: 'campus-inc-001', version: 1, status: 'open', payload: validPayload };

function gatewayWith(fetchImpl: typeof fetch, timeoutMs = 50): IncidentGateway {
  return createCloudIncidentGateway(
    createCourseIncidentClient({ baseUrl: 'http://fixture', accessToken: SECRET, fetchImpl, timeoutMs }),
  );
}

describe('gateway cloud (adaptador del backend didactico)', () => {
  test('lista: valida el DTO y lo mapea al dominio', async () => {
    const gateway = gatewayWith(jest.fn().mockResolvedValue(response({ items: [valid] })));

    const result = await gateway.list();

    expect(result).toMatchObject({ kind: 'success', omittedWithoutPayload: 0 });
    if (result.kind !== 'success') throw new Error('se esperaba exito');
    expect(result.incidents[0]).toMatchObject({
      id: 'campus-inc-001',
      category: 'connectivity',
      locationLabel: 'Edificio C, planta baja',
      status: 'open',
    });
  });

  test('payload null es valido: no se inventa una incidencia', async () => {
    const nullable = { ...valid, id: 'campus-inc-002', payload: null };
    const gateway = gatewayWith(jest.fn().mockResolvedValue(response({ items: [valid, nullable] })));

    const list = await gateway.list();
    expect(list).toMatchObject({ kind: 'success', omittedWithoutPayload: 1 });
    if (list.kind !== 'success') throw new Error('se esperaba exito');
    expect(list.incidents).toHaveLength(1);

    const detail = await gatewayWith(jest.fn().mockResolvedValue(response(nullable))).get('campus-inc-002');
    expect(detail).toEqual({ kind: 'null_payload', id: 'campus-inc-002', version: 1 });
  });

  test('payload malformado (sobre valido, DTO invalido) no llega al dominio', async () => {
    const broken = { ...valid, payload: { ...validPayload, category: 'otra-cosa' } };
    const gateway = gatewayWith(jest.fn().mockResolvedValue(response({ items: [broken] })));

    await expect(gateway.list()).resolves.toEqual({ kind: 'malformed' });
  });

  test('clasifica timeout, error de servidor, 404 y red sin lanzar excepciones', async () => {
    const hang = jest.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));

    await expect(gatewayWith(hang, 1).list()).resolves.toEqual({ kind: 'timeout' });
    await expect(gatewayWith(jest.fn().mockResolvedValue(response({}, 500))).list()).resolves.toEqual({ kind: 'server_error' });
    await expect(gatewayWith(jest.fn().mockResolvedValue(response({}, 404))).get('x')).resolves.toEqual({ kind: 'not_found' });
    await expect(gatewayWith(jest.fn().mockRejectedValue(new Error('boom'))).list()).resolves.toEqual({ kind: 'unavailable' });
  });

  test('los errores publicos no filtran payload, tokens ni mensajes del upstream', async () => {
    const leaky = jest.fn().mockRejectedValue(new Error(`${SECRET} Edificio C comentario interno`));
    const results = [
      await gatewayWith(leaky).list(),
      await gatewayWith(jest.fn().mockResolvedValue(response({ detail: SECRET, payload: validPayload }, 500))).list(),
      await gatewayWith(jest.fn().mockResolvedValue(response({ items: [{ ...valid, payload: { ...validPayload, category: SECRET } }] }))).list(),
    ];

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('Edificio C');
    expect(serialized).not.toContain('comentario interno');
  });

  test('creacion: envia DTO con Idempotency-Key y valida la incidencia devuelta', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ incident: valid }, 201));
    const gateway = gatewayWith(fetchImpl);

    const result = await gateway.create(
      { category: 'connectivity', description: validPayload.description, location: validPayload.location },
      'op-123',
    );

    expect(result).toMatchObject({ kind: 'success', incident: { id: 'campus-inc-001' } });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://fixture/v1/incidents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'op-123' }),
      }),
    );
  });

  test('creacion con respuesta sin payload se trata como malformada', async () => {
    const gateway = gatewayWith(jest.fn().mockResolvedValue(response({ incident: { ...valid, payload: null } }, 201)));

    await expect(
      gateway.create({ category: 'water', description: 'fuga', location: 'Lab' }, 'op-1'),
    ).resolves.toEqual({ kind: 'malformed' });
  });
});

describe('casos de uso', () => {
  test('el borrador invalido no sale de la app', async () => {
    const gateway: IncidentGateway = { list: jest.fn(), get: jest.fn(), create: jest.fn() };
    const useCases = createIncidentUseCases(gateway);

    await expect(
      useCases.createIncident({ category: 'water', description: '   ', location: '' }, 'op-1'),
    ).resolves.toEqual({ kind: 'invalid', fields: ['description', 'location'] });
    expect(gateway.create).not.toHaveBeenCalled();
  });

  test('la lista expone resumenes sin descripcion', async () => {
    const useCases = createIncidentUseCases(createInMemoryIncidentGateway());

    const result = await useCases.listIncidents();
    if (result.kind !== 'success') throw new Error('se esperaba exito');
    expect(result.incidents.length).toBeGreaterThan(0);
    expect(result.incidents[0]).not.toHaveProperty('description');
  });
});

describe('pantalla (sin HTTP directo)', () => {
  const healthReader = { check: async () => 'available' as const };

  function services(gateway: IncidentGateway) {
    let counter = 0;
    return createCampusOpsServices({
      incidentGateway: gateway,
      backendHealthReader: healthReader,
      newOperationKey: () => `op-${(counter += 1)}`,
    });
  }

  test('crea una incidencia a traves de los servicios y la muestra', async () => {
    const view = await render(<CampusOpsScreen services={services(createInMemoryIncidentGateway())} />);
    await view.findByText('Lista de incidencias');

    await fireEvent.changeText(view.getByLabelText('Descripcion de la incidencia'), 'Lampara fundida en pasillo');
    await fireEvent.changeText(view.getByLabelText('Ubicacion de la incidencia'), 'Edificio A');
    await fireEvent.press(view.getByText('Crear incidencia'));

    await waitFor(() => expect(view.getByText('Incidencia creada correctamente.')).toBeTruthy());
    await waitFor(() => expect(view.getByText('Ubicacion: Edificio A')).toBeTruthy());
  });

  test('formulario vacio muestra aviso y no crea nada', async () => {
    const create = jest.fn();
    const gateway: IncidentGateway = { ...createInMemoryIncidentGateway(), create };
    const view = await render(<CampusOpsScreen services={services(gateway)} />);
    await view.findByText('Lista de incidencias');

    await fireEvent.press(view.getByText('Crear incidencia'));

    await waitFor(() => expect(view.getByText('Completa la descripción y la ubicación antes de enviar.')).toBeTruthy());
    expect(create).not.toHaveBeenCalled();
  });

  test('error de lista se muestra con mensaje publico y permite reintentar', async () => {
    const list = jest.fn().mockResolvedValueOnce({ kind: 'timeout' }).mockResolvedValue({
      kind: 'success',
      incidents: [],
      omittedWithoutPayload: 0,
    });
    const gateway: IncidentGateway = { ...createInMemoryIncidentGateway(), list };
    const view = await render(<CampusOpsScreen services={services(gateway)} />);

    await view.findByText('El servicio tardó demasiado en responder.');
    await fireEvent.press(view.getByText('Reintentar'));

    await waitFor(() => expect(view.getByText('No hay incidencias registradas.')).toBeTruthy());
  });

  test('payload null en el detalle no inventa datos', async () => {
    const gateway: IncidentGateway = {
      ...createInMemoryIncidentGateway(),
      get: async (id) => ({ kind: 'null_payload', id, version: 3 }),
    };
    const view = await render(<CampusOpsScreen services={services(gateway)} />);

    await waitFor(() => expect(view.getByText('Esta incidencia aun no tiene datos disponibles (version 3).')).toBeTruthy());
  });

  test('reintentar tras un fallo de creacion reutiliza la misma clave de operacion', async () => {
    const keys: string[] = [];
    const incident = (await createInMemoryIncidentGateway().get('INC-001'));
    if (incident.kind !== 'success') throw new Error('fixture');
    const create = jest.fn(async (_draft: unknown, key: string) => {
      keys.push(key);
      return keys.length === 1
        ? ({ kind: 'server_error' } as const)
        : ({ kind: 'success', incident: incident.incident } as const);
    });
    const gateway: IncidentGateway = { ...createInMemoryIncidentGateway(), create };
    const view = await render(<CampusOpsScreen services={services(gateway)} />);
    await view.findByText('Lista de incidencias');

    await fireEvent.changeText(view.getByLabelText('Descripcion de la incidencia'), 'Algo falla');
    await fireEvent.changeText(view.getByLabelText('Ubicacion de la incidencia'), 'Lab 1');
    await fireEvent.press(view.getByText('Crear incidencia'));
    await waitFor(() => expect(view.getByText(/Puedes reintentar sin duplicar/)).toBeTruthy());
    await fireEvent.press(view.getByText('Crear incidencia'));
    await waitFor(() => expect(view.getByText('Incidencia creada correctamente.')).toBeTruthy());

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
