import { IncidentRepository } from '../domain/IncidentRepository';
import { Incident } from '../domain/Incident';

const mockIncidents: Incident[] = [
  {
    id: '1',
    title: 'Fuga de agua en Laboratorio 3',
    description: 'El lavabo principal no cierra correctamente.',
    status: 'open',
    createdAt: new Date(),
  },
  {
    id: '2',
    title: 'Proyector sin señal',
    description: 'Aula 204 no detecta HDMI.',
    status: 'in-progress',
    createdAt: new Date(),
  }
];

export class MockIncidentRepository implements IncidentRepository {
  async getAll(): Promise<Incident[]> {
    return Promise.resolve(mockIncidents);
  }

  async getById(id: string): Promise<Incident | null> {
    const incident = mockIncidents.find(i => i.id === id);
    return Promise.resolve(incident || null);
  }

  async save(incident: Incident): Promise<void> {
    mockIncidents.push(incident);
    return Promise.resolve();
  }
}
