export type SyncFields = Readonly<Record<string, unknown>>;

export type SyncSnapshot = Readonly<{
  id: string;
  version: number;
  fields: SyncFields;
}>;

export type SyncResolution =
  | Readonly<{ kind: 'merged'; fields: SyncFields }>
  | Readonly<{ kind: 'conflict'; fields: readonly string[] }>;

type FieldState = Readonly<{ present: boolean; value: unknown }>;

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Igualdad estructural, insensible al orden de las claves. */
function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isSameValue(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    return (
      keysA.length === Object.keys(b).length &&
      keysA.every((key) => hasOwn(b, key) && isSameValue(a[key], b[key]))
    );
  }
  return false;
}

/** Copia profunda para que el resultado no comparta referencias con las entradas. */
function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) copy[key] = cloneValue(value[key]);
    return copy as T;
  }
  return value;
}

function stateOf(fields: SyncFields, key: string): FieldState {
  return hasOwn(fields, key)
    ? { present: true, value: fields[key] }
    : { present: false, value: undefined };
}

function sameState(a: FieldState, b: FieldState): boolean {
  return a.present === b.present && (!a.present || isSameValue(a.value, b.value));
}


export function resolveSync(
  base: SyncSnapshot,
  local: SyncSnapshot,
  remote: SyncSnapshot,
): SyncResolution {
  const keys = [
    ...new Set([
      ...Object.keys(base.fields),
      ...Object.keys(local.fields),
      ...Object.keys(remote.fields),
    ]),
  ];
  const merged: Record<string, unknown> = {};
  const conflicts: string[] = [];

  for (const key of keys) {
    const baseState = stateOf(base.fields, key);
    const localState = stateOf(local.fields, key);
    const remoteState = stateOf(remote.fields, key);
    const localChanged = !sameState(baseState, localState);
    const remoteChanged = !sameState(baseState, remoteState);

    let chosen: FieldState;
    if (localChanged && remoteChanged) {
      if (!sameState(localState, remoteState)) {
        conflicts.push(key);
        continue;
      }
      chosen = localState;
    } else if (localChanged) {
      chosen = localState;
    } else if (remoteChanged) {
      chosen = remoteState;
    } else {
      chosen = baseState;
    }

    if (chosen.present) merged[key] = cloneValue(chosen.value);
  }

  return conflicts.length > 0
    ? { kind: 'conflict', fields: conflicts }
    : { kind: 'merged', fields: merged };
}