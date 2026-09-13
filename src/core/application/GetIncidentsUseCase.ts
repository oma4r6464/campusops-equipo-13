import { IncidentRepository } from '../domain/IncidentRepository';
import { Incident } from '../domain/Incident';

export class GetIncidentsUseCase {
  constructor(private incidentRepository: IncidentRepository) {}

  async execute(): Promise<Incident[]> {
    return await this.incidentRepository.getAll();
  }
}
