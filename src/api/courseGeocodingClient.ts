import { isProviderLocation } from '../campusops/locationValidation';
import type { GeocodingLookupResult } from '../campusops/contracts';

type GeocodingClientOptions = Readonly<{
  baseUrl: string;
  actorId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  scenario?: string;
}>;

type CacheEntry = Readonly<{ value: GeocodingLookupResult; expiresAt: number }>;

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function cacheKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function createCourseGeocodingClient(options: GeocodingClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = new Map<string, CacheEntry>();
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const maxCacheEntries = options.maxCacheEntries ?? 100;

  async function lookup(query: string): Promise<GeocodingLookupResult> {
    const normalizedQuery = cacheKey(query);
    if (!normalizedQuery) return { kind: 'unavailable', reason: 'invalid_response' };

    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    const cached = cache.get(normalizedQuery);
    if (cached) return cached.value;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2000);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Course-Actor': options.actorId,
      };
      if (options.scenario) headers['X-Course-Scenario'] = options.scenario;

      const response = await fetchImpl(
        `${options.baseUrl}/v1/geocoding?q=${encodeURIComponent(query.trim())}`,
        { headers, signal: controller.signal },
      );
      if (response.status === 429) return { kind: 'unavailable', reason: 'rate_limited' };
      if (response.status >= 500) return { kind: 'unavailable', reason: 'server' };
      if (!response.ok) return { kind: 'unavailable', reason: 'http_error' };

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { kind: 'unavailable', reason: 'invalid_response' };
      }
      if (!isProviderLocation(payload)) return { kind: 'unavailable', reason: 'invalid_response' };

      const result: GeocodingLookupResult = {
        kind: 'available',
        value: { label: payload.label, latitude: payload.latitude, longitude: payload.longitude },
      };
      if (cacheTtlMs > 0 && maxCacheEntries > 0) {
        cache.set(normalizedQuery, { value: result, expiresAt: Date.now() + cacheTtlMs });
        while (cache.size > maxCacheEntries) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey === undefined) break;
          cache.delete(oldestKey);
        }
      }
      return result;
    } catch (error) {
      return {
        kind: 'unavailable',
        reason: isAbortError(error) ? 'timeout' : 'network',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { lookup };
}
