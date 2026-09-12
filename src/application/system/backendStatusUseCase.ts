export type BackendStatus = 'checking' | 'available' | 'offline';

export interface BackendHealthReader {
  check(): Promise<BackendStatus>;
}

export function createBackendStatusUseCase(reader: BackendHealthReader) {
  return async function getBackendStatus(): Promise<BackendStatus> {
    return reader.check();
  };
}
