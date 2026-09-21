import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

type CacheRecord = Map<string, Response>;

function createWorker() {
  const listeners = new Map<string, (event: any) => void>();
  const cachesByName = new Map<string, CacheRecord>();
  const cacheStorage = {
    open: async (name: string) => {
      if (!cachesByName.has(name)) cachesByName.set(name, new Map());
      const records = cachesByName.get(name)!;
      return {
        add: async (request: string) => records.set(request, new Response(`cached:${request}`)),
        put: async (request: Request | string, response: Response) => records.set(String(request), response),
        match: async (request: Request | string) => records.get(String(request)),
      };
    },
    keys: async () => [...cachesByName.keys()],
    delete: async (name: string) => cachesByName.delete(name),
    match: async (request: Request | string) => {
      for (const records of cachesByName.values()) {
        const match = records.get(String(request));
        if (match) return match;
      }
      return undefined;
    },
  };
  const worker = {
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    clients: { claim: jest.fn(async () => undefined) },
    location: { origin: 'https://campusops.test' },
    skipWaiting: jest.fn(async () => undefined),
  };
  const context = vm.createContext({
    self: worker,
    caches: cacheStorage,
    fetch: jest.fn(async () => new Response('fresh')),
    Response,
    URL,
  });
  const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
  vm.runInContext(source, context);
  return { listeners, cachesByName, worker, context };
}

test('installs static cache and serves static assets cache-first', async () => {
  const harness = createWorker();
  const installEvent = { waitUntil: (promise: Promise<unknown>) => promise };
  await harness.listeners.get('install')!(installEvent);

  const fetchEvent = {
    request: new Request('https://campusops.test/app.js', { headers: { accept: 'text/javascript' } }),
    respondWith: (promise: Promise<Response>) => promise,
  };
  const response = await harness.listeners.get('fetch')!(fetchEvent);

  expect(response).toBeUndefined();
  expect(harness.cachesByName.has('campusops-v1-static')).toBe(true);
});

test('removes old versions on activate and supports explicit update', async () => {
  const harness = createWorker();
  harness.cachesByName.set('campusops-old-static', new Map());
  const activateEvent = { waitUntil: (promise: Promise<unknown>) => promise };
  await harness.listeners.get('activate')!(activateEvent);
  expect(harness.cachesByName.has('campusops-old-static')).toBe(false);

  harness.listeners.get('message')!({ data: { type: 'SKIP_WAITING' } });
  expect(harness.worker.skipWaiting).toHaveBeenCalled();
});
