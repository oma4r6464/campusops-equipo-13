import { getBackendHealth } from '../../api/courseBackend';
import type { BackendHealthReader, BackendStatus } from '../../application/system/backendStatusUseCase';
import { redactForTelemetry } from '../../security/redactForTelemetry';

export type BackendHealthTelemetry = Readonly<{
  status: 'offline';
  attempt: number;
  durationMs: number;
}>;

export function createCourseBackendHealthReader(
  onTelemetry: (event: BackendHealthTelemetry) => void = () => undefined,
): BackendHealthReader {
  return {
    async check(): Promise<BackendStatus> {
      const startedAt = Date.now();
      try {
        await getBackendHealth();
        return 'available';
      } catch {
        onTelemetry(
          redactForTelemetry({
            status: 'offline',
            attempt: 1,
            durationMs: Math.max(0, Date.now() - startedAt),
          }) as BackendHealthTelemetry,
        );
        return 'offline';
      }
    },
  };
}
