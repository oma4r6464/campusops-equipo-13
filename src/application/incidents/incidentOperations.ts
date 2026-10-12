import {
  authorizeOperation,
  isProfileAllowed,
  requiresAssignment,
  type TransitionOperation,
} from '../../domain/incidents/authorization';
import type { Incident, NewIncidentDraft } from '../../domain/incidents/types';
import type { SessionReader } from '../session/session';
import type {
  AuthorizationFailure,
  IncidentActionGateway,
  IncidentActionResult,
} from './incidentActionGateway';
import type { IncidentCreateResult, IncidentGateway } from './incidentGateway';
import { createIncidentUseCases } from './incidentUseCases';

export type IncidentOperations = Readonly<{
  createIncident(
    draft: NewIncidentDraft,
    operationKey: string,
  ): Promise<IncidentCreateResult | AuthorizationFailure>;
  startIncident(id: string, operationKey: string): Promise<IncidentActionResult>;
  resolveIncident(id: string, diagnosis: string, operationKey: string): Promise<IncidentActionResult>;
  closeIncident(id: string, operationKey: string): Promise<IncidentActionResult>;
  reopenIncident(id: string, operationKey: string): Promise<IncidentActionResult>;
}>;

export function createIncidentOperations(
  deps: Readonly<{
    session: SessionReader;
    incidents: IncidentGateway;
    actions: IncidentActionGateway;
  }>,
): IncidentOperations {
  const base = createIncidentUseCases(deps.incidents);

  async function transition(
    operation: TransitionOperation,
    id: string,
    operationKey: string,
    diagnosis: string | null,
  ): Promise<IncidentActionResult> {
    const actor = deps.session.currentActor();
    if (actor === null) return { kind: 'unauthenticated' };
    if (!isProfileAllowed(actor.profile, operation)) {
      return { kind: 'forbidden', reason: 'profile_not_allowed' };
    }

    let incident: Incident | null = null;
    if (requiresAssignment(operation)) {
      const detail = await deps.incidents.get(id);
      if (detail.kind === 'rejected' && detail.status === 403) {
        return { kind: 'forbidden', reason: 'server_denied' };
      }
      if (detail.kind === 'null_payload') return { kind: 'malformed' };
      if (detail.kind !== 'success') return detail;
      incident = detail.incident;
    }

    const decision = authorizeOperation(actor, operation, incident);
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason };

    if (operation === 'resolve' && (diagnosis === null || diagnosis.trim().length === 0)) {
      return { kind: 'invalid', field: 'diagnosis' };
    }

    return deps.actions.perform({
      id,
      operation,
      diagnosis: diagnosis === null ? null : diagnosis.trim(),
      operationKey,
    });
  }

  return {
    async createIncident(draft, operationKey) {
      const actor = deps.session.currentActor();
      if (actor === null) return { kind: 'unauthenticated' };
      const decision = authorizeOperation(actor, 'create', null);
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason };
      return base.createIncident(draft, operationKey);
    },
    startIncident: (id, key) => transition('start', id, key, null),
    resolveIncident: (id, diagnosis, key) => transition('resolve', id, key, diagnosis),
    closeIncident: (id, key) => transition('close', id, key, null),
    reopenIncident: (id, key) => transition('reopen', id, key, null),
  };
}