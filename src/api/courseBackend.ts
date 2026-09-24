export type BackendHealth = Readonly<{
  ok: true;
  service: 'dmi-controlled-backend';
  contractVersion: 1;
}>;

export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL,
): Promise<BackendHealth> {
  if (!baseUrl) {
    
    console.warn('[courseBackend] EXPO_PUBLIC_COURSE_BACKEND_URL no está configurada.');
    throw new Error('Servicio no disponible temporalmente.');
  }

  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    
    console.warn(`[courseBackend] health check failed with status ${response.status}`);
    throw new Error('Servicio no disponible temporalmente.');
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true ||
    !('contractVersion' in payload) ||
    payload.contractVersion !== 1
  ) {
    console.warn('[courseBackend] health contract mismatch', payload);
    throw new Error('Servicio no disponible temporalmente.');
  }

  return payload as BackendHealth;
}