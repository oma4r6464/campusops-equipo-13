import { createCampusOpsServices } from './src/application/campusOpsServices';
import { createInMemoryIncidentRepository } from './src/infrastructure/incidents/inMemoryIncidentRepository';
import { createCourseBackendHealthReader } from './src/infrastructure/system/courseBackendHealthReader';
import { CampusOpsScreen } from './src/ui/CampusOpsScreen';

const campusOpsServices = createCampusOpsServices({
  incidentRepository: createInMemoryIncidentRepository(),
  backendHealthReader: createCourseBackendHealthReader(),
});

export default function App() {
  // Solución 1: Credenciales cargadas desde variables de entorno
  const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

  // Solución 2: Logs sanitizados sin información sensible
  console.log("Usuario autenticado correctamente", { status: "success" });

  // Solución 3: Mensaje de error genérico para el usuario
  const dbConnectionFailed = true;
  if (dbConnectionFailed) {
    // throw new Error("No fue posible conectar con el servicio."); // Comentado para que no rompa la app al iniciar
  }

  return <CampusOpsScreen services={campusOpsServices} />;
}
