import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import type { CampusOpsServices } from '../application/campusOpsServices';
import type { BackendStatus } from '../application/system/backendStatusUseCase';
import type {
  IncidentDetailResult,
  IncidentFailure,
} from '../application/incidents/incidentGateway';
import type { IncidentDetail, IncidentSummary } from '../application/incidents/incidentUseCases';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '../domain/incidents/types';

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

const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  electrical: 'Eléctrica',
  laboratory: 'Laboratorio',
  water: 'Agua',
  connectivity: 'Conectividad',
  equipment: 'Equipo',
  safety: 'Seguridad',
  maintenance: 'Mantenimiento',
};

/** Mensajes publicos: nunca incluyen payload, tokens, ubicacion ni comentarios internos. */
const FAILURE_MESSAGES: Record<IncidentFailure['kind'], string> = {
  malformed: 'El servicio respondió con datos no válidos.',
  timeout: 'El servicio tardó demasiado en responder.',
  server_error: 'El servicio no está disponible temporalmente.',
  not_found: 'La incidencia no existe o ya no está disponible.',
  rejected: 'El servicio rechazó la solicitud o no tienes permiso.',
  unavailable: 'No se pudo conectar con el servicio.',
};

type ListState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; omittedWithoutPayload: number }>
  | Readonly<{ status: 'error'; failure: IncidentFailure }>;

/** El detalle guarda el id al que pertenece: asi se descartan respuestas de una seleccion anterior. */
type DetailState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'done'; id: string; result: IncidentDetailResult }>;

type CreateState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'saving' }>
  | Readonly<{ status: 'created' }>
  | Readonly<{ status: 'invalid' }>
  | Readonly<{ status: 'error'; failure: IncidentFailure }>;

function DetailBody({ incident }: Readonly<{ incident: IncidentDetail }>) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailTitle}>{incident.title}</Text>
      <Text>{incident.description}</Text>
      <Text>Estado: {STATUS_LABELS[incident.status]}</Text>
      <Text>Categoria: {CATEGORY_LABELS[incident.category]}</Text>
      <Text>Ubicacion: {incident.locationLabel}</Text>
      <Text>Tecnico asignado: {incident.assignedTechnicianId ?? 'pendiente'}</Text>
    </View>
  );
}

export function CampusOpsScreen({ services }: Props) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });

  const [category, setCategory] = useState<IncidentCategory>(INCIDENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [createState, setCreateState] = useState<CreateState>({ status: 'idle' });

  const mounted = useRef(true);
  const saving = useRef(false);
  /** Misma clave al reintentar el mismo borrador: el backend no duplica la incidencia. */
  const operationKey = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    services.getBackendStatus().then((status) => {
      if (active) setBackendStatus(status);
    });
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    let active = true;
    services.listIncidents().then((result) => {
      if (!active) return;
      if (result.kind !== 'success') {
        setListState({ status: 'error', failure: result });
        return;
      }
      setIncidents(result.incidents);
      setListState({ status: 'ready', omittedWithoutPayload: result.omittedWithoutPayload });
      setSelectedId((current) => current ?? result.incidents[0]?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, [services, reloadToken]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let active = true;
    services.getIncidentDetail(selectedId).then((result) => {
      if (active) setDetailState({ status: 'done', id: selectedId, result });
    });
    return () => {
      active = false;
    };
  }, [selectedId, services]);

  const retryList = () => {
    setListState({ status: 'loading' });
    setReloadToken((token) => token + 1);
  };

  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    setCreateState({ status: 'saving' });
    operationKey.current ??= services.newOperationKey();
    const result = await services.createIncident({ category, description, location }, operationKey.current);
    saving.current = false;
    if (!mounted.current) return;

    if (result.kind === 'success') {
      operationKey.current = null;
      setDescription('');
      setLocation('');
      setCreateState({ status: 'created' });
      setSelectedId(result.incident.id);
      setReloadToken((token) => token + 1);
    } else if (result.kind === 'invalid') {
      setCreateState({ status: 'invalid' });
    } else {
      // Se conserva la clave: reintentar el mismo borrador es idempotente.
      setCreateState({ status: 'error', failure: result });
    }
  };

  const renderDetail = () => {
    if (selectedId === null) return <Text>No hay incidencia seleccionada.</Text>;
    if (detailState.status !== 'done' || detailState.id !== selectedId) {
      return <Text>Cargando detalle...</Text>;
    }
    const { result } = detailState;
    switch (result.kind) {
      case 'success':
        return <DetailBody incident={result.incident} />;
      case 'null_payload':
        // payload: null es valido: se informa sin inventar descripcion ni ubicacion.
        return <Text>Esta incidencia aun no tiene datos disponibles (version {result.version}).</Text>;
      default:
        return <Text accessibilityRole="alert">{FAILURE_MESSAGES[result.kind]}</Text>;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
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
          {listState.status === 'loading' ? <Text>Cargando incidencias...</Text> : null}
          {listState.status === 'error' ? (
            <View style={styles.detail}>
              <Text accessibilityRole="alert">{FAILURE_MESSAGES[listState.failure.kind]}</Text>
              <Pressable accessibilityRole="button" onPress={retryList} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : null}
          {listState.status === 'ready' && listState.omittedWithoutPayload > 0 ? (
            <Text style={styles.incidentLocation}>
              {listState.omittedWithoutPayload} incidencia(s) sin datos disponibles no se muestran.
            </Text>
          ) : null}
          {listState.status === 'ready' && incidents.length === 0 ? (
            <Text>No hay incidencias registradas.</Text>
          ) : null}
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
          {renderDetail()}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Nueva incidencia</Text>
          <View style={styles.chips}>
            {INCIDENT_CATEGORIES.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: category === item }}
                key={item}
                onPress={() => setCategory(item)}
                style={[styles.chip, category === item && styles.chipSelected]}
              >
                <Text style={category === item ? styles.chipTextSelected : styles.chipText}>
                  {CATEGORY_LABELS[item]}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Descripcion de la incidencia"
            multiline
            onChangeText={setDescription}
            placeholder="Describe el problema"
            style={[styles.input, styles.inputMultiline]}
            value={description}
          />
          <TextInput
            accessibilityLabel="Ubicacion de la incidencia"
            onChangeText={setLocation}
            placeholder="Ubicacion (ej. Biblioteca, planta alta)"
            style={styles.input}
            value={location}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: createState.status === 'saving', disabled: createState.status === 'saving' }}
            disabled={createState.status === 'saving'}
            onPress={() => void submit()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {createState.status === 'saving' ? 'Enviando...' : 'Crear incidencia'}
            </Text>
          </Pressable>
          {createState.status === 'created' ? <Text>Incidencia creada correctamente.</Text> : null}
          {createState.status === 'invalid' ? (
            <Text accessibilityRole="alert">Completa la descripción y la ubicación antes de enviar.</Text>
          ) : null}
          {createState.status === 'error' ? (
            <Text accessibilityRole="alert">
              {FAILURE_MESSAGES[createState.failure.kind]} Puedes reintentar sin duplicar la incidencia.
            </Text>
          ) : null}
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  chipText: {
    color: '#334155',
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    padding: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderColor: '#0f766e',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '600',
  },
});
