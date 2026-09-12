import { getBackendHealth } from '../../api/courseBackend';
import type { BackendHealthReader, BackendStatus } from '../../application/system/backendStatusUseCase';

export function createCourseBackendHealthReader(): BackendHealthReader {
  return {
    async check(): Promise<BackendStatus> {
      try {
        await getBackendHealth();
        return 'available';
      } catch {
        return 'offline';
      }
    },
  };
}
