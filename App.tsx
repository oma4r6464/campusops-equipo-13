import { createCampusOpsServices } from './src/application/campusOpsServices';
import type { IncidentGateway } from './src/application/incidents/incidentGateway';
import {
  createCourseIncidentGateway,
  createOperationKey,
} from './src/infrastructure/incidents/courseBackendConfig';
import { createInMemoryIncidentGateway } from './src/infrastructure/incidents/inMemoryIncidentGateway';
import { createCourseBackendHealthReader } from './src/infrastructure/system/courseBackendHealthReader';
import { CampusOpsScreen } from './src/ui/CampusOpsScreen';

/**
 * Fuente de incidencias: `cloud` (backend didactico) por defecto; `memory` para modo
 * local determinista (pruebas de UI de semanas 1-2 y desarrollo sin backend).
 * EXPO_PUBLIC_INCIDENT_SOURCE=memory|cloud lo fuerza explicitamente.
 */
function createIncidentGateway(): IncidentGateway {
  const source = process.env.EXPO_PUBLIC_INCIDENT_SOURCE ?? (process.env.NODE_ENV === 'test' ? 'memory' : 'cloud');
  return source === 'memory' ? createInMemoryIncidentGateway() : createCourseIncidentGateway();
}

const campusOpsServices = createCampusOpsServices({
  incidentGateway: createIncidentGateway(),
  backendHealthReader: createCourseBackendHealthReader(),
  newOperationKey: createOperationKey,
});

export default function App() {
  return <CampusOpsScreen services={campusOpsServices} />;
}
