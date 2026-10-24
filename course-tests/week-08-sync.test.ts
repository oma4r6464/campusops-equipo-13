import { createCampusOpsServices } from '../src/application/campusOpsServices';
import { incidentToSyncRecord } from '../src/application/sync/incidentSyncRecord';
import {
  createSyncService,
  type PushRequest,
  type PushResult,
  type SyncableOperation,
  type SyncPorts,
} from '../src/application/sync/syncPendingOperations';
import { deduplicateOperations, resolveSync } from '../src/course-evaluation';
import type { SyncRecord } from '../src/course-evaluation/contracts';
import type { Incident } from '../src/domain/incidents/types';
import { createInMemoryIncidentGateway } from '../src/infrastructure/incidents/inMemoryIncidentGateway';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const work = (assignedTechnicianId: string, status: string) => ({ assignedTechnicianId, status });

function record(version: number, fields: Record<string, unknown>): SyncRecord {
  return { id: 'campus-inc-001', version, fields };
}

describe('resolveSync', () => {
  test('combina cambios independientes de campos distintos', () => {
    const base = record(1, { title: 'A', priority: 1 });
    const result = resolveSync(
      base,
      record(1, { title: 'Local', priority: 1 }),
      record(2, { title: 'A', priority: 2 }),
    );
    expect(result).toEqual({ kind: 'merged', fields: { title: 'Local', priority: 2 } });
  });

  test('combina campos agregados por cada lado', () => {
    const result = resolveSync(
      record(1, { a: 1 }),
      record(1, { a: 1, b: 2 }),
      record(2, { a: 1, c: 3 }),
    );
    expect(result).toEqual({ kind: 'merged', fields: { a: 1, b: 2, c: 3 } });
  });

  test('la reasignacion remota no es reemplazada por una asignacion local antigua', () => {
    const base = record(1, { work: work('technician-1', 'assigned'), notes: '' });
    const local = record(1, { work: work('technician-1', 'assigned'), notes: 'Revise el equipo' });
    const remote = record(2, { work: work('technician-2', 'assigned'), notes: '' });
    expect(resolveSync(base, local, remote)).toEqual({
      kind: 'merged',
      fields: { work: work('technician-2', 'assigned'), notes: 'Revise el equipo' },
    });
  });

  test('detecta conflicto cuando work cambia local y remotamente', () => {
    const base = record(1, { work: work('technician-1', 'assigned') });
    const local = record(1, { work: work('technician-1', 'in_progress') });
    const remote = record(2, { work: work('technician-2', 'assigned') });
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'conflict', fields: ['work'] });
  });

  test('un cambio identico en ambos lados converge sin conflicto', () => {
    const result = resolveSync(record(1, { priority: 1 }), record(1, { priority: 3 }), record(2, { priority: 3 }));
    expect(result).toEqual({ kind: 'merged', fields: { priority: 3 } });
  });

  test('informa todos los campos en conflicto', () => {
    const result = resolveSync(
      record(1, { title: 'A', priority: 1, notes: 'x' }),
      record(1, { title: 'L', priority: 2, notes: 'y' }),
      record(2, { title: 'R', priority: 3, notes: 'x' }),
    );
    expect(result).toEqual({ kind: 'conflict', fields: ['title', 'priority'] });
  });

  test('un campo eliminado en un lado y sin cambios en el otro se elimina', () => {
    const result = resolveSync(record(1, { a: 1, b: 2 }), record(1, { a: 1 }), record(2, { a: 1, b: 2 }));
    expect(result).toEqual({ kind: 'merged', fields: { a: 1 } });
  });

  test('eliminar localmente y editar remotamente el mismo campo es conflicto', () => {
    const result = resolveSync(record(1, { a: 1 }), record(1, {}), record(2, { a: 2 }));
    expect(result).toEqual({ kind: 'conflict', fields: ['a'] });
  });

  test('no muta base, local ni remote y el resultado no comparte referencias', () => {
    const base = deepFreeze(record(1, { work: work('technician-1', 'assigned'), title: 'A' }));
    const local = deepFreeze(record(1, { work: work('technician-1', 'assigned'), title: 'Local' }));
    const remote = deepFreeze(record(2, { work: work('technician-2', 'assigned'), title: 'A' }));
    const before = JSON.stringify([base, local, remote]);

    const result = resolveSync(base, local, remote);

    expect(JSON.stringify([base, local, remote])).toBe(before);
    if (result.kind !== 'merged') throw new Error('se esperaba una combinacion');
    expect(result.fields.work).toEqual(remote.fields.work);
    expect(result.fields.work).not.toBe(remote.fields.work);
  });
});

