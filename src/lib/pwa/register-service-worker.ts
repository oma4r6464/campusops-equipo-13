const SERVICE_WORKER_PATH = '/sw.js';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' }).catch(() => {
    // Service worker support is optional for native Expo targets and local development.
  });
}
