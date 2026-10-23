/**
 * @jest-environment node
 *
 * Semana 08: persistencia durable, reinicio, migracion y falla transaccional.
 * Usa SQLite real (node:sqlite) sobre archivos temporales y solo datos ficticios.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DuplicateOperationError } from '../src/application/offline/localStore';
import { createOfflineQueue } from '../src/application/offline/offlineQueue';
import type { StoredIncident } from '../src/domain/offline/types';
import { bootstrapPersistence } from '../src/infrastructure/persistence/bootstrap';
import { MIGRATIONS, type Migration } from '../src/infrastructure/persistence/migrations/migrations';
import { MigrationError, runMigrations } from '../src/infrastructure/persistence/migrations/runMigrations';
import { createNodeSqliteDriver } from '../src/infrastructure/persistence/nodeSqliteDriver';
import { SqliteLocalStore } from '../src/infrastructure/persistence/sqliteLocalStore';

const FAKE_INCIDENT: StoredIncident = {
  id: 'fake-inc-001',
  title: 'Proyector ficticio sin imagen',
  description: 'Dato de prueba, no corresponde a un caso real',
  category: 'equipment',
  status: 'assigned',
  priority: 'medium',
  locationLabel: 'Edificio de prueba A',
  reporterProfile: 'reporter',
  assignedTechnicianId: 'tech-demo-01',
  updatedAt: null,
  version: 3,
};

const PHOTO_A = 'file:///app-private/photos/fake-0001.jpg';
const PHOTO_B = 'file:///app-private/photos/fake-0002.jpg';

let dir: string;
let dbPath: string;
const driver = () => Promise.resolve(createNodeSqliteDriver(dbPath));

function sequentialIds() {
  let n = 0;
  return () => `op-demo-${String(++n).padStart(4, '0')}`;
}
const fixedNow = () => new Date('2026-10-23T08:00:00.000Z');

/** Volcado logico completo (esquema + version + filas) leido con una conexion independiente. */
function dump(path: string) {
  const db = new DatabaseSync(path);
  try {
    const userVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    const schema = db
      .prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();
    const tables = (schema as { type: string; name: string }[]).filter((s) => s.type === 'table');
    const rows = Object.fromEntries(
      tables.map((t) => [t.name, db.prepare(`SELECT * FROM ${t.name} ORDER BY rowid`).all()]),
    );
    return { userVersion, schema, rows };
  } finally {
    db.close();
  }
}

/** Crea una base en v1 con datos ficticios en el formato antiguo (`note`, sin fotos). */
async function seedV1() {
  const store = new SqliteLocalStore(driver);
  await store.open();
  await runMigrations(store, { targetVersion: 1 });
  await store.sqlTransaction(async (db) => {
    await db.run('INSERT INTO incidents (id, version, data) VALUES (?, ?, ?)', [
      FAKE_INCIDENT.id,
      FAKE_INCIDENT.version,
      JSON.stringify({ ...FAKE_INCIDENT, version: undefined }),
    ]);
    await db.run(
      `INSERT INTO pending_operations (operation_id, incident_id, base_version, author_id, note, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['op-legacy-0001', FAKE_INCIDENT.id, 3, 'tech-demo-01', 'Nota v1 ficticia', '2026-10-01T10:00:00.000Z', 'pending'],
    );
    await db.run(
      `INSERT INTO pending_operations (operation_id, incident_id, base_version, author_id, note, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['op-legacy-0002', FAKE_INCIDENT.id, 3, 'tech-demo-02', 'Segunda nota v1', '2026-10-01T10:05:00.000Z', 'failed'],
    );
  });
  await store.close();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'campusops-w08-'));
  dbPath = join(dir, 'campusops.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('reinicio', () => {
  test('la cola sobrevive al reinicio con identidad, version base, autor, notas y fotos', async () => {
    const first = await bootstrapPersistence(driver);
    expect(first.migration).toMatchObject({ from: 0, to: 2 });
    const queue = createOfflineQueue({ store: first.store, newOperationId: sequentialIds(), now: fixedNow });
    await queue.saveIncidents([FAKE_INCIDENT]);
    const a = await queue.enqueue({
      incidentId: FAKE_INCIDENT.id,
      authorId: 'tech-demo-01',
      notes: 'Se reviso cable HDMI (ficticio)',
      photoRefs: [PHOTO_A, PHOTO_B],
    });
    const b = await queue.enqueue({
      incidentId: FAKE_INCIDENT.id,
      authorId: 'tech-demo-01',
      notes: '',
      photoRefs: [],
    });
    await first.store.close(); // simula cierre del proceso

    const second = await bootstrapPersistence(driver);
    expect(second.migration.applied).toEqual([]); // ya estaba en v2
    expect(second.state.queue).toEqual([a, b]); // mismo orden FIFO y mismos campos
    expect(second.state.queue[0]).toMatchObject({
      operationId: 'op-demo-0001',
      incidentId: 'fake-inc-001',
      baseVersion: 3,
      authorId: 'tech-demo-01',
      notes: 'Se reviso cable HDMI (ficticio)',
      photoRefs: [PHOTO_A, PHOTO_B],
    });
    expect(second.state.incidents).toEqual([FAKE_INCIDENT]);
    await second.store.close();
  });

  test('una operacion interrumpida en syncing vuelve a pending tras reiniciar', async () => {
    const first = await bootstrapPersistence(driver);
    const queue = createOfflineQueue({ store: first.store, newOperationId: sequentialIds(), now: fixedNow });
    await queue.saveIncidents([FAKE_INCIDENT]);
    const op = await queue.enqueue({ incidentId: FAKE_INCIDENT.id, authorId: 'tech-demo-01', notes: 'x', photoRefs: [] });
    await queue.markSyncing(op.operationId);
    await first.store.close();

    const second = await bootstrapPersistence(driver);
    expect(second.state.queue).toEqual([{ ...op, status: 'pending' }]);
    await second.store.close();
  });

  test('operationId duplicado se rechaza sin dejar cambios parciales', async () => {
    const { store } = await bootstrapPersistence(driver);
    const queue = createOfflineQueue({ store, newOperationId: () => 'op-demo-fixed', now: fixedNow });
    await queue.saveIncidents([FAKE_INCIDENT]);
    await queue.enqueue({ incidentId: FAKE_INCIDENT.id, authorId: 'tech-demo-01', notes: 'uno', photoRefs: [] });
    await expect(
      queue.enqueue({ incidentId: FAKE_INCIDENT.id, authorId: 'tech-demo-02', notes: 'dos', photoRefs: [] }),
    ).rejects.toBeInstanceOf(DuplicateOperationError);
    expect(await store.queue.list()).toHaveLength(1);
    expect((await store.queue.list())[0]?.notes).toBe('uno');
    await store.close();
  });
});

