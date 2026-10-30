import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { selectIncidentLocation as selectLocation } from '../campusops/locationValidation';
import { parseRemoteEnvelope } from '../api/remoteResource';
import { redactForTelemetry as redactTelemetry } from '../security/redactForTelemetry';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

export function redactForTelemetry(input: unknown): unknown {
  return redactTelemetry(input);
}

export function parseRemoteResource(input: unknown): ParseResult {
  return parseRemoteEnvelope(input);
}

export function coordinateRefresh(_events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  let status: 'anonymous' | 'authenticated' = 'anonymous';
  let activeGeneration: number | null = null;
  let persistedToken: string | null = null;
  let refreshInFlight = false;
  let sessionEpoch = 0;
  let refreshEpoch = -1;
  let refreshCalls = 0;
  const pendingRequestIds: string[] = [];
  const retriedRequestIds: string[] = [];
  const seenRequestIds = new Set<string>();

  for (const event of _events) {
    if (event.type === 'logout') {
      sessionEpoch += 1;
      status = 'anonymous';
      activeGeneration = null;
      persistedToken = null;
      refreshInFlight = false;
      refreshEpoch = -1;
      pendingRequestIds.length = 0;
      continue;
    }

    if (event.type === 'request401') {
      if (event.requestId && (seenRequestIds.has(event.requestId) || retriedRequestIds.includes(event.requestId))) {
        continue;
      }
      if (event.attempt !== undefined && event.attempt >= 1) {
        continue;
      }
      if (event.requestId) {
        pendingRequestIds.push(event.requestId);
        seenRequestIds.add(event.requestId);
      }

      if (!refreshInFlight) {
        refreshInFlight = true;
        refreshEpoch = sessionEpoch;
        refreshCalls += 1;
      }
      continue;
    }

    if (event.type === 'refreshSucceeded') {
      if (!refreshInFlight || refreshEpoch !== sessionEpoch) {
        continue;
      }
      if (
        typeof event.generation !== 'number'
        || (activeGeneration !== null && event.generation <= activeGeneration)
      ) {
        refreshInFlight = false;
        pendingRequestIds.length = 0;
        continue;
      }
      status = 'authenticated';
      activeGeneration = event.generation;
      persistedToken = event.token ?? null;
      refreshInFlight = false;
      retriedRequestIds.push(...pendingRequestIds);
      pendingRequestIds.length = 0;
      continue;
    }

    if (event.type === 'refreshFailed') {
      if (!refreshInFlight || refreshEpoch !== sessionEpoch) {
        continue;
      }
      status = 'anonymous';
      activeGeneration = null;
      persistedToken = null;
      refreshInFlight = false;
      pendingRequestIds.length = 0;
    }
  }

  return {
    status,
    activeGeneration,
    refreshCalls,
    retriedRequestIds,
    persistedToken,
  };
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJson);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export function resolveSync(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  const keys = new Set([...Object.keys(base.fields), ...Object.keys(local.fields), ...Object.keys(remote.fields)]);
  const conflicts: string[] = [];
  const merged: Record<string, unknown> = {};

  for (const key of keys) {
    const baseValue = base.fields[key];
    const localValue = local.fields[key];
    const remoteValue = remote.fields[key];
    const localChanged = !jsonEqual(localValue, baseValue);
    const remoteChanged = !jsonEqual(remoteValue, baseValue);

    if (localChanged && remoteChanged && !jsonEqual(localValue, remoteValue)) {
      conflicts.push(key);
      continue;
    }

    merged[key] = localChanged ? localValue : remoteValue;
  }

  if (conflicts.length > 0) {
    return { kind: 'conflict', fields: conflicts.sort() };
  }

  return { kind: 'merged', fields: merged };
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const operation of operations) {
    if (!seen.has(operation.operationId)) {
      seen.add(operation.operationId);
      result.push(operation);
    }
  }

  return result;
}

export function planRetry(_input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>): Readonly<{ retry: boolean; delayMs: number; requiresStableIdempotencyKey: boolean }> {
  const requiresStableIdempotencyKey = _input.method === 'POST'
    && !(_input.idempotencyKey && _input.idempotencyKey.trim().length > 0);
  if (requiresStableIdempotencyKey) {
    return { retry: false, delayMs: 0, requiresStableIdempotencyKey: true };
  }

  if (!Number.isInteger(_input.attempt) || _input.attempt < 1 || _input.attempt >= 4) {
    return { retry: false, delayMs: 0, requiresStableIdempotencyKey: false };
  }

  const retryable = _input.status === 'timeout'
    || _input.status === 408
    || _input.status === 429
    || (_input.status >= 500 && _input.status <= 599);
  if (!retryable) return { retry: false, delayMs: 0, requiresStableIdempotencyKey: false };

  const retryAfterIsValid = _input.retryAfterMs !== undefined
    && Number.isFinite(_input.retryAfterMs)
    && _input.retryAfterMs >= 0;
  const delayMs = retryAfterIsValid
    ? _input.retryAfterMs
    : Math.min(8000, 250 * (2 ** (_input.attempt - 1)));
  return { retry: true, delayMs, requiresStableIdempotencyKey: false };
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{ state: 'success' | 'error' | 'loading'; value?: unknown; error?: string }> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{ status: 'available' | 'denied' | 'blocked'; resourceActive: boolean }> {
  return pending('reducePermissionLifecycle');
}

/** Week 09: uses only validated provider coordinates and otherwise preserves manual input. */
export function selectIncidentLocation(provider: unknown, manualLabel: string): IncidentLocation {
  return selectLocation(provider, manualLabel);
}
