export type IncidentStatus = 'open' | 'in-progress' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  createdAt: Date;
  location?: { lat: number; lng: number }; 
}
