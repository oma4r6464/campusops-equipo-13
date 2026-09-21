import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

test('offline navigation falls back to the offline document', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const cache = new Map<string, Response>([['/offline.html', new Response('offline page')]]);
  const storage = {
    open: async () => ({
      put: async (request: Request | string, response: Response) => cache.set(String(request), response),
      add: async (request: string) => cache.set(request, new Response(request)),
    }),
    keys: async () => ['campusops-v1-static'],
    delete: async () => true,
    match: async (request: Request | string) => cache.get(String(request)),
  };
  const worker = {
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    clients: { claim: async () => undefined },
    location: { origin: 'https://campusops.test' },
    skipWaiting: async () => undefined,
  };
  const context = vm.createContext({
    self: worker,
    caches: storage,
    fetch: jest.fn(async () => { throw new Error('offline'); }),
    Response,
    URL,
  });
  vm.runInContext(readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8'), context);

  let responsePromise: Promise<Response> | undefined;
  listeners.get('fetch')!({
    request: new Request('https://campusops.test/incidents', {
      method: 'GET',
      headers: { accept: 'text/html' },
    }),
    respondWith: (promise: Promise<Response>) => { responsePromise = promise; },
  });

  await expect(responsePromise).resolves.toBeInstanceOf(Response);
  await expect((await responsePromise!).text()).resolves.toBe('offline page');
});
