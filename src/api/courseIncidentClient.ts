import { parseRemoteResource } from '../course-evaluation';
import type { ParseResult } from '../course-evaluation/contracts';
import { redactForTelemetry } from '../security/redactForTelemetry';

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

  constructor(kind: IncidentClientErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'IncidentClientError';
    this.kind = kind;
    this.status = status;
  }
}

type ClientOptions = Readonly<{
  baseUrl: string;
  actorId?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onTelemetry?: (event: unknown) => void;
}>;

type IncidentClient = Readonly<{
  list(): Promise<readonly RemoteIncident[]>;
  findById(id: string): Promise<RemoteIncident | null>;
  create(input: Readonly<{ category: string; description: string; location: string }>, idempotencyKey: string): Promise<RemoteIncident>;
}>;

function parseResource(input: unknown): RemoteIncident {
  const parsed: ParseResult = parseRemoteResource(input);
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

export function createCourseIncidentClient(options: ClientOptions): IncidentClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 1000;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: options.accessToken ? `Bearer ${options.accessToken}` : '',
          'X-Course-Actor': options.actorId ?? '',
          ...(init.headers ?? {}),
        },
      });
      if (response.status >= 500) throw new IncidentClientError('server', 'El servidor no esta disponible.', response.status);
      if (!response.ok) throw new IncidentClientError('network', 'No se pudo consultar incidencias.', response.status);
      try {
        return await response.json();
      } catch {
        throw new IncidentClientError('contract', 'La respuesta no contiene JSON valido.');
      }
    } catch (error) {
      const clientError = error instanceof IncidentClientError
        ? error
        : error instanceof DOMException && error.name === 'AbortError'
          ? new IncidentClientError('timeout', 'La consulta excedio el tiempo permitido.')
          : new IncidentClientError('network', 'No se pudo consultar incidencias.');
      options.onTelemetry?.(redactForTelemetry({ kind: clientError.kind, status: clientError.status, attempt: 1 }));
      throw clientError;
    } finally {
      clearTimeout(timeout);
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
  };
}