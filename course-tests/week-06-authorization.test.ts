import {
  authorizeOperation,
  type TransitionOperation,
} from '../src/domain/incidents/authorization';
import type { IncidentActionGateway } from '../src/application/incidents/incidentActionGateway';
import type { IncidentGateway } from '../src/application/incidents/incidentGateway';
import { createIncidentOperations } from '../src/application/incidents/incidentOperations';
import { createSessionService, type AuthGateway } from '../src/application/session/session';
import type { Incident, UserProfile } from '../src/domain/incidents/types';

const ROLES: Readonly<Record<string, UserProfile>> = {
  'reporter-1': 'reporter',
  'technician-1': 'technician',
  'technician-2': 'technician',
  'coordinator-1': 'coordinator',
};

const NEXT_STATUS: Readonly<Record<TransitionOperation, Incident['status']>> = {
  start: 'in_progress',
  resolve: 'resolved',
  close: 'closed',
  reopen: 'assigned',
};

function setup() {
  let incident: Incident = {
    id: 'campus-inc-001',
    title: 'Sin conexion en laboratorio ficticio',
    description: 'Sin conexion en laboratorio ficticio',
    category: 'connectivity',
    status: 'assigned',
    priority: 'medium',
    locationLabel: 'Edificio de prueba A',
    reporterProfile: 'reporter',
    assignedTechnicianId: 'technician-1',
    updatedAt: null,
  };
  const performed: string[] = [];
  const createSpy = jest.fn();

  const auth: AuthGateway = {
    async login(actorId) {
      const profile = ROLES[actorId];
      return profile ? { kind: 'success', actor: { actorId, profile } } : { kind: 'invalid_actor' };
    },
    logout() {},
  };
  const incidents: IncidentGateway = {
    list: async () => ({ kind: 'success', incidents: [incident], omittedWithoutPayload: 0 }),
    get: async (id) => (id === incident.id ? { kind: 'success', incident } : { kind: 'not_found' }),
    create: async (...args) => {
      createSpy(...args);
      return { kind: 'success', incident };
    },
  };
  const actions: IncidentActionGateway = {
    async perform(request) {
      performed.push(request.operation);
      incident = { ...incident, status: NEXT_STATUS[request.operation] };
      return { kind: 'success', incident };
    },
  };

  const session = createSessionService(auth);
  const operations = createIncidentOperations({ session, incidents, actions });
  return { session, operations, incidents, performed, createSpy };
}

const statusOf = async (incidents: IncidentGateway) => {
  const detail = await incidents.get('campus-inc-001');
  if (detail.kind !== 'success') throw new Error('se esperaba la incidencia');
  return detail.incident.status;
};

describe('sesion por actor ficticio', () => {
  test('login valido expone actor y perfil; actor desconocido no inicia sesion', async () => {
    const { session } = setup();
    await expect(session.login('reporter-1')).resolves.toEqual({
      kind: 'success',
      actor: { actorId: 'reporter-1', profile: 'reporter' },
    });
    await expect(session.login('intruso-9')).resolves.toEqual({ kind: 'invalid_actor' });
    expect(session.currentActor()).toBeNull();
  });
});

describe('reportante', () => {
  test('puede crear; tecnico y coordinador no', async () => {
    const draft = { category: 'connectivity', description: 'Sin wifi', location: 'Biblioteca' } as const;

    const allowed = setup();
    await allowed.session.login('reporter-1');
    await expect(allowed.operations.createIncident(draft, 'create-key-1')).resolves.toMatchObject({ kind: 'success' });
    expect(allowed.createSpy).toHaveBeenCalledTimes(1);

    for (const actorId of ['technician-1', 'coordinator-1']) {
      const denied = setup();
      await denied.session.login(actorId);
      await expect(denied.operations.createIncident(draft, 'create-key-2')).resolves.toEqual({
        kind: 'forbidden',
        reason: 'profile_not_allowed',
      });
      expect(denied.createSpy).not.toHaveBeenCalled();
    }
  });
});

