import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showConfirm } from '../../utils/webAlert';

const MUSCLE_ORDER = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

const MUSCLE_COLORS = {
  'Chest':'#C0392B','Back':'#2980B9','Quads':'#27AE60','Hamstrings':'#16A085',
  'Glutes':'#8E44AD','Calves':'#2C3E50','Front Delts':'#E67E22','Side Delts':'#D35400',
  'Rear Delts':'#CA6F1E','Biceps':'#1ABC9C','Triceps':'#2ECC71','Core':'#F39C12',
  'Full Body':'#7F77DD',
};

export default function RecordsScreen({ route }) {
  const clientParam = route?.params?.client;
  const { profile, unit } = useAuth();
  const clientId = clientParam?.id || profile?.id;
  const ul = unitLabel(unit);
  const [records, setRecords] = useState({});
  const [allLogs, setAllLogs] = useState([]);
  const [totalPRs, setTotalPRs] = useState(0);

  useEffect(() => { fetchRecords(); }, [clientId]);

  async function fetchRecords() {
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', clientId)
      .eq('set_type', 'working')
      .not('weight_kg', 'is', null)
      .order('weight_kg', { ascending: false });

    if (data) {
      setAllLogs(data);
      const prs = {};
      data.forEach(log => {
        if (!log.weight_kg) return;
        if (!prs[log.exercise_name] ||
            log.weight_kg > prs[log.exercise_name].weight_kg) {
          prs[log.exercise_name] = log;
        }
      });

      const grouped = {};
      Object.values(prs).forEach(pr => {
        const muscle = pr.muscle_group || 'Other';
        if (!grouped[muscle]) grouped[muscle] = [];
        grouped[muscle].push(pr);
      });

      Object.keys(grouped).forEach(m =>
        grouped[m].sort((a, b) => b.weight_kg - a.weight_kg)
      );

      setRecords(grouped);
      setTotalPRs(Object.values(prs).length);
    }
  }

  async function deletePR(log) {
    showConfirm(
      'Remove PR',
      `Remove the PR for ${log.exercise_name} (${toDisplay(log.weight_kg, unit)}${ul} × ${log.reps})?`,
      async () => {
        await supabase.from('workout_logs').delete().eq('id', log.id);
        fetchRecords();
      },
      null, 'Remove', true
    );
  }

  const orderedMuscles = [
    ...MUSCLE_ORDER.filter(m => records[m]),
    ...Object.keys(records).filter(m => !MUSCLE_ORDER.includes(m)),
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {clientParam ? `${clientParam.name}'s Records` : '🏆 My Personal Records'}
      </Text>
      <Text style={styles.subtitle}>
        Auto-computed from all workout logs · {totalPRs} exercises tracked
      </Text>

      {orderedMuscles.length === 0
        ? <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyText}>No records yet</Text>
            <Text style={styles.emptySub}>Start logging workouts to set your PRs</Text>
          </View>
        : orderedMuscles.map(muscle => (
          <View key={muscle}>
            <View style={[styles.muscleHeader,
              { borderLeftColor: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
              <Text style={[styles.muscleTitle,
                { color: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
                {muscle.toUpperCase()}
              </Text>
            </View>
            {records[muscle].map((pr, i) => {
              const e1rm = estimated1RM(pr.weight_kg, pr.reps);
              return (
                <View key={i} style={styles.prCard}>
                  <View style={styles.prRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                      <Text style={styles.prDate}>
                        {new Date(pr.logged_at).toLocaleDateString('en-US',
                          { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.prStats}>
                      <Text style={styles.prWeight}>
                        {toDisplay(pr.weight_kg, unit)}{ul}
                      </Text>
                      <Text style={styles.prReps}>× {pr.reps} reps</Text>
                      {e1rm && (
                        <Text style={styles.prE1rm}>
                          ~{toDisplay(e1rm, unit)}{ul} 1RM
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => deletePR(pr)}>
                      <Text style={styles.deleteBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40, paddingTop: 20, maxWidth: 800, alignSelf: 'center', width: '100%' },
  title: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 20 },
  muscleHeader: { borderLeftWidth: 3, paddingLeft: 12, marginTop: 16, marginBottom: 8 },
  muscleTitle: { fontSize: SIZES.sm, ...FONTS.bold, letterSpacing: 1 },
  prCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  prRow: { flexDirection: 'row', alignItems: 'center' },
  prExercise: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  prDate: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  prStats: { alignItems: 'flex-end', marginRight: 8 },
  prWeight: { color: COLORS.roseGold, fontSize: SIZES.xl, ...FONTS.bold },
  prReps: { color: COLORS.textMuted, fontSize: SIZES.sm },
  prE1rm: { color: '#4ECDC4', fontSize: SIZES.xs, marginTop: 2 },
  deleteBtn: { padding: 8, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.md },
  deleteBtnText: { fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.md, marginTop: 6 },
});