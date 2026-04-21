import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function ClientReportScreen({ route }) {
  const { client } = route.params || {};
  const [program, setProgram] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [scheduleChanges, setScheduleChanges] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [loading, setLoading] = useState(false);

  function getCurrentWeek() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  }

  function getWeekDates(weekOffset = 0) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }

  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  useEffect(() => {
    if (client?.id) fetchData();
  }, [weekOffset]);

  async function fetchData() {
    setLoading(true);
    const [progRes, logsRes, changesRes] = await Promise.all([
      supabase.from('client_programs')
        .select('*, workout_templates(*, template_exercises(*))')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase.from('workout_logs')
        .select('day, logged_at, exercise_name, set_type')
        .eq('client_id', client.id)
        .gte('logged_at', weekStart)
        .lte('logged_at', weekEnd + 'T23:59:59'),
      supabase.from('workout_schedule_changes')
        .select('*')
        .eq('client_id', client.id)
        .gte('original_date', weekStart)
        .lte('original_date', weekEnd),
    ]);
    setProgram(progRes.data || null);
    setWorkoutLogs(logsRes.data || []);
    setScheduleChanges(changesRes.data || []);
    setLoading(false);
  }

  function getDayStatus(day, date) {
    // Check if this day has exercises in the program
    const programExercises = program?.workout_templates?.template_exercises || [];
    const hasProgram = programExercises.some(e => e.day === day);

    // Check schedule changes
    const change = scheduleChanges.find(c => c.original_day === day || c.original_date === date);

    // Check if logged
    const logged = workoutLogs.filter(l => {
      const logDate = l.logged_at?.split('T')[0];
      return logDate === date || l.day === day;
    });

    const isToday = date === new Date().toISOString().split('T')[0];
    const isPast = new Date(date) < new Date() && !isToday;

    if (change?.status === 'moved') return { status: 'moved', color: COLORS.roseGold, emoji: '📅', label: `Moved → ${change.rescheduled_day || 'another day'}`, note: change.notes };
    if (change?.status === 'missed') return { status: 'missed', color: COLORS.error, emoji: '❌', label: 'Marked as Missed', note: change.notes };
    if (logged.length > 0) return { status: 'logged', color: COLORS.success, emoji: '✅', label: `Logged (${logged.length} sets)`, note: null };
    if (!hasProgram) return { status: 'rest', color: COLORS.textMuted, emoji: '😴', label: 'Rest Day', note: null };
    if (isToday) return { status: 'today', color: '#60A5FA', emoji: '⏳', label: 'Today — not logged yet', note: null };
    if (isPast) return { status: 'missed_auto', color: COLORS.error, emoji: '⚠️', label: 'No log — likely missed', note: null };
    return { status: 'upcoming', color: COLORS.textMuted, emoji: '📋', label: 'Upcoming', note: null };
  }

  function getWeekLabel() {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === -1) return 'Last Week';
    if (weekOffset === 1) return 'Next Week';
    const start = new Date(weekStart);
    return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getComplianceStats() {
    const programExercises = program?.workout_templates?.template_exercises || [];
    const trainingDays = [...new Set(programExercises.map(e => e.day))];
    let logged = 0, missed = 0, moved = 0;

    trainingDays.forEach((day, i) => {
      const date = weekDates[DAYS.indexOf(day)];
      if (!date) return;
      const s = getDayStatus(day, date);
      if (s.status === 'logged') logged++;
      else if (s.status === 'missed_auto' || s.status === 'missed') missed++;
      else if (s.status === 'moved') moved++;
    });

    return { logged, missed, moved, total: trainingDays.length };
  }

  if (!client) return null;

  const stats = getComplianceStats();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name?.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Workout Compliance Report</Text>
        </View>
      </View>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.weekBtn}
          onPress={() => setWeekOffset(w => w - 1)}>
          <Text style={styles.weekBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{getWeekLabel()}</Text>
        <TouchableOpacity style={styles.weekBtn}
          onPress={() => setWeekOffset(w => Math.min(0, w + 1))}>
          <Text style={styles.weekBtnText}>Next ›</Text>
        </TouchableOpacity>
      </View>

      {/* Week dates */}
      <Text style={styles.weekDates}>
        {new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
        {new Date(weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </Text>

      {/* Compliance stats */}
      {program && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: COLORS.success }]}>
            <Text style={[styles.statValue, { color: COLORS.success }]}>{stats.logged}</Text>
            <Text style={styles.statLabel}>Logged</Text>
          </View>
          <View style={[styles.statCard, { borderColor: COLORS.error }]}>
            <Text style={[styles.statValue, { color: COLORS.error }]}>{stats.missed}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
          <View style={[styles.statCard, { borderColor: COLORS.roseGold }]}>
            <Text style={[styles.statValue, { color: COLORS.roseGold }]}>{stats.moved}</Text>
            <Text style={styles.statLabel}>Moved</Text>
          </View>
          <View style={[styles.statCard, { borderColor: COLORS.darkBorder }]}>
            <Text style={styles.statValue}>
              {stats.total > 0 ? Math.round((stats.logged / stats.total) * 100) : 0}%
            </Text>
            <Text style={styles.statLabel}>Rate</Text>
          </View>
        </View>
      )}

      {/* No program */}
      {!program && (
        <View style={styles.noProgram}>
          <Text style={styles.noProgramText}>📋 No active program assigned</Text>
          <Text style={styles.noProgramSub}>
            Assign a program to track workout compliance
          </Text>
        </View>
      )}

      {/* Day by day breakdown */}
      <Text style={styles.sectionTitle}>Day-by-Day Breakdown</Text>
      {DAYS.map((day, i) => {
        const date = weekDates[i];
        const status = getDayStatus(day, date);
        const programExercises = (program?.workout_templates?.template_exercises || [])
          .filter(e => e.day === day);

        return (
          <View key={day} style={[styles.dayCard, { borderLeftColor: status.color, borderLeftWidth: 4 }]}>
            <View style={styles.dayHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.dayTitleRow}>
                  <Text style={styles.dayName}>{day}</Text>
                  <Text style={styles.dayDate}>
                    {new Date(date).toLocaleDateString('en-US',
                      { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusEmoji}>{status.emoji}</Text>
                  <Text style={[styles.statusLabel, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
                {status.note && (
                  <Text style={styles.statusNote}>📝 {status.note}</Text>
                )}
              </View>
            </View>

            {/* Exercises for this day */}
            {programExercises.length > 0 && (
              <View style={styles.exerciseList}>
                {programExercises.map((ex, j) => (
                  <Text key={j} style={styles.exerciseItem}>
                    • {ex.exercise_name} — {ex.working_sets}×{ex.reps}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.roseGold, fontSize: 22, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  weekBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  weekBtnText: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm },
  weekLabel: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  weekDates: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue: { fontSize: SIZES.xxl, ...FONTS.bold, color: COLORS.white },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  noProgram: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  noProgramText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  noProgramSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4, textAlign: 'center' },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  dayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  dayTitleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dayName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dayDate: { color: COLORS.textMuted, fontSize: SIZES.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusEmoji: { fontSize: 14 },
  statusLabel: { fontSize: SIZES.sm, ...FONTS.medium },
  statusNote: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4, fontStyle: 'italic' },
  exerciseList: { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  exerciseItem: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 2 },
});