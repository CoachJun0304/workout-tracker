import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params;

  const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.clientSplit}>{client.preferred_split || 'No split assigned'}</Text>
      </Surface>

      <Surface style={styles.infoCard}>
        <Text style={styles.sectionLabel}>Personal Info</Text>
        <InfoRow label="Age" value={client.age} />
        <InfoRow label="Gender" value={client.gender} />
        <InfoRow label="Weight" value={client.weight_kg ? `${client.weight_kg} kg` : null} />
        <InfoRow label="Height" value={client.height_cm ? `${client.height_cm} cm` : null} />
        <InfoRow label="Goal" value={client.goal} />
        <InfoRow label="Contact" value={client.contact || client.email} />
        <InfoRow label="Status" value={client.status} />
      </Surface>

      <Text style={styles.sectionLabel2}>Actions</Text>
      <Button mode="contained" icon="dumbbell" style={styles.btn}
        onPress={() => navigation.navigate('LogWorkout', { client })}>
        Log Workout
      </Button>
      <Button mode="contained" icon="chart-line"
        style={[styles.btn, { backgroundColor: '#00B894' }]}
        onPress={() => navigation.navigate('Progress', { client })}>
        View Progress
      </Button>
      <Button mode="contained" icon="trophy"
        style={[styles.btn, { backgroundColor: '#FDCB6E' }]}
        onPress={() => navigation.navigate('Records', { client })}>
        Personal Records
      </Button>
      <Button mode="outlined" icon="clipboard-list" style={styles.btn}
        onPress={() => navigation.navigate('AssignProgram', { client })}>
        Assign Program
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  avatarCard: {
    alignItems: 'center', padding: 24, borderRadius: 16,
    backgroundColor: '#1a1a1a', marginBottom: 12
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#6C63FF33', justifyContent: 'center',
    alignItems: 'center', marginBottom: 12
  },
  avatarText: { color: '#6C63FF', fontSize: 36, fontWeight: 'bold' },
  clientName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  clientSplit: { color: '#6C63FF', fontSize: 14, marginTop: 4 },
  infoCard: {
    padding: 16, borderRadius: 16,
    backgroundColor: '#1a1a1a', marginBottom: 12
  },
  sectionLabel: {
    color: '#888', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12
  },
  sectionLabel2: {
    color: '#888', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 12, marginTop: 8
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a'
  },
  infoLabel: { color: '#888', fontSize: 14 },
  infoValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  btn: { marginBottom: 10, borderRadius: 8 },
});