import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import type { CampusOpsServices } from '../application/campusOpsServices';
import type { BackendStatus } from '../application/system/backendStatusUseCase';
import type { IncidentDetail, IncidentSummary } from '../application/incidents/incidentUseCases';

type Props = Readonly<{
  services: CampusOpsServices;
}>;

const STATUS_LABELS: Record<IncidentSummary['status'], string> = {
  open: 'Abierta',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
};

const PRIORITY_LABELS: Record<IncidentSummary['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export function CampusOpsScreen({ services }: Props) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);

  useEffect(() => {
    let active = true;

    services.getBackendStatus().then((status) => {
      if (active) setBackendStatus(status);
    });

    services.listIncidents().then((items) => {
      if (!active) return;
      setIncidents(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
    });

    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    let active = true;

    if (!selectedId) {
      return () => {
        active = false;
      };
    }

    services.getIncidentDetail(selectedId).then((incident) => {
      if (active) setSelectedIncident(incident);
    });

    return () => {
      active = false;
    };
  }, [selectedId, services]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View accessibilityRole="summary" style={styles.header}>
        <Text style={styles.title}>CampusOps</Text>
        <Text style={styles.subtitle}>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status" style={styles.backendStatus}>
          Backend: {backendStatus}
        </Text>
      </View>

      <View style={styles.layout}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Lista de incidencias</Text>
          {incidents.map((incident) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === incident.id }}
              key={incident.id}
              onPress={() => setSelectedId(incident.id)}
              style={[styles.incidentRow, selectedId === incident.id && styles.incidentRowSelected]}
            >
              <Text style={styles.incidentTitle}>{incident.title}</Text>
              <Text style={styles.incidentMeta}>
                {STATUS_LABELS[incident.status]} · Prioridad {PRIORITY_LABELS[incident.priority]}
              </Text>
              <Text style={styles.incidentLocation}>{incident.locationLabel}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          {selectedIncident ? (
            <View style={styles.detail}>
              <Text style={styles.detailTitle}>{selectedIncident.title}</Text>
              <Text>{selectedIncident.description}</Text>
              <Text>Estado: {STATUS_LABELS[selectedIncident.status]}</Text>
              <Text>Ubicacion: {selectedIncident.locationLabel}</Text>
              <Text>Tecnico asignado: {selectedIncident.assignedTechnicianId ?? 'pendiente'}</Text>
            </View>
          ) : (
            <Text>No hay incidencia seleccionada.</Text>
          )}
        </View>
      </View>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 20,
    padding: 24,
    paddingTop: 56,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
  },
  backendStatus: {
    color: '#0f766e',
    fontWeight: '600',
  },
  layout: {
    gap: 16,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  incidentRow: {
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  incidentRowSelected: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
  incidentTitle: {
    fontWeight: '700',
  },
  incidentMeta: {
    color: '#334155',
  },
  incidentLocation: {
    color: '#64748b',
  },
  detail: {
    gap: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
