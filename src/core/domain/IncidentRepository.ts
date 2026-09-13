import { Incident } from './Incident';

export interface IncidentRepository {
  getAll(): Promise<Incident[]>;
  getById(id: string): Promise<Incident | null>;
  save(incident: Incident): Promise<void>;
}
