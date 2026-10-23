import { PENDING_OPERATION_STATUSES, type PendingOperation } from './types';

export type ValidationResult = Readonly<{ ok: true } | { ok: false; errors: readonly string[] }>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Valida un registro individual. No lanza: devuelve la lista de errores. */
export function validatePendingOperation(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['registro no es un objeto'] };
  }
  const op = input as Record<string, unknown>;

  if (!isNonEmptyString(op.operationId)) errors.push('operationId requerido');
  if (!isNonEmptyString(op.incidentId)) errors.push('incidentId requerido');
  if (!isNonEmptyString(op.authorId)) errors.push('authorId requerido');
  if (typeof op.baseVersion !== 'number' || !Number.isInteger(op.baseVersion) || op.baseVersion < 0) {
    errors.push('baseVersion debe ser entero >= 0');
  }
  if (typeof op.notes !== 'string') errors.push('notes debe ser texto');
  if (!Array.isArray(op.photoRefs) || !op.photoRefs.every(isNonEmptyString)) {
    errors.push('photoRefs debe ser lista de textos no vacios');
  }
  if (!isNonEmptyString(op.createdAt) || Number.isNaN(Date.parse(op.createdAt))) {
    errors.push('createdAt debe ser fecha ISO');
  }
  if (!(PENDING_OPERATION_STATUSES as readonly unknown[]).includes(op.status)) {
    errors.push('status invalido');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function isPendingOperation(input: unknown): input is PendingOperation {
  return validatePendingOperation(input).ok;
}

/** Valida la cola completa, incluyendo unicidad de operationId. */
export function validateQueue(queue: readonly unknown[]): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  queue.forEach((item, index) => {
    const result = validatePendingOperation(item);
    if (!result.ok) {
      result.errors.forEach((e) => errors.push(`[${index}] ${e}`));
      return;
    }
    const id = (item as PendingOperation).operationId;
    if (seen.has(id)) errors.push(`[${index}] operationId duplicado: ${id}`);
    seen.add(id);
  });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