describe('deduplicateOperations', () => {
  const sample = () => [
    { operationId: 'op-1', value: 1 },
    { operationId: 'op-2', value: 2 },
    { operationId: 'op-1', value: 99 },
    { operationId: 'op-3', value: 3 },
  ];

  test('conserva la primera aparicion de cada operationId y el orden', () => {
    const operations = sample();
    expect(deduplicateOperations(operations)).toEqual([operations[0], operations[1], operations[3]]);
  });

  test('no muta la entrada ni devuelve la misma lista', () => {
    const operations = deepFreeze(sample());
    const before = JSON.stringify(operations);
    const result = deduplicateOperations(operations);
    expect(result).not.toBe(operations);
    expect(JSON.stringify(operations)).toBe(before);
    expect(operations).toHaveLength(4);
  });

  test('aplicarla dos veces da el mismo resultado', () => {
    const once = deduplicateOperations(sample());
    expect(deduplicateOperations(once)).toEqual(once);
  });
});

type QueuedOperation = SyncableOperation & Readonly<{ notes: string }>;

function makeOperation(operationId: string, notes = 'nota'): QueuedOperation {
  return { operationId, incidentId: 'campus-inc-001', baseVersion: 1, notes };
}

function createHarness(initial: readonly QueuedOperation[]) {
  let queue: readonly QueuedOperation[] = deepFreeze([...initial]);
  const state: {
    base: SyncRecord;
    local: SyncRecord;
    remote: SyncRecord;
    pushResult: (request: PushRequest) => PushResult;
    failFetch: boolean;
    failComplete: boolean;
  } = {
    base: record(1, { work: work('technician-1', 'assigned'), notes: '' }),
    local: record(1, { work: work('technician-1', 'assigned'), notes: 'Revise el equipo' }),
    remote: record(2, { work: work('technician-1', 'assigned'), notes: '' }),
    pushResult: () => ({ kind: 'confirmed' }),
    failFetch: false,
    failComplete: false,
  };
  const pushes: PushRequest[] = [];
  const effects = new Map<string, PushRequest>();

  const ports: SyncPorts<QueuedOperation> = {
    queue: {
      list: async () => queue,
      complete: async (operationId) => {
        if (state.failComplete) throw new Error('fallo al limpiar la cola');
        queue = queue.filter((operation) => operation.operationId !== operationId);
      },
    },
    local: {
      load: async () => ({ base: state.base, local: state.local }),
    },
    remote: {
      fetch: async () => {
        if (state.failFetch) throw new Error('sin red');
        return state.remote;
      },
      push: async (request) => {
        pushes.push(request);
        const result = state.pushResult(request);
        // Servidor idempotente: el efecto se registra una sola vez por operationId.
        if (result.kind === 'confirmed' && !effects.has(request.operationId)) {
          effects.set(request.operationId, request);
        }
        return result;
      },
    },
  };

  return {
    ports,
    state,
    pushes,
    effects,
    queue: () => queue,
    queueIds: () => queue.map((operation) => operation.operationId),
  };
}

