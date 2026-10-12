import type { Incident, UserProfile } from './types';

export type TransitionOperation = 'start' | 'resolve' | 'close' | 'reopen';
export type IncidentOperation = 'create' | TransitionOperation;

export type Actor = Readonly<{ actorId: string; profile: UserProfile }>;

export type AuthorizationDenial = 'profile_not_allowed' | 'not_assigned' | 'server_denied';

export type AuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: AuthorizationDenial }>;

const ALLOWED_PROFILES: Readonly<Record<IncidentOperation, readonly UserProfile[]>> = {
  create: ['reporter'],
  start: ['technician'],
  resolve: ['technician'],
  close: ['coordinator'],
  reopen: ['coordinator'],
};

const ASSIGNMENT_REQUIRED: readonly IncidentOperation[] = ['start', 'resolve'];

export function isProfileAllowed(profile: UserProfile, operation: IncidentOperation): boolean {
  return ALLOWED_PROFILES[operation].includes(profile);
}

export function requiresAssignment(operation: IncidentOperation): boolean {
  return ASSIGNMENT_REQUIRED.includes(operation);
}

export function authorizeOperation(
  actor: Actor,
  operation: IncidentOperation,
  incident: Incident | null,
): AuthorizationDecision {
  if (!isProfileAllowed(actor.profile, operation)) {
    return { allowed: false, reason: 'profile_not_allowed' };
  }
  if (requiresAssignment(operation) && incident?.assignedTechnicianId !== actor.actorId) {
    return { allowed: false, reason: 'not_assigned' };
  }
  return { allowed: true };
}