import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { supabase } from '../../lib/supabase';

const MUSCLE_ORDER = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
                      'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core'];
const MUSCLE_COLORS = {
  'Chest':'#C0392B','Back':'#2980B9','Quads':'#27AE60','Hamstrings':'#16A085',
  'Glutes':'#8E44AD','Calves':'#2C3E50','Front Delts':'#E67E22','Side Delts':'#D35400',
  'Rear Delts':'#CA6F1E','Biceps':'#1ABC9C','Triceps':'#2ECC71','Core':'#F39C12',
};

export default function RecordsScreen({ route }) {
  const { client } = route.params;
  const [records, setRecords] = useState({});

  useEffect(() => { fetchRecords(); }, []);

  async function fetchRecords() {
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', client.id).eq('set_type', 'working')
      .order('weight_kg', { ascending: false });
    if (data) {
      const prs = {};
      data.forEach(log => {
        if (!log.weight_kg) return;
        if (!prs[log.exercise_name] || log.weight_kg > prs[log.exercise_name].weight_kg) {
          prs[log.exercise_name] = log;
        }
      });
      const grouped = {};
      Object.values(prs).forEach(pr => {
        const muscle = pr.muscle_group || 'Other';
        if (!grouped[muscle]) grouped[muscle] = [];
        grouped[muscle].push(pr);
      });
      Object.keys(grouped).forEach(m => grouped[m].sort((a, b) => b.weight_kg - a.weight_kg));
      setRecords(grouped);
    }
  }

  const orderedMuscles = [
    ...MUSCLE_ORDER.filter(m => records[m]),
    ...Object.keys(records).filter(m => !MUSCLE_ORDER.includes(m))
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.clientBanner}>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.subtitle}>🏆 Personal Records</Text>
      </Surface>
      {orderedMuscles.length === 0
        ? <Surface style={styles.empty}><Text style={styles.emptyText}>No records yet — start logging!</Text></Surface>
        : orderedMuscles.map(muscle => (
          <View key={muscle}>
            <View style={[styles.muscleBanner, { borderLeftColor: MUSCLE_COLORS[muscle] || '#6C63FF' }]}>
              <Text style={[styles.muscleTitle, { color: MUSCLE_COLORS[muscle] || '#6C63FF' }]}>
                {muscle.toUpperCase()}
              </Text>
            </View>
            {records[muscle].map((pr, i) => (
              <Surface key={i} style={styles.prCard}>
                <View style={styles.prRow}>
                  <View>
                    <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                    <Text style={styles.prDate}>
                      {new Date(pr.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.prStats}>
                    <Text style={styles.prWeight}>{pr.weight_kg}kg</Text>
                    <Text style={styles.prReps}>× {pr.reps} reps</Text>
                  </View>
                </View>
              </Surface>
            ))}
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  clientBanner: { padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 16 },
  clientName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  subtitle: { color: '#FDCB6E', fontSize: 13, marginTop: 2 },
  muscleBanner: { borderLeftWidth: 3, paddingLeft: 12, marginTop: 16, marginBottom: 8 },
  muscleTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  prCard: { padding: 14, borderRadius: 10, backgroundColor: '#1a1a1a', marginBottom: 6 },
  prRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prExercise: { color: '#fff', fontSize: 15, fontWeight: '600' },
  prDate: { color: '#888', fontSize: 11, marginTop: 2 },
  prStats: { alignItems: 'flex-end' },
  prWeight: { color: '#FDCB6E', fontSize: 18, fontWeight: 'bold' },
  prReps: { color: '#888', fontSize: 12 },
  empty: { padding: 32, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  emptyText: { color: '#888', textAlign: 'center' },
});