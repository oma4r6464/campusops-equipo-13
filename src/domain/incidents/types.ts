export type UserProfile = 'reporter' | 'technician' | 'coordinator';

export const INCIDENT_CATEGORIES = [
  'electrical',
  'laboratory',
  'water',
  'connectivity',
  'equipment',
  'safety',
  'maintenance',
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

export const INCIDENT_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'] as const;

export const INCIDENT_PRIORITIES = ['low', 'medium', 'high'] as const;

export type Incident = Readonly<{
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  status: IncidentStatus;
  priority: IncidentPriority;
  locationLabel: string;
  reporterProfile: UserProfile;
  assignedTechnicianId: string | null;
  /** El backend didactico no publica fecha de actualizacion; null significa desconocida. */
  updatedAt: string | null;
}>;

export type NewIncidentDraft = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;

export interface IncidentRepository {
  list(): Promise<readonly Incident[]>;
  findById(id: string): Promise<Incident | null>;
}

export interface SessionBoundary {
  currentProfile(): Promise<UserProfile>;
}

export interface PersistenceBoundary {
  describeStore(): string;
}

export interface LocationProviderBoundary {
  describeProvider(): string;
}