describe('migracion', () => {
  test('v1 -> v2 conserva todas las filas; note pasa a notes y photoRefs inicia vacio', async () => {
    await seedV1();
    const before = dump(dbPath);
    expect(before.userVersion).toBe(1);

    const { store, migration, state } = await bootstrapPersistence(driver);
    expect(migration).toEqual({ from: 1, to: 2, applied: ['v2-notes-and-photo-refs'] });
    expect(state.queue).toEqual([
      {
        operationId: 'op-legacy-0001',
        incidentId: 'fake-inc-001',
        baseVersion: 3,
        authorId: 'tech-demo-01',
        notes: 'Nota v1 ficticia',
        photoRefs: [],
        createdAt: '2026-10-01T10:00:00.000Z',
        status: 'pending',
      },
      {
        operationId: 'op-legacy-0002',
        incidentId: 'fake-inc-001',
        baseVersion: 3,
        authorId: 'tech-demo-02',
        notes: 'Segunda nota v1',
        photoRefs: [],
        createdAt: '2026-10-01T10:05:00.000Z',
        status: 'failed',
      },
    ]);
    expect(state.incidents).toEqual([FAKE_INCIDENT]);

    // Tras migrar, la cola acepta fotos.
    const queue = createOfflineQueue({ store, newOperationId: sequentialIds(), now: fixedNow });
    const op = await queue.enqueue({ incidentId: FAKE_INCIDENT.id, authorId: 'tech-demo-01', notes: 'post', photoRefs: [PHOTO_A] });
    expect((await store.queue.get(op.operationId))?.photoRefs).toEqual([PHOTO_A]);
    await store.close();

    const after = dump(dbPath);
    expect(after.userVersion).toBe(2);
    expect((after.rows.pending_operations as unknown[]).length).toBe(3);
  });

  test('migrar dos veces es idempotente', async () => {
    const first = await bootstrapPersistence(driver);
    expect(await runMigrations(first.store)).toEqual({ from: 2, to: 2, applied: [] });
    await first.store.close();
  });

  test('un esquema mas nuevo que la app no se degrada', async () => {
    const { store } = await bootstrapPersistence(driver);
    await store.setSchemaVersion(99);
    await store.close();
    const before = dump(dbPath);
    await expect(bootstrapPersistence(driver)).rejects.toBeInstanceOf(MigrationError);
    expect(dump(dbPath)).toEqual(before);
  });
});

describe('falla transaccional', () => {
  test('falla inyectada tras aplicar v2 hace rollback completo: sin estado parcial', async () => {
    await seedV1();
    const before = dump(dbPath);

    const error = await bootstrapPersistence(driver, {
      afterStep: (version) => {
        if (version === 2) throw new Error('falla simulada antes del COMMIT');
      },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MigrationError);
    expect(error).toMatchObject({ fromVersion: 1, failedVersion: 2 });
    const after = dump(dbPath);
    expect(after).toEqual(before); // mismo esquema, misma version y mismas filas
    expect(after.userVersion).toBe(1);
    expect(JSON.stringify(after.schema)).toContain('note ');
    expect(JSON.stringify(after.schema)).not.toContain('photo_refs');

    // Recuperacion segura: un arranque normal posterior completa la migracion sin perder datos.
    const retry = await bootstrapPersistence(driver);
    expect(retry.migration).toMatchObject({ from: 1, to: 2 });
    expect(retry.state.queue.map((o) => [o.operationId, o.notes, o.authorId, o.baseVersion])).toEqual([
      ['op-legacy-0001', 'Nota v1 ficticia', 'tech-demo-01', 3],
      ['op-legacy-0002', 'Segunda nota v1', 'tech-demo-02', 3],
    ]);
    await retry.store.close();
  });

  test('migracion con SQL roto a mitad de camino revierte el DDL ya ejecutado', async () => {
    await seedV1();
    const before = dump(dbPath);
    const brokenV2: Migration = {
      version: 2,
      name: 'broken',
      async up(db) {
        await db.exec('ALTER TABLE pending_operations RENAME COLUMN note TO notes');
        await db.exec('ALTER TABLE pending_operations ADD COLUMN photo_refs TEXT NOT NULL DEFAULT \'[]\'');
        await db.exec('ALTER TABLE tabla_inexistente ADD COLUMN x TEXT'); // falla real de SQLite
      },
    };

    await expect(
      bootstrapPersistence(driver, { migrations: [MIGRATIONS[0]!, brokenV2] }),
    ).rejects.toMatchObject({ name: 'MigrationError', failedVersion: 2 });
    expect(dump(dbPath)).toEqual(before);
  });
});
