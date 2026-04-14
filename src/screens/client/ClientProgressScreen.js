import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const W = Dimensions.get('window').width;

export default function ClientProgressScreen() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    if (!profile) return;
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', profile.id).eq('set_type', 'working')
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
    const dates = Object.keys(byDate).slice(-8);
    return {
      labels: dates.map(d => d.slice(5)),
      datasets: [{ data: dates.map(d => byDate[d]), color: () => COLORS.roseGold, strokeWidth: 2 }],
    };
  }

  const chartConfig = {
    backgroundColor: COLORS.darkCard,
    backgroundGradientFrom: COLORS.darkCard,
    backgroundGradientTo: COLORS.darkCard2,
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(183, 110, 121, ${opacity})`,
    labelColor: () => COLORS.textMuted,
    propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.roseGold },
  };

  const selectedData = selected ? getChartData(selected) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Progress</Text>

      {exercises.length === 0
        ? <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyText}>No workout data yet</Text>
            <Text style={styles.emptySub}>Start logging workouts to see progress</Text>
          </View>
        : <>
          <Text style={styles.label}>Select Exercise</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {exercises.map(ex => (
              <Chip key={ex} selected={selected === ex} onPress={() => setSelected(ex)}
                style={[styles.chip, selected === ex && styles.chipActive]}
                textStyle={{ color: selected === ex ? COLORS.white : COLORS.textSecondary }}>
                {ex}
              </Chip>
            ))}
          </ScrollView>

          {selectedData
            ? <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{selected}</Text>
                <Text style={styles.chartSub}>Max weight per session (kg)</Text>
                <LineChart data={selectedData} width={W - 64} height={180}
                  chartConfig={chartConfig} bezier style={{ borderRadius: 8 }} />
              </View>
            : <View style={styles.empty}>
                <Text style={styles.emptyText}>Need at least 2 sessions</Text>
              </View>
          }
        </>
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 20, paddingBottom: 40, paddingTop: 60 },
  title: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 20 },
  label: { color: COLORS.textMuted, fontSize: SIZES.sm, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  chipRow: { marginBottom: 16 },
  chip: { marginRight: 8, backgroundColor: COLORS.darkCard, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chartCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  chartTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg, marginBottom: 2 },
  chartSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
});