describe('tecnico', () => {
  test('resuelve una incidencia asignada', async () => {
    const { session, operations, incidents, performed } = setup();
    await session.login('technician-1');
    await operations.startIncident('campus-inc-001', 'start-key-01');
    const result = await operations.resolveIncident('campus-inc-001', 'Cable reemplazado', 'resolve-key-1');
    expect(result).toMatchObject({ kind: 'success', incident: { status: 'resolved' } });
    expect(performed).toEqual(['start', 'resolve']);
    expect(await statusOf(incidents)).toBe('resolved');
  });

  test('no resuelve una incidencia no asignada y el rechazo no modifica nada', async () => {
    const { session, operations, incidents, performed } = setup();
    await session.login('technician-2');
    const result = await operations.resolveIncident('campus-inc-001', 'Intento ajeno', 'resolve-key-2');
    expect(result).toEqual({ kind: 'forbidden', reason: 'not_assigned' });
    expect(performed).toEqual([]);
    expect(await statusOf(incidents)).toBe('assigned');
  });

  test('resolver sin diagnostico es invalido y no llama al backend', async () => {
    const { session, operations, performed } = setup();
    await session.login('technician-1');
    await expect(operations.resolveIncident('campus-inc-001', '   ', 'resolve-key-3')).resolves.toEqual({
      kind: 'invalid',
      field: 'diagnosis',
    });
    expect(performed).toEqual([]);
  });
});

describe('coordinador', () => {
  test('cierra y reabre', async () => {
    const { session, operations, performed } = setup();
    await session.login('coordinator-1');
    await expect(operations.closeIncident('campus-inc-001', 'close-key-01')).resolves.toMatchObject({
      kind: 'success',
      incident: { status: 'closed' },
    });
    await expect(operations.reopenIncident('campus-inc-001', 'reopen-key-1')).resolves.toMatchObject({
      kind: 'success',
      incident: { status: 'assigned' },
    });
    expect(performed).toEqual(['close', 'reopen']);
  });
});

describe('rechazos controlados (sin pasar por la UI)', () => {
  test.each([
    ['reporter-1', 'close'],
    ['reporter-1', 'reopen'],
    ['technician-1', 'close'],
    ['technician-1', 'reopen'],
  ] as const)('%s no puede %s: error distinguible y estado intacto', async (actorId, operation) => {
    const { session, operations, incidents, performed } = setup();
    await session.login(actorId);
    const result =
      operation === 'close'
        ? await operations.closeIncident('campus-inc-001', 'deny-key-001')
        : await operations.reopenIncident('campus-inc-001', 'deny-key-002');
    expect(result).toEqual({ kind: 'forbidden', reason: 'profile_not_allowed' });
    expect(performed).toEqual([]);
    expect(await statusOf(incidents)).toBe('assigned');
  });

  test('coordinador no resuelve (operacion de tecnico)', async () => {
    const { session, operations, performed } = setup();
    await session.login('coordinator-1');
    await expect(operations.resolveIncident('campus-inc-001', 'x', 'deny-key-003')).resolves.toEqual({
      kind: 'forbidden',
      reason: 'profile_not_allowed',
    });
    expect(performed).toEqual([]);
  });

  test('sin sesion o tras logout: unauthenticated y sin llamadas', async () => {
    const { session, operations, performed } = setup();
    await expect(operations.closeIncident('campus-inc-001', 'anon-key-001')).resolves.toEqual({ kind: 'unauthenticated' });
    await session.login('coordinator-1');
    session.logout();
    await expect(operations.closeIncident('campus-inc-001', 'anon-key-002')).resolves.toEqual({ kind: 'unauthenticated' });
    expect(performed).toEqual([]);
  });

  test('la decision pura tambien exige asignacion', () => {
    const actor = { actorId: 'technician-2', profile: 'technician' } as const;
    expect(authorizeOperation(actor, 'start', null)).toEqual({ allowed: false, reason: 'not_assigned' });
  });
});