import { redactForTelemetry } from '../src/security/redactForTelemetry';

test('redacts nested sensitive values without mutating the source object', () => {
  const input = {
    incidentId: 'campus-inc-001',
    correlationId: 'corr-001',
    request: {
      headers: {
        authorization: 'Bearer synthetic-token',
        accept: 'application/json',
      },
    },
    profile: {
      display_name: 'Persona ficticia',
      email: 'persona@example.test',
    },
    events: [
      {
        assignedTechnicianId: 'technician-1',
        status: 'assigned',
        durationMs: 42,
      },
    ],
  };

  const snapshot = JSON.parse(JSON.stringify(input));

  expect(redactForTelemetry(input)).toEqual({
    incidentId: 'campus-inc-001',
    correlationId: 'corr-001',
    request: {
      headers: {
        authorization: '[REDACTED]',
        accept: 'application/json',
      },
    },
    profile: {
      display_name: '[REDACTED]',
      email: '[REDACTED]',
    },
    events: [
      {
        assignedTechnicianId: '[REDACTED]',
        status: 'assigned',
        durationMs: 42,
      },
    ],
  });
  expect(input).toEqual(snapshot);
});

test('redacts incident media, location and internal comments as complete fields', () => {
  expect(
    redactForTelemetry({
      location: { label: 'Zona ficticia', latitude: 19.0, longitude: -99.0 },
      photos: ['synthetic-photo-1'],
      internalComments: ['Comentario interno ficticio'],
      assignmentHistory: [{ technicianId: 'technician-1' }],
      attempt: 2,
    }),
  ).toEqual({
    location: '[REDACTED]',
    photos: '[REDACTED]',
    internalComments: '[REDACTED]',
    assignmentHistory: '[REDACTED]',
    attempt: 2,
  });
});
