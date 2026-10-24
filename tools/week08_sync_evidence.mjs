import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const TEST_FILE = 'course-tests/week-08-sync.test.ts';
const OUTPUT = 'reports/week-08/migration-tests.json';
const RAW = '.jest-cache/week-08-sync-results.json';
const COMMAND = `npx jest --no-watchman --cacheDirectory .jest-cache --ci --runInBand ${TEST_FILE}`;

const CHECKS = [
  {
    id: 'sync-merges-independent-changes',
    scenarioType: 'nominal',
    tests: ['combina cambios independientes de campos distintos', 'combina campos agregados por cada lado'],
  },
  {
    id: 'sync-remote-reassignment-preserved',
    scenarioType: 'nominal',
    tests: [
      'la reasignacion remota no es reemplazada por una asignacion local antigua',
      'la reasignacion remota llega al servidor sin ser reemplazada',
    ],
  },
  {
    id: 'sync-work-conflict-detected',
    scenarioType: 'failure',
    tests: ['detecta conflicto cuando work cambia local y remotamente', 'informa todos los campos en conflicto'],
  },
  {
    id: 'sync-conflict-keeps-pending-operation',
    scenarioType: 'failure',
    tests: [
      'un conflicto se informa y conserva la operacion original en la cola',
      'un error de red deja la operacion pendiente',
    ],
  },
  {
    id: 'sync-queue-removes-only-confirmed',
    scenarioType: 'boundary',
    tests: [
      'retira de la cola solo las operaciones confirmadas',
      'conserva intactas las operaciones que siguen pendientes',
    ],
  },
  {
    id: 'sync-operation-id-idempotent',
    scenarioType: 'boundary',
    tests: [
      'conserva la primera aparicion de cada operationId y el orden',
      'los duplicados de la cola se envian una sola vez',
      'el reintento tras un fallo al limpiar la cola no duplica el efecto',
    ],
  },
  {
    id: 'sync-inputs-not-mutated',
    scenarioType: 'boundary',
    tests: [
      'no muta base, local ni remote y el resultado no comparte referencias',
      'no muta la entrada ni devuelve la misma lista',
    ],
  },
];

mkdirSync('.jest-cache', { recursive: true });
spawnSync(
  'npx',
  ['jest', '--no-watchman', '--cacheDirectory', '.jest-cache', '--ci', '--runInBand', TEST_FILE, '--json', `--outputFile=${RAW}`],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

let raw;
try {
  raw = JSON.parse(readFileSync(RAW, 'utf8'));
} catch {
  console.error('No se pudo leer el resultado de Jest.');
  process.exit(1);
}
rmSync(RAW, { force: true });

const assertions = raw.testResults.flatMap((suite) => suite.assertionResults);
const checks = [];
const problems = [];

for (const check of CHECKS) {
  const found = check.tests.map((name) => assertions.find((a) => a.fullName.includes(name)));
  const missing = check.tests.filter((_, index) => found[index] === undefined);
  const failing = found.filter((a) => a !== undefined && a.status !== 'passed');
  if (missing.length > 0) problems.push(`${check.id}: no se encontraron pruebas: ${missing.join('; ')}`);
  if (failing.length > 0) problems.push(`${check.id}: pruebas sin aprobar: ${failing.map((a) => a.title).join('; ')}`);
  if (missing.length > 0 || failing.length > 0) continue;

  checks.push({
    id: check.id,
    status: 'pass',
    scenarioType: check.scenarioType,
    command: COMMAND,
    evidence: `Aprobadas ${found.length} de ${found.length} pruebas: ${found
      .map((a) => `"${a.title}" (${a.duration ?? 0} ms)`)
      .join('; ')}.`,
  });
}

if (problems.length > 0) {
  console.error(`Evidencia no generada:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const commitSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
mkdirSync('reports/week-08', { recursive: true });
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ schemaVersion: 1, week: 8, commitSha, generatedAt: new Date().toISOString(), checks }, null, 2)}\n`,
);
console.log(`Evidencia escrita en ${OUTPUT} (${checks.length} checks).`);