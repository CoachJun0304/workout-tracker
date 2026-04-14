import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const MUSCLE_COLORS = {
  'Chest': '#C0392B', 'Back': '#2980B9', 'Quads': '#27AE60',
  'Hamstrings': '#16A085', 'Glutes': '#8E44AD', 'Calves': '#2C3E50',
  'Front Delts': '#E67E22', 'Side Delts': '#D35400', 'Rear Delts': '#CA6F1E',
  'Biceps': '#1ABC9C', 'Triceps': '#2ECC71', 'Core': '#F39C12',
};

export default function ClientRecordsScreen() {
  const { profile } = useAuth();
  const [records, setRecords] = useState({});

  useEffect(() => { fetchRecords(); }, []);

  async function fetchRecords() {
    if (!profile) return;
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', profile.id).eq('set_type', 'working')
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
      setRecords(grouped);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🏆 Personal Records</Text>

      {Object.keys(records).length === 0
        ? <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyText}>No records yet</Text>
            <Text style={styles.emptySub}>Start logging to set your PRs!</Text>
          </View>
        : Object.keys(records).map(muscle => (
          <View key={muscle}>
            <View style={[styles.muscleHeader, { borderLeftColor: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
              <Text style={[styles.muscleTitle, { color: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
                {muscle.toUpperCase()}
              </Text>
            </View>
            {records[muscle].map((pr, i) => (
              <View key={i} style={styles.prCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                  <Text style={styles.prDate}>
                    {new Date(pr.logged_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </Text>
                </View>
                <View style={styles.prStats}>
                  <Text style={styles.prWeight}>{pr.weight_kg}kg</Text>
                  <Text style={styles.prReps}>× {pr.reps} reps</Text>
                </View>
              </View>
            ))}
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 20, paddingBottom: 40, paddingTop: 60 },
  title: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 20 },
  muscleHeader: { borderLeftWidth: 3, paddingLeft: 12, marginTop: 16, marginBottom: 8 },
  muscleTitle: { fontSize: SIZES.sm, ...FONTS.bold, letterSpacing: 1 },
  prCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md,
    padding: 14, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  prExercise: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  prDate: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  prStats: { alignItems: 'flex-end' },
  prWeight: { color: COLORS.roseGold, fontSize: SIZES.xl, ...FONTS.bold },
  prReps: { color: COLORS.textMuted, fontSize: SIZES.sm },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.md, marginTop: 6 },
});