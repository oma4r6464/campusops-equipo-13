export type RetryInput = Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>;

export type RetryPlan = Readonly<{
  retry: boolean;
  delayMs: number;
  requiresStableIdempotencyKey: boolean;
}>;

export type RetryPolicy = Readonly<{
  /** Espera base; se duplica en cada intento (progresiva). */
  baseDelayMs: number;
  /** Tope de la espera progresiva (finita). */
  maxDelayMs: number;
  /** Tope aceptado para Retry-After: si el servicio pide mas, no se reintenta. */
  maxRetryAfterMs: number;
}>;

/** A partir de este intento ya no se reintenta (intentos 1 a 3 si pueden). */
export const MAX_RETRY_ATTEMPT = 4;
/** Igual que el backend didactico: una clave de menos de 8 caracteres no es identidad estable. */
export const MIN_IDEMPOTENCY_KEY_LENGTH = 8;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 250,
  maxDelayMs: 2000,
  maxRetryAfterMs: 5000,
};

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);
const NO_RETRY: RetryPlan = { retry: false, delayMs: 0, requiresStableIdempotencyKey: false };

function limit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function hasStableKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.trim().length >= MIN_IDEMPOTENCY_KEY_LENGTH;
}

export function planRetry(input: RetryInput, policy: Partial<RetryPolicy> = {}): RetryPlan {
  const retryable = input.status === 'timeout' || RETRYABLE_STATUSES.has(input.status);
  if (!retryable) return NO_RETRY;

  if (input.method === 'POST' && !hasStableKey(input.idempotencyKey)) {
    return { retry: false, delayMs: 0, requiresStableIdempotencyKey: true };
  }

  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt >= MAX_RETRY_ATTEMPT) {
    return NO_RETRY;
  }

  const baseDelayMs = limit(policy.baseDelayMs, DEFAULT_RETRY_POLICY.baseDelayMs);
  const maxDelayMs = limit(policy.maxDelayMs, DEFAULT_RETRY_POLICY.maxDelayMs);
  const maxRetryAfterMs = limit(policy.maxRetryAfterMs, DEFAULT_RETRY_POLICY.maxRetryAfterMs);

  const retryAfterMs = input.retryAfterMs;
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    if (retryAfterMs > maxRetryAfterMs) return NO_RETRY;
    return { retry: true, delayMs: retryAfterMs, requiresStableIdempotencyKey: false };
  }

  const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (input.attempt - 1));
  return { retry: true, delayMs, requiresStableIdempotencyKey: false };
}