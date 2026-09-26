import { sanitizeTelemetry } from './sanitizer';

describe('sanitizeTelemetry', () => {
  it('should not mutate the original object', () => {
    const original = { incidentId: '123', location: 'secret' };
    const result = sanitizeTelemetry(original);

    expect(result).not.toBe(original);
    expect(original.location).toBe('secret'); // Original not mutated
    expect((result as any).location).toBe('[REDACTED]');
  });

  it('should redact sensitive keys in nested objects', () => {
    const input = {
      incidentId: 'inc-001',
      context: {
        authorization: 'Bearer token',
        device: 'iOS',
        nested: {
          user_id: 'user123',
          correlationId: 'corr-001'
        }
      }
    };

    const expected = {
      incidentId: 'inc-001',
      context: {
        authorization: '[REDACTED]',
        device: 'iOS',
        nested: {
          user_id: '[REDACTED]', // Testing _ removal
          correlationId: 'corr-001'
        }
      }
    };

    expect(sanitizeTelemetry(input)).toEqual(expected);
  });

  it('should recursively redact inside arrays', () => {
    const input = {
      items: [
        { email: 'a@b.com', status: 'open' },
        { EMAIL: 'c@d.com', status: 'closed' } // Testing lowercase normalization
      ]
    };

    const expected = {
      items: [
        { email: '[REDACTED]', status: 'open' },
        { EMAIL: '[REDACTED]', status: 'closed' }
      ]
    };

    expect(sanitizeTelemetry(input)).toEqual(expected);
  });
});
