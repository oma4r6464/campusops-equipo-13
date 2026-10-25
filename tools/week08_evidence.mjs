#!/usr/bin/env node
/**
 * Genera reports/week-08/migration-tests.json a partir de una ejecucion REAL de Jest.
 * - commitSha = HEAD evaluado (docs/EVIDENCE_CONTRACT.md).
 * - Falla si hay cambios sin commit fuera de reports/ y evidence/, para que el SHA
 *   corresponda exactamente al codigo probado.
 * - Si alguna prueba falla, el reporte la registra como "fail" y el script sale con codigo 1.
 * Uso: npm run evidence:week08
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_FILES = ['course-tests/week-08-persistence.test.ts', 'course-tests/public/week-08.test.ts'];
const OUTPUT = 'reports/week-08/migration-tests.json';
const JEST_ARGS = ['--no-watchman', '--cacheDirectory', '.jest-cache', '--ci', '--runInBand', ...TEST_FILES];
const COMMAND = `npx jest ${JEST_ARGS.join(' ')}`;

/** Titulo de la prueba -> id estable y tipo de escenario. */
const CASES = {
  'la cola sobrevive al reinicio con identidad, version base, autor, notas y fotos': ['queue-survives-restart', 'nominal'],
  'una operacion interrumpida en syncing vuelve a pending tras reiniciar': ['syncing-recovers-after-restart', 'boundary'],
  'operationId duplicado se rechaza sin dejar cambios parciales': ['duplicate-operation-no-partial-state', 'failure'],
  'v1 -> v2 conserva todas las filas; note pasa a notes y photoRefs inicia vacio': ['migration-v1-to-v2-preserves-data', 'nominal'],
  'migrar dos veces es idempotente': ['migration-idempotent', 'boundary'],
  'un esquema mas nuevo que la app no se degrada': ['migration-refuses-downgrade', 'boundary'],
  'falla inyectada tras aplicar v2 hace rollback completo: sin estado parcial': ['migration-injected-failure-rollback', 'failure'],
  'migracion con SQL roto a mitad de camino revierte el DDL ya ejecutado': ['migration-broken-sql-rollback', 'failure'],
  'CampusOps detects offline start versus remote reassignment without mutating either record': ['reassignment-conflict-preserves-records', 'failure'],
  'merges independent field changes and reports same-field conflict': ['independent-changes-merge', 'boundary'],
  'deduplicates a replayed operation by stable identity': ['operation-id-deduplication', 'boundary'],
};

/** Resultado observable esperado que la prueba afirma (se reporta solo si pasa). */
const OBSERVED = {
  'queue-survives-restart':
    'Tras cerrar y reabrir la base SQLite en disco, la cola conserva orden FIFO y op-demo-0001 mantiene incidentId=fake-inc-001, baseVersion=3, authorId=tech-demo-01, notes y photoRefs [fake-0001.jpg, fake-0002.jpg]; la segunda apertura aplica 0 migraciones.',
  'syncing-recovers-after-restart':
    'Una operacion marcada syncing antes del cierre se hidrata como pending con el mismo operationId para reintento idempotente.',
  'duplicate-operation-no-partial-state':
    'El segundo enqueue con op-demo-fixed lanza DuplicateOperationError; la cola sigue con 1 registro y notes="uno".',
  'migration-v1-to-v2-preserves-data':
    'Base v1 con 2 operaciones (columna note) migra a v2: applied=[v2-notes-and-photo-refs], user_version=2, ambas filas conservan operationId, baseVersion=3, authorId y notes; photoRefs=[]; luego acepta photoRefs nuevos (3 filas).',
  'migration-idempotent': 'runMigrations sobre una base ya en v2 devuelve {from:2,to:2,applied:[]}.',
  'migration-refuses-downgrade':
    'Con user_version=99 el arranque lanza MigrationError y el volcado logico de la base queda identico.',
  'migration-injected-failure-rollback':
    'Falla inyectada tras ejecutar v2 y antes del COMMIT: MigrationError{fromVersion:1,failedVersion:2}; esquema, user_version=1 y filas identicos al volcado previo (sigue columna note, sin photo_refs). Un arranque posterior migra 1->2 conservando las 2 operaciones.',
  'migration-broken-sql-rollback':
    'Migracion v2 que renombra columna y agrega photo_refs y luego ejecuta SQL invalido: MigrationError failedVersion=2 y el volcado logico es identico al previo (DDL revertido).',
  'reassignment-conflict-preserves-records':
    'Una reasignacion remota y un inicio local sobre work producen conflict con fields=[work]; base, local y remote no se mutan.',
  'independent-changes-merge':
    'Cambios independientes combinan title local y priority remoto; cambios distintos sobre title producen conflict con fields=[title].',
  'operation-id-deduplication':
    'Al repetir operationId op-1 se conserva la primera entrada y la salida queda [op-1, op-2] sin mutar la entrada.',
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function assertCleanTree() {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((path) => !path.startsWith('reports/') && !path.startsWith('evidence/'));
  if (dirty.length > 0) {
    console.error('Hay cambios sin commit fuera de reports/ y evidence/; el SHA no representaria el codigo probado:');
    dirty.forEach((p) => console.error(`  ${p}`));
    process.exit(2);
  }
}

assertCleanTree();
const commitSha = git('rev-parse', 'HEAD');

const tmp = mkdtempSync(join(tmpdir(), 'w08-evidence-'));
const jsonPath = join(tmp, 'jest.json');
const run = spawnSync('npx', ['jest', ...JEST_ARGS, '--json', '--outputFile', jsonPath], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const result = JSON.parse(readFileSync(jsonPath, 'utf8'));
rmSync(tmp, { recursive: true, force: true });

const assertions = result.testResults.flatMap((file) => file.assertionResults);
const seen = new Set();
const checks = assertions.map((a) => {
  const mapping = CASES[a.title];
  if (!mapping) throw new Error(`Prueba sin id asignado en el script de evidencia: "${a.title}"`);
  const [id, scenarioType] = mapping;
  seen.add(a.title);
  const passed = a.status === 'passed';
  return {
    id,
    status: passed ? 'pass' : 'fail',
    scenarioType,
    command: COMMAND,
    evidence: passed
      ? `${OBSERVED[id]} (${a.duration ?? 0} ms)`
      : `FALLO: ${(a.failureMessages ?? []).join(' | ').slice(0, 500)}`,
  };
});
const missing = Object.keys(CASES).filter((title) => !seen.has(title));
missing.forEach((title) => {
  const [id, scenarioType] = CASES[title];
  checks.push({ id, status: 'fail', scenarioType, command: COMMAND, evidence: 'FALLO: la prueba no se ejecuto.' });
});

const report = {
  schemaVersion: 1,
  week: 8,
  commitSha,
  generatedAt: new Date().toISOString(),
  checks,
};

mkdirSync('reports/week-08', { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
const failed = checks.filter((c) => c.status !== 'pass').length;
console.log(`\n${OUTPUT}: ${checks.length - failed}/${checks.length} pass @ ${commitSha}`);
process.exit(failed > 0 || run.status !== 0 ? 1 : 0);
