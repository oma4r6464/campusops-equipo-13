import type { JsonObject, ParseResult } from '../course-evaluation/contracts';

/**
 * Valida el sobre remoto `{ id, version, status, payload }` (contrato publico, semanas 5-6).
 * Logica unica y reutilizable: la usan el cliente cloud y el adaptador de `course-evaluation`.
 * - `id` y `status`: cadenas no vacias.
 * - `version`: entero no negativo.
 * - `payload`: objeto (no arreglo) o `null`; `null` es valido y NO se rellena con datos.
 * - Campos futuros del sobre se ignoran y la entrada nunca se muta.
 */
export function parseRemoteEnvelope(input: unknown): ParseResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'contract' };
  }

  const { id, version, status, payload } = input as Record<string, unknown>;
  const payloadIsValid =
    payload === null || (typeof payload === 'object' && !Array.isArray(payload));

  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 0 ||
    typeof status !== 'string' ||
    status.trim().length === 0 ||
    !payloadIsValid
  ) {
    return { ok: false, error: 'contract' };
  }

  return { ok: true, value: { id, version, status, payload: payload as JsonObject | null } };
}
