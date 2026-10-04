import type { Incident, NewIncidentDraft } from '../../domain/incidents/types';

/**
 * Fallos publicos y distinguibles. Ninguno transporta payload, tokens, ubicacion ni
 * comentarios internos: solo la clase de fallo (y el status HTTP numerico en `rejected`).
 */
export type IncidentFailure =
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'server_error' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'rejected'; status: number }>
  | Readonly<{ kind: 'unavailable' }>;

export type IncidentListResult =
  | Readonly<{ kind: 'success'; incidents: readonly Incident[]; omittedWithoutPayload: number }>
  | IncidentFailure;

export type IncidentDetailResult =
  | Readonly<{ kind: 'success'; incident: Incident }>
  /** payload: null es una respuesta valida; no se inventan datos de incidencia. */
  | Readonly<{ kind: 'null_payload'; id: string; version: number }>
  | IncidentFailure;

export type IncidentCreateResult =
  | Readonly<{ kind: 'success'; incident: Incident }>
  | Readonly<{ kind: 'invalid'; fields: readonly (keyof NewIncidentDraft)[] }>
  | IncidentFailure;

/** Puerto que implementa la infraestructura (cloud o memoria). Nunca lanza: devuelve resultados. */
export interface IncidentGateway {
  list(): Promise<IncidentListResult>;
  get(id: string): Promise<IncidentDetailResult>;
  create(draft: NewIncidentDraft, operationKey: string): Promise<IncidentCreateResult>;
}