describe('syncPendingOperations', () => {
  test('la reasignacion remota llega al servidor sin ser reemplazada', async () => {
    const harness = createHarness([makeOperation('op-1')]);
    harness.state.remote = record(2, { work: work('technician-2', 'assigned'), notes: '' });

    const report = await createSyncService(harness.ports).syncPendingOperations();

    expect(report.outcomes).toEqual([{ operationId: 'op-1', kind: 'synced' }]);
    expect(harness.pushes).toHaveLength(1);
    expect(harness.pushes[0]?.expectedVersion).toBe(2);
    expect(harness.pushes[0]?.fields).toEqual({
      work: work('technician-2', 'assigned'),
      notes: 'Revise el equipo',
    });
  });

  test('retira de la cola solo las operaciones confirmadas', async () => {
    const harness = createHarness([makeOperation('op-1'), makeOperation('op-2')]);
    harness.state.pushResult = (request) =>
      request.operationId === 'op-1' ? { kind: 'confirmed' } : { kind: 'not_confirmed' };

    const report = await createSyncService(harness.ports).syncPendingOperations();

    expect(report.outcomes).toEqual([
      { operationId: 'op-1', kind: 'synced' },
      { operationId: 'op-2', kind: 'failed', reason: 'not_confirmed' },
    ]);
    expect(report.removed).toEqual(['op-1']);
    expect(report.pending).toEqual(['op-2']);
    expect(harness.queueIds()).toEqual(['op-2']);
  });

  test('un conflicto se informa y conserva la operacion original en la cola', async () => {
    const operation = makeOperation('op-conflict');
    const harness = createHarness([operation]);
    harness.state.local = record(1, { work: work('technician-1', 'in_progress'), notes: '' });
    harness.state.remote = record(2, { work: work('technician-2', 'assigned'), notes: '' });

    const report = await createSyncService(harness.ports).syncPendingOperations();

    expect(report.outcomes).toEqual([{ operationId: 'op-conflict', kind: 'conflict', fields: ['work'] }]);
    expect(report.removed).toEqual([]);
    expect(report.pending).toEqual(['op-conflict']);
    expect(harness.pushes).toHaveLength(0);
    expect(harness.queue()).toEqual([operation]);
    expect(harness.queue()[0]).toBe(operation);
  });

  test('un error de red deja la operacion pendiente', async () => {
    const operation = makeOperation('op-1');
    const harness = createHarness([operation]);
    harness.state.failFetch = true;

    const report = await createSyncService(harness.ports).syncPendingOperations();

    expect(report.outcomes).toEqual([{ operationId: 'op-1', kind: 'failed', reason: 'error' }]);
    expect(harness.pushes).toHaveLength(0);
    expect(harness.queue()).toEqual([operation]);
  });

  test('los duplicados de la cola se envian una sola vez', async () => {
    const harness = createHarness([makeOperation('op-1'), makeOperation('op-1', 'otra copia')]);

    const report = await createSyncService(harness.ports).syncPendingOperations();

    expect(report.outcomes).toEqual([{ operationId: 'op-1', kind: 'synced' }]);
    expect(harness.pushes).toHaveLength(1);
    expect(harness.effects.size).toBe(1);
    expect(harness.queueIds()).toEqual([]);
  });

  test('el reintento tras un fallo al limpiar la cola no duplica el efecto', async () => {
    const harness = createHarness([makeOperation('op-1')]);
    const service = createSyncService(harness.ports);

    harness.state.failComplete = true;
    const first = await service.syncPendingOperations();
    expect(first.outcomes).toEqual([{ operationId: 'op-1', kind: 'failed', reason: 'error' }]);
    expect(harness.queueIds()).toEqual(['op-1']);

    harness.state.failComplete = false;
    const second = await service.syncPendingOperations();
    expect(second.outcomes).toEqual([{ operationId: 'op-1', kind: 'synced' }]);

    expect(harness.pushes.map((push) => push.operationId)).toEqual(['op-1', 'op-1']);
    expect(harness.effects.size).toBe(1);
    expect(harness.queueIds()).toEqual([]);
  });

  test('conserva intactas las operaciones que siguen pendientes', async () => {
    const operations = [makeOperation('op-1'), makeOperation('op-2')];
    const harness = createHarness(operations);
    harness.state.pushResult = () => ({ kind: 'not_confirmed' });
    const before = JSON.stringify(operations);

    await createSyncService(harness.ports).syncPendingOperations();

    expect(JSON.stringify(harness.queue())).toBe(before);
    expect(harness.queueIds()).toEqual(['op-1', 'op-2']);
  });

  test('con la cola vacia no hace nada', async () => {
    const harness = createHarness([]);
    const report = await createSyncService(harness.ports).syncPendingOperations();
    expect(report).toEqual({ outcomes: [], removed: [], pending: [] });
    expect(harness.pushes).toHaveLength(0);
  });
});

describe('adaptador de aplicacion', () => {
  const healthReader = { check: async () => 'available' as const };

  test('incidentToSyncRecord agrupa asignacion y estado en el campo work', () => {
    const incident: Incident = {
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
    expect(incidentToSyncRecord(incident, 3)).toEqual({
      id: 'campus-inc-001',
      version: 3,
      fields: {
        title: 'Sin conexion en laboratorio ficticio',
        description: 'Sin conexion en laboratorio ficticio',
        category: 'connectivity',
        priority: 'medium',
        locationLabel: 'Edificio de prueba A',
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      },
    });
  });

  test('createCampusOpsServices expone syncPendingOperations conectado a los puertos', async () => {
    const harness = createHarness([makeOperation('op-1')]);
    const services = createCampusOpsServices({
      incidentGateway: createInMemoryIncidentGateway(),
      backendHealthReader: healthReader,
      newOperationKey: () => 'key-1',
      sync: harness.ports,
    });

    const report = await services.syncPendingOperations();

    expect(report.removed).toEqual(['op-1']);
    expect(harness.queueIds()).toEqual([]);
  });

  test('sin puertos de sincronizacion devuelve un reporte vacio', async () => {
    const services = createCampusOpsServices({
      incidentGateway: createInMemoryIncidentGateway(),
      backendHealthReader: healthReader,
      newOperationKey: () => 'key-1',
    });
    expect(await services.syncPendingOperations()).toEqual({ outcomes: [], removed: [], pending: [] });
  });
});