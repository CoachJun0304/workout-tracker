import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function ClientHomeScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [program, setProgram] = useState(null);
  const [todayExercises, setTodayExercises] = useState([]);
  const [weekLogs, setWeekLogs] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const month = new Date()
    .toLocaleString('default', { month: 'long' })
    .toUpperCase();

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    if (!profile) return;
    setRefreshing(true);

    const { data: prog } = await supabase
      .from('client_programs')
      .select('*, workout_templates(*, template_exercises(*))')
      .eq('client_id', profile.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (prog?.workout_templates?.template_exercises) {
      setProgram(prog);
      const todayEx = prog.workout_templates.template_exercises
        .filter(e => e.day === today)
        .sort((a, b) => a.order_index - b.order_index);
      setTodayExercises(todayEx);
    } else {
      setProgram(null);
      setTodayExercises([]);
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('workout_logs')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', profile.id)
      .gte('logged_at', weekAgo);

    setWeekLogs(count || 0);
    setRefreshing(false);
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={fetchData}
          tintColor={COLORS.roseGold} />
      }>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>
            {profile?.name?.split(' ')[0] || 'there'} 👋
          </Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{weekLogs}</Text>
          <Text style={styles.statLabel}>Sets This Week</Text>
        </View>
        <View style={[styles.statCard, styles.statCardHighlight]}>
          <Text style={[styles.statValue, { color: COLORS.white }]}>{today}</Text>
          <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.7)' }]}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayExercises.length}</Text>
          <Text style={styles.statLabel}>Exercises Today</Text>
        </View>
      </View>

      {/* Today's workout */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Workout</Text>
        {!program ? (
          <View style={styles.noProgram}>
            <Text style={styles.noProgramEmoji}>📋</Text>
            <Text style={styles.noProgramText}>No program assigned yet</Text>
            <Text style={styles.noProgramSub}>Ask your coach to assign a program</Text>
          </View>
        ) : todayExercises.length === 0 ? (
          <View style={styles.restCard}>
            <Text style={styles.restEmoji}>😴</Text>
            <Text style={styles.restText}>Rest Day</Text>
            <Text style={styles.restSub}>Recovery is part of the process</Text>
          </View>
        ) : (
          <View style={styles.workoutCard}>
            <View style={styles.workoutCardTop}>
              <View>
                <Text style={styles.workoutDay}>{today}</Text>
                <Text style={styles.workoutName}>
                  {program.workout_templates?.name || 'Workout'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => navigation.navigate('ClientWorkout', {
                  exercises: todayExercises,
                  day: today,
                  program,
                })}>
                <Text style={styles.startBtnText}>Start ›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.exerciseChips}>
              {todayExercises.slice(0, 4).map((ex, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{ex.exercise_name}</Text>
                  <Text style={styles.chipMeta}>
                    {ex.working_sets}×{ex.reps}
                  </Text>
                </View>
              ))}
              {todayExercises.length > 4 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    +{todayExercises.length - 4} more
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Week overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.weekRow}>
          {DAYS.map((day, i) => {
            const isToday = day === today;
            const hasWorkout = program?.workout_templates
              ?.template_exercises?.some(e => e.day === day);
            return (
              <View key={i} style={[
                styles.dayPill,
                isToday && styles.dayPillToday,
                !hasWorkout && styles.dayPillRest,
              ]}>
                <Text style={[
                  styles.dayPillText,
                  isToday && { color: COLORS.white },
                  !hasWorkout && { color: COLORS.textMuted },
                ]}>
                  {day.charAt(0)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Quick actions — no duplicates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => {
              navigation.getParent()?.navigate('Progress');
            }}>
            <Text style={styles.quickBtnEmoji}>📈</Text>
            <Text style={styles.quickBtnText}>Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => {
              navigation.getParent()?.navigate('Health');
            }}>
            <Text style={styles.quickBtnEmoji}>🥗</Text>
            <Text style={styles.quickBtnText}>Health</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { borderColor: COLORS.roseGoldMid }]}
            onPress={() => {
              if (todayExercises.length > 0) {
                navigation.navigate('ClientLog', {
                  exercises: todayExercises,
                  day: today,
                });
              } else {
                navigation.navigate('ClientLog', {
                  exercises: [],
                  day: today,
                });
              }
            }}>
            <Text style={styles.quickBtnEmoji}>📝</Text>
            <Text style={styles.quickBtnText}>Log Sets</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => {
              navigation.getParent()?.navigate('Records');
            }}>
            <Text style={styles.quickBtnEmoji}>🏆</Text>
            <Text style={styles.quickBtnText}>Records</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 20, paddingTop: 60,
  },
  greeting: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  name: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy },
  signOutBtn: { padding: 8 },
  signOutText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8,
  },
  statCard: {
    flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  statCardHighlight: {
    backgroundColor: COLORS.roseGoldDark, borderColor: COLORS.roseGold,
  },
  statValue: {
    fontSize: SIZES.lg, ...FONTS.bold,
    color: COLORS.roseGold, marginBottom: 2,
  },
  statLabel: { fontSize: 9, color: COLORS.textMuted, textAlign: 'center' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: {
    fontSize: SIZES.sm, ...FONTS.bold, color: COLORS.white,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1,
  },
  noProgram: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 32, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  noProgramEmoji: { fontSize: 40, marginBottom: 8 },
  noProgramText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  noProgramSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  restCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 32, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  restEmoji: { fontSize: 40, marginBottom: 8 },
  restText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  restSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  workoutCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 18, borderWidth: 1, borderColor: COLORS.roseGoldMid,
  },
  workoutCardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  workoutDay: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  workoutName: {
    color: COLORS.white, fontSize: SIZES.xl, ...FONTS.bold, marginTop: 2,
  },
  startBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  startBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm },
  exerciseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 5,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipMeta: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayPill: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.darkCard,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  dayPillToday: {
    backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold,
  },
  dayPillRest: { backgroundColor: 'transparent' },
  dayPillText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  quickBtnEmoji: { fontSize: 24, marginBottom: 4 },
  quickBtnText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.semibold },
});