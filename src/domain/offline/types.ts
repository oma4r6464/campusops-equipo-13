import type { Incident } from '../incidents/types';

export const PENDING_OPERATION_STATUSES = ['pending', 'syncing', 'failed'] as const;
export type PendingOperationStatus = (typeof PENDING_OPERATION_STATUSES)[number];

/**
 * Registro pendiente de la cola offline.
 * Debe sobrevivir reinicios con identidad (operationId), version base y autor.
 */
export type PendingOperation = Readonly<{
  operationId: string;
  incidentId: string;
  baseVersion: number;
  authorId: string;
  notes: string;
  photoRefs: readonly string[];
  createdAt: string;
  status: PendingOperationStatus;
}>;

/** Incidencia tal como se guarda localmente: agrega version para control optimista. */
export type StoredIncident = Incident & Readonly<{ version: number }>;
