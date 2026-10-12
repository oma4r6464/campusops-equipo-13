import type {
  AuthorizationDenial,
  TransitionOperation,
} from '../../domain/incidents/authorization';
import type { Incident } from '../../domain/incidents/types';
import type { IncidentFailure } from './incidentGateway';

/** Errores de autorizacion publicos y distinguibles: no transportan token, actor ni payload. */
export type AuthorizationFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'forbidden'; reason: AuthorizationDenial }>;

export type IncidentActionRequest = Readonly<{
  id: string;
  operation: TransitionOperation;
  diagnosis: string | null;
  operationKey: string;
}>;

export type IncidentActionResult =
  | Readonly<{ kind: 'success'; incident: Incident }>
  | Readonly<{ kind: 'invalid'; field: 'diagnosis' }>
  | Readonly<{ kind: 'conflict' }>
  | AuthorizationFailure
  | IncidentFailure;

/** Puerto separado de IncidentGateway para no romper los dobles de Semana 5. */
export interface IncidentActionGateway {
  perform(request: IncidentActionRequest): Promise<IncidentActionResult>;
}