export type UserProfile = 'reporter' | 'technician' | 'coordinator';

export type IncidentStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';

export type IncidentPriority = 'low' | 'medium' | 'high';

export type IncidentCategory = 'electricity' | 'water' | 'connectivity' | 'equipment' | 'safety';

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
  updatedAt: string;
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
