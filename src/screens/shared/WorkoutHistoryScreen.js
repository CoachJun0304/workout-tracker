import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, unitLabel } from '../../utils/unitUtils';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function WorkoutHistoryScreen({ route }) {
  const clientParam = route?.params?.client;
  const { profile, unit } = useAuth();
  const clientId = clientParam?.id || profile?.id;
  const ul = unitLabel(unit);
  const [logs, setLogs] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchLogs(); }, [weekOffset]);

  function getWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
      label: weekOffset === 0 ? 'This Week'
        : weekOffset === -1 ? 'Last Week'
        : monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }

  async function fetchLogs() {
    setLoading(true);
    const { start, end } = getWeekRange();
    const { data } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('client_id', clientId)
      .gte('logged_at', start)
      .lte('logged_at', end + 'T23:59:59')
      .order('logged_at', { ascending: false });
    setLogs(data || []);
    setLoading(false);
  }

  // Group logs by date
  function groupByDate() {
    const groups = {};
    logs.forEach(log => {
      const date = log.logged_at.split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    });
    return groups;
  }

  // Group by exercise within a date
  function groupByExercise(dateLogs) {
    const groups = {};
    dateLogs.forEach(log => {
      if (!groups[log.exercise_name]) groups[log.exercise_name] = [];
      groups[log.exercise_name].push(log);
    });
    return groups;
  }

  const { start, end, label } = getWeekRange();
  const grouped = groupByDate();
  const totalSets = logs.length;
  const totalPRs = logs.filter(l => l.is_personal_best).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {clientParam ? `${clientParam.name}'s History` : '📋 Workout History'}
      </Text>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.weekBtn}
          onPress={() => setWeekOffset(w => w - 1)}>
          <Text style={styles.weekBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.weekBtn, weekOffset >= 0 && styles.weekBtnDisabled]}
          onPress={() => setWeekOffset(w => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}>
          <Text style={styles.weekBtnText}>Next ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.weekDates}>
        {new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
        {new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </Text>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalSets}</Text>
          <Text style={styles.summaryLabel}>Total Sets</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#FFE66D' }]}>{totalPRs}</Text>
          <Text style={styles.summaryLabel}>New PRs</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>
            {Object.keys(grouped).length}
          </Text>
          <Text style={styles.summaryLabel}>Days Trained</Text>
        </View>
      </View>

      {/* No data */}
      {Object.keys(grouped).length === 0 && !loading && (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyText}>No workouts logged this week</Text>
          <Text style={styles.emptySub}>Try going back to a previous week</Text>
        </View>
      )}

      {/* Grouped by date */}
      {Object.entries(grouped)
        .sort(([a], [b]) => new Date(b) - new Date(a))
        .map(([date, dateLogs]) => {
          const exerciseGroups = groupByExercise(dateLogs);
          const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US',
            { weekday: 'long', month: 'short', day: 'numeric' });
          return (
            <View key={date} style={styles.dateCard}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateName}>{dayName}</Text>
                <Text style={styles.dateSets}>{dateLogs.length} sets</Text>
              </View>

              {Object.entries(exerciseGroups).map(([exercise, exLogs]) => {
                const maxWeight = Math.max(...exLogs.map(l => l.weight_kg || 0));
                const hasPR = exLogs.some(l => l.is_personal_best);
                return (
                  <View key={exercise} style={styles.exerciseRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.exerciseNameRow}>
                        <Text style={styles.exerciseName}>{exercise}</Text>
                        {hasPR && <Text style={styles.prBadge}>🏆 PR</Text>}
                      </View>
                      <Text style={styles.exerciseMuscle}>
                        {exLogs[0]?.muscle_group || ''}
                      </Text>
                      {/* Sets breakdown */}
                      <View style={styles.setsRow}>
                        {exLogs.map((log, i) => (
                          <View key={i} style={styles.setChip}>
                            <Text style={styles.setChipText}>
                              {log.weight_kg ? `${toDisplay(log.weight_kg, unit)}${ul}` : 'BW'}
                              {log.reps ? ` × ${log.reps}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    {maxWeight > 0 && (
                      <View style={styles.maxWeight}>
                        <Text style={styles.maxWeightValue}>
                          {toDisplay(maxWeight, unit)}{ul}
                        </Text>
                        <Text style={styles.maxWeightLabel}>best</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 16 },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  weekBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  weekBtnDisabled: { opacity: 0.3 },
  weekBtnText: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm },
  weekLabel: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  weekDates: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign: 'center', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  summaryValue: { fontSize: SIZES.xxl, ...FONTS.bold, color: COLORS.roseGold },
  summaryLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  dateCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  dateName: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md },
  dateSets: { color: COLORS.textMuted, fontSize: SIZES.xs },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  exerciseName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm, flex: 1 },
  prBadge: { fontSize: SIZES.xs },
  exerciseMuscle: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 6 },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  setChip: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.darkBorder },
  setChipText: { color: COLORS.textSecondary, fontSize: 10, ...FONTS.medium },
  maxWeight: { alignItems: 'flex-end', marginLeft: 8 },
  maxWeightValue: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md },
  maxWeightLabel: { color: COLORS.textMuted, fontSize: 10 },
});