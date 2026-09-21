import { registerRootComponent } from 'expo';

import App from './App';
import { registerServiceWorker } from './src/lib/pwa/register-service-worker';

registerServiceWorker();

registerRootComponent(App);
