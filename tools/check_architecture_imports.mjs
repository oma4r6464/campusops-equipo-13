import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const extensions = ['.ts', '.tsx', '.js', '.jsx'];

const rules = [
  {
    name: 'ui-no-infrastructure',
    sourcePrefix: 'src/ui/',
    forbiddenPrefixes: ['src/infrastructure/', 'src/api/'],
  },
  {
    name: 'application-no-infrastructure',
    sourcePrefix: 'src/application/',
    forbiddenPrefixes: ['src/infrastructure/', 'src/api/', 'src/ui/'],
  },
  {
    name: 'domain-no-outer-layers',
    sourcePrefix: 'src/domain/',
    forbiddenPrefixes: ['src/application/', 'src/infrastructure/', 'src/api/', 'src/ui/'],
    forbiddenPackages: ['react', 'react-native', 'expo', 'expo-status-bar'],
  },
];

function toRepoPath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function extractImports(source) {
  const matches = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g);
  return Array.from(matches, (match) => match[1]);
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return { kind: 'package', value: specifier };

  const absolute = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    absolute,
    ...extensions.map((extension) => `${absolute}${extension}`),
    ...extensions.map((extension) => path.join(absolute, `index${extension}`)),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? absolute;
  return { kind: 'file', value: toRepoPath(resolved) };
}

const violations = [];

for (const file of walk(sourceRoot).filter((item) => extensions.includes(path.extname(item)))) {
  const repoPath = toRepoPath(file);
  const rule = rules.find((candidate) => repoPath.startsWith(candidate.sourcePrefix));
  if (!rule) continue;

  const imports = extractImports(readFileSync(file, 'utf8'));
  for (const importSpecifier of imports) {
    const resolved = resolveImport(file, importSpecifier);
    if (resolved.kind === 'package' && rule.forbiddenPackages?.includes(resolved.value)) {
      violations.push(`${rule.name}: ${repoPath} imports package ${resolved.value}`);
    }
    if (
      resolved.kind === 'file' &&
      rule.forbiddenPrefixes.some((prefix) => resolved.value.startsWith(prefix))
    ) {
      violations.push(`${rule.name}: ${repoPath} imports ${resolved.value}`);
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'fail', violations }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', checkedRoot: 'src', violations: [] }, null, 2));
