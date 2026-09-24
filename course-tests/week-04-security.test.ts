import { getBackendHealth } from '../src/api/courseBackend';

describe('Semana 04 — Hallazgo 2 corregido: mensajes de error genéricos', () => {
  const realFetch = global.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL;

  afterEach(() => {
    global.fetch = realFetch;
    process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = originalEnv;
  });

  it('no expone el status HTTP cuando el backend responde con error', async () => {
    process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://fake';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(getBackendHealth()).rejects.toThrow('Servicio no disponible temporalmente.');
  });

  it('no expone el nombre del contrato cuando el payload no coincide', async () => {
    process.env.EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://fake';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    } as unknown as Response);

    await expect(getBackendHealth()).rejects.toThrow('Servicio no disponible temporalmente.');
  });

  it('falla con mensaje genérico si falta la URL configurada (Hallazgo 3)', async () => {
    delete process.env.EXPO_PUBLIC_COURSE_BACKEND_URL;

    await expect(getBackendHealth()).rejects.toThrow('Servicio no disponible temporalmente.');
  });
});