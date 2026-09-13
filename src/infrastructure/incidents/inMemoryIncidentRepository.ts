import type { Incident, IncidentRepository } from '../../domain/incidents/types';

const INCIDENTS: readonly Incident[] = [
  {
    id: 'INC-001',
    title: 'Fuga de agua en laboratorio de redes',
    description: 'Se detecta humedad cerca de una canaleta; requiere revision antes de la siguiente practica.',
    category: 'water',
    status: 'assigned',
    priority: 'high',
    locationLabel: 'Edificio B, laboratorio 204',
    reporterProfile: 'reporter',
    assignedTechnicianId: 'TEC-13-01',
    updatedAt: '2026-09-11T19:30:00.000Z',
  },
  {
    id: 'INC-002',
    title: 'Proyector sin senal en aula magna',
    description: 'El equipo enciende, pero no detecta entrada HDMI desde la consola del aula.',
    category: 'equipment',
    status: 'in_progress',
    priority: 'medium',
    locationLabel: 'Aula Magna',
    reporterProfile: 'coordinator',
    assignedTechnicianId: 'TEC-13-02',
    updatedAt: '2026-09-11T20:10:00.000Z',
  },
  {
    id: 'INC-003',
    title: 'Zona con baja conectividad',
    description: 'Estudiantes reportan cortes intermitentes de red durante clases vespertinas.',
    category: 'connectivity',
    status: 'open',
    priority: 'medium',
    locationLabel: 'Biblioteca, planta alta',
    reporterProfile: 'reporter',
    assignedTechnicianId: null,
    updatedAt: '2026-09-11T21:05:00.000Z',
  },
];

export function createInMemoryIncidentRepository(): IncidentRepository {
  return {
    async list() {
      return INCIDENTS;
    },
    async findById(id) {
      return INCIDENTS.find((incident) => incident.id === id) ?? null;
    },
  };
}
