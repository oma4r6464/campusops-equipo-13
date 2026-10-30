import { planRetry, selectIncidentLocation } from '../../src/course-evaluation';

test('CampusOps accepts valid geocoding and otherwise keeps manual incident location', () => {
  expect(selectIncidentLocation({ label: 'Zona de prueba', latitude: 0, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'provider', label: 'Zona de prueba', latitude: 0, longitude: 0,
  });
  for (const value of [
    null,
    { status: 429 },
    { error: 'timeout' },
    { label: 'Incompleta' },
    { label: 'Inválida', latitude: 91, longitude: 0 },
    { label: 'Inválida', latitude: Number.NaN, longitude: 0 },
    { label: 123, latitude: 0, longitude: 0 },
    { label: '   ', latitude: 0, longitude: 0 },
  ]) {
    expect(selectIncidentLocation(value, '  Edificio manual, junto al patio  ')).toEqual({
      source: 'manual',
      label: '  Edificio manual, junto al patio  ',
    });
  }
});

test('acepta los límites de coordenadas geográficas', () => {
  expect(selectIncidentLocation({ label: 'Límite ficticio', latitude: -90, longitude: 180 }, 'Manual')).toEqual({
    source: 'provider', label: 'Límite ficticio', latitude: -90, longitude: 180,
  });
});

test('CampusOps can retry a lost resolution response only with a stable operation key', () => {
  expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: 'resolve-campus-inc-001-op-1' })).toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
});

test('retries bounded idempotent failures and honors Retry-After', () => {
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 })).toEqual({
    retry: true,
    delayMs: 800,
    requiresStableIdempotencyKey: false,
  });
  expect(planRetry({ method: 'GET', status: 'timeout', attempt: 4 })).toMatchObject({ retry: false });
});

test('does not retry a POST without stable idempotency identity', () => {
  expect(planRetry({ method: 'POST', status: 503, attempt: 1 })).toEqual({
    retry: false,
    delayMs: 0,
    requiresStableIdempotencyKey: true,
  });
});
