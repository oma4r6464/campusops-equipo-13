import type { Incident } from '../../domain/incidents/types';
import type { SyncSnapshot } from '../../domain/sync/resolveSync';


export function incidentToSyncRecord(incident: Incident, version: number): SyncSnapshot {
  return {
    id: incident.id,
    version,
    fields: {
      title: incident.title,
      description: incident.description,
      category: incident.category,
      priority: incident.priority,
      locationLabel: incident.locationLabel,
      work: {
        assignedTechnicianId: incident.assignedTechnicianId,
        status: incident.status,
      },
    },
  };
}