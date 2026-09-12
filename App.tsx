import { createCampusOpsServices } from './src/application/campusOpsServices';
import { createInMemoryIncidentRepository } from './src/infrastructure/incidents/inMemoryIncidentRepository';
import { createCourseBackendHealthReader } from './src/infrastructure/system/courseBackendHealthReader';
import { CampusOpsScreen } from './src/ui/CampusOpsScreen';

const campusOpsServices = createCampusOpsServices({
  incidentRepository: createInMemoryIncidentRepository(),
  backendHealthReader: createCourseBackendHealthReader(),
});

export default function App() {
  return <CampusOpsScreen services={campusOpsServices} />;
}
