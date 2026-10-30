import type { IncidentLocation } from './contracts';

export type ProviderLocation = Readonly<{
  label: string;
  latitude: number;
  longitude: number;
}>;

export function isProviderLocation(input: unknown): input is ProviderLocation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return typeof value.label === 'string'
    && value.label.trim().length > 0
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

export function selectIncidentLocation(provider: unknown, manualLabel: string): IncidentLocation {
  if (isProviderLocation(provider)) {
    return {
      source: 'provider',
      label: provider.label,
      latitude: provider.latitude,
      longitude: provider.longitude,
    };
  }
  return { source: 'manual', label: manualLabel };
}
