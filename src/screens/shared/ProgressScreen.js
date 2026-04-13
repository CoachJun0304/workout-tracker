import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Text, Surface, Chip } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';

const W = Dimensions.get('window').width;

export default function ProgressScreen({ route }) {
  const { client } = route.params;
  const [logs, setLogs] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', client.id).eq('set_type', 'working')
      .order('logged_at', { ascending: true });
    if (data) {
      setLogs(data);
      const unique = [...new Set(data.map(l => l.exercise_name))];
      setExercises(unique);
      if (unique.length > 0) setSelected(unique[0]);
    }
  }

  function getChartData(exerciseName) {
    const exLogs = logs.filter(l => l.exercise_name === exerciseName && l.weight_kg);
    if (exLogs.length < 2) return null;
    const byDate = {};
    exLogs.forEach(l => {
      const date = l.logged_at.split('T')[0];
      if (!byDate[date] || l.weight_kg > byDate[date]) byDate[date] = l.weight_kg;
    });
    const dates = Object.keys(byDate).slice(-10);
    const weights = dates.map(d => byDate[d]);
    return {
      labels: dates.map(d => d.slice(5)),
      datasets: [{ data: weights, color: () => '#6C63FF', strokeWidth: 2 }],
    };
  }

  const chartConfig = {
    backgroundColor: '#1a1a1a', backgroundGradientFrom: '#1a1a1a', backgroundGradientTo: '#2a2a2a',
    decimalPlaces: 1, color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
    labelColor: () => '#888', style: { borderRadius: 12 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#6C63FF' },
  };

  const selectedData = selected ? getChartData(selected) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.clientBanner}>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.subtitle}>Progress Tracking</Text>
      </Surface>
      {exercises.length === 0
        ? <Surface style={styles.empty}><Text style={styles.emptyText}>No workout data yet</Text></Surface>
        : <>
          <Text style={styles.sectionLabel}>Select Exercise</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {exercises.map(ex => (
              <Chip key={ex} selected={selected === ex} onPress={() => setSelected(ex)}
                style={styles.chip} selectedColor="#6C63FF">{ex}</Chip>
            ))}
          </ScrollView>
          {selectedData ? (
            <Surface style={styles.chartCard}>
              <Text style={styles.chartTitle}>{selected}</Text>
              <Text style={styles.chartSub}>Max weight per session (kg)</Text>
              <LineChart data={selectedData} width={W - 64} height={200}
                chartConfig={chartConfig} bezier style={styles.chart} />
            </Surface>
          ) : (
            <Surface style={styles.empty}>
              <Text style={styles.emptyText}>Need at least 2 sessions to show chart</Text>
            </Surface>
          )}
          <Text style={styles.sectionLabel}>All Logs — {selected}</Text>
          {logs.filter(l => l.exercise_name === selected).reverse().map((log, i) => (
            <Surface key={i} style={styles.logRow}>
              <View>
                <Text style={styles.logEx}>Set {log.set_number}</Text>
                <Text style={styles.logDate}>{log.logged_at.split('T')[0]}</Text>
              </View>
              <View style={styles.logStats}>
                <Text style={styles.logWeight}>{log.weight_kg ? `${log.weight_kg}kg` : 'BW'}</Text>
                <Text style={styles.logReps}>{log.reps} reps</Text>
                {log.is_personal_best && <Text>🏆</Text>}
              </View>
            </Surface>
          ))}
        </>
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  clientBanner: { padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 16 },
  clientName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  chipRow: { marginBottom: 8 },
  chip: { marginRight: 8 },
  chartCard: { padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 8 },
  chartTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  chartSub: { color: '#888', fontSize: 12, marginBottom: 12 },
  chart: { borderRadius: 8 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 10, backgroundColor: '#1a1a1a', marginBottom: 6 },
  logEx: { color: '#fff', fontSize: 14, fontWeight: '600' },
  logDate: { color: '#888', fontSize: 11, marginTop: 2 },
  logStats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logWeight: { color: '#6C63FF', fontSize: 15, fontWeight: 'bold' },
  logReps: { color: '#888', fontSize: 14 },
  empty: { padding: 32, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  emptyText: { color: '#888' },
});