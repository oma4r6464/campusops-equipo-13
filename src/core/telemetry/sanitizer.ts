export const SENSITIVE_KEYS = new Set([
  'authorization', 'password', 'token', 'accesstoken', 'refreshtoken', 'email',
  'displayname', 'name', 'userid', 'reporterid', 'technicianid', 'assignedtechnicianid',
  'location', 'latitude', 'longitude', 'photos', 'evidence', 'internalcomments', 'assignmenthistory'
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

export function sanitizeTelemetry(input: unknown): unknown {
  if (input === null || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeTelemetry(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = normalizeKey(key);
    if (SENSITIVE_KEYS.has(normalized)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeTelemetry(value);
    }
  }

  return result;
}
