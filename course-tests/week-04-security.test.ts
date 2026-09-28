import { getBackendHealth } from '../src/api/courseBackend';
import { createCourseBackendHealthReader } from '../src/infrastructure/system/courseBackendHealthReader';
import { redactForTelemetry } from '../src/security/redactForTelemetry';

const realFetch = global.fetch;
const originalEnv = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL;

afterEach(() => {
  global.fetch = realFetch;
  process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = originalEnv;
});

test('redacts nested sensitive values without mutating the input', () => {
  const input = {
    incidentId: 'incident-001',
    request: {
      headers: { 'x-access-token': 'synthetic-token', accept: 'application/json' },
      attempts: [{ email: 'fictional@example.test', status: 'retrying' }],
    },
    assignment_history: [{ technicianId: 'person-001' }],
    durationMs: 42,
  };

  expect(redactForTelemetry(input)).toEqual({
    incidentId: 'incident-001',
    request: {
      headers: { 'x-access-token': '[REDACTED]', accept: 'application/json' },
      attempts: [{ email: '[REDACTED]', status: 'retrying' }],
    },
    assignment_history: '[REDACTED]',
    durationMs: 42,
  });
  expect(input.request.headers['x-access-token']).toBe('synthetic-token');
});

test('the backend error path emits only technical telemetry', async () => {
  process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://fake';
  global.fetch = jest.fn().mockRejectedValueOnce(new Error('synthetic-token leaked in upstream detail'));
  const events: unknown[] = [];

  await expect(createCourseBackendHealthReader((event) => events.push(event)).check()).resolves.toBe('offline');
  expect(events).toEqual([{ status: 'offline', attempt: 1, durationMs: expect.any(Number) }]);
  expect(JSON.stringify(events)).not.toContain('synthetic-token');
});

test('backend health errors use a generic public message', async () => {
  process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://fake';
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

  await expect(getBackendHealth()).rejects.toThrow('Servicio no disponible temporalmente.');
});

test('backend contract mismatch uses a generic public message', async () => {
  process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://fake';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: false, token: 'synthetic-token' }),
  } as unknown as Response);

  await expect(getBackendHealth()).rejects.toThrow('Servicio no disponible temporalmente.');
});
