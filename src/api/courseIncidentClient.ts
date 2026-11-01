import { parseRemoteEnvelope } from './remoteResource';
import type { ParseResult } from '../course-evaluation/contracts';
import { redactForTelemetry } from '../security/redactForTelemetry';
import { planRetry, type RetryPolicy } from './retryPlan';

export type RemoteIncident = Readonly<{
  id: string;
  version: number;
  status: string;
  payload: Readonly<Record<string, unknown>> | null;
}>;

export type IncidentClientErrorKind = 'contract' | 'timeout' | 'server' | 'network';

export class IncidentClientError extends Error {
  readonly kind: IncidentClientErrorKind;
  readonly status: number | null;
  readonly retryAfterMs: number | undefined;

  constructor(
    kind: IncidentClientErrorKind,
    message: string,
    status: number | null = null,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'IncidentClientError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

type ClientOptions = Readonly<{
  baseUrl: string;
  actorId?: string;
  accessToken?: string;
  credentials?: () => Readonly<{ actorId: string; accessToken: string }> | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: unknown) => void;
  /** Si se define, activa reintentos acotados (planRetry). Sin esta opcion no se reintenta. */
  retry?: Partial<RetryPolicy>;
  sleepImpl?: (ms: number) => Promise<void>;
}>;

type IncidentClient = Readonly<{
  list(): Promise<readonly RemoteIncident[]>;
  findById(id: string): Promise<RemoteIncident | null>;
  create(input: Readonly<{ category: string; description: string; location: string }>, idempotencyKey: string): Promise<RemoteIncident>;
  perform(id: string, input: Readonly<Record<string, unknown>>, idempotencyKey: string): Promise<RemoteIncident>;
}>;

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function parseResource(input: unknown): RemoteIncident {
  const parsed: ParseResult = parseRemoteEnvelope(input);
  if (!parsed.ok) throw new IncidentClientError('contract', 'Respuesta de incidencia invalida.');
  return parsed.value;
}

function parseItems(input: unknown): readonly RemoteIncident[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || !('items' in input)) {
    throw new IncidentClientError('contract', 'Respuesta de lista invalida.');
  }
  const items = input.items;
  if (!Array.isArray(items)) throw new IncidentClientError('contract', 'Respuesta de lista invalida.');
  return items.map(parseResource);
}

function parseCreated(input: unknown): RemoteIncident {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || !('incident' in input)) {
    throw new IncidentClientError('contract', 'Respuesta de creacion invalida.');
  }
  return parseResource(input.incident);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function toClientError(error: unknown): IncidentClientError {
  if (error instanceof IncidentClientError) return error;
  return isAbortError(error)
    ? new IncidentClientError('timeout', 'La consulta excedio el tiempo permitido.')
    : new IncidentClientError('network', 'No se pudo consultar incidencias.');
}

export function createCourseIncidentClient(options: ClientOptions): IncidentClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 1000;

  const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function requestOnce(path: string, init: RequestInit): Promise<unknown> {
    const identity = options.credentials
    ? options.credentials()
    : { actorId: options.actorId ?? '', accessToken: options.accessToken ?? '' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: identity?.accessToken ? `Bearer ${identity.accessToken}` : '',
          'X-Course-Actor': identity?.actorId ?? '',
          ...(init.headers ?? {}),
        },
      });
      const retryAfterMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? null);
      if (response.status >= 500) throw new IncidentClientError('server', 'El servidor no esta disponible.', response.status, retryAfterMs);
      if (!response.ok) throw new IncidentClientError('network', 'No se pudo consultar incidencias.', response.status, retryAfterMs);
      try {
        return await response.json();
      } catch {
        throw new IncidentClientError('contract', 'La respuesta no contiene JSON valido.');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const method = init.method === 'POST' ? 'POST' : 'GET';
    const idempotencyKey = (init.headers as Record<string, string> | undefined)?.['Idempotency-Key'];
    for (let attempt = 1; ; attempt += 1) {
      const startedAt = Date.now();
      try {
        return await requestOnce(path, init);
      } catch (error) {
        const clientError = toClientError(error);
        const status = clientError.kind === 'timeout' ? 'timeout' : clientError.status;
        const plan = options.retry && status !== null
          ? planRetry(
              {
                method,
                status,
                attempt,
                ...(clientError.retryAfterMs !== undefined ? { retryAfterMs: clientError.retryAfterMs } : {}),
                ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
              },
              options.retry,
            )
          : { retry: false, delayMs: 0 };
        options.onTelemetry?.(redactForTelemetry({
          kind: clientError.kind,
          status: clientError.status,
          attempt,
          ...(options.retry ? { durationMs: Date.now() - startedAt } : {}),
          ...(plan.retry ? { delayMs: plan.delayMs } : {}),
        }));
        if (!plan.retry) throw clientError;
        await sleep(plan.delayMs);
      }
    }
  }

  return {
    list: async () => parseItems(await request('/v1/incidents')),
    findById: async (id) => {
      try {
        return parseResource(await request(`/v1/incidents/${encodeURIComponent(id)}`));
      } catch (error) {
        if (error instanceof IncidentClientError && error.kind === 'network' && error.status === 404) return null;
        throw error;
      }
    },
    create: async (input, idempotencyKey) => parseCreated(await request('/v1/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })),
    perform: async (id, input, idempotencyKey) => parseCreated(await request(
      `/v1/incidents/${encodeURIComponent(id)}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      },
    )),
  };
}