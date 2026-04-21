import { showAlert, showConfirm } from '../../utils/webAlert';
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, Platform
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function ClientHomeScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [program, setProgram] = useState(null);
  const [allExercises, setAllExercises] = useState([]);
  const [todayExercises, setTodayExercises] = useState([]);
  const [weekLogs, setWeekLogs] = useState(0);
  const [activeTab, setActiveTab] = useState('today');
  const [refreshing, setRefreshing] = useState(false);
  const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const month = new Date().toLocaleString('default', { month: 'long' }).toUpperCase();

  useEffect(() => { if (profile) fetchData(); }, [profile]);

  async function fetchData() {
    setRefreshing(true);
    if (!profile) { setRefreshing(false); return; }

    // Fix: try both id and auth_id
    const clientId = profile.id;

    const { data: prog } = await supabase
      .from('client_programs')
      .select('*, workout_templates(*, template_exercises(*))')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (prog?.workout_templates?.template_exercises) {
      setProgram(prog);
      // Deduplicate by exercise_name + day
  const seen = new Set();
  const exs = prog.workout_templates.template_exercises
    .sort((a, b) => a.order_index - b.order_index)
    .filter(ex => {
      const key = `${ex.day}-${ex.exercise_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
      });
  setAllExercises(exs);
  setTodayExercises(exs.filter(e => e.day === today));
}     else {
      setProgram(null);
      setAllExercises([]);
      setTodayExercises([]);
    }

    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
    const { count } = await supabase
      .from('workout_logs').select('*', { count:'exact', head:true })
      .eq('client_id', clientId).gte('logged_at', weekAgo);
    setWeekLogs(count || 0);
    setRefreshing(false);
  }

function confirmSignOut() {
  if (Platform.OS === 'web') {
    if (window.confirm('Are you sure you want to sign out?')) {
      signOut();
    }
  } else {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  }
}

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const groupByDay = () => {
    const g = {};
    DAYS.forEach(d => {
      const exs = allExercises.filter(e => e.day === d);
      if (exs.length > 0) g[d] = exs;
    });
    return g;
  };

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor={COLORS.roseGold} />}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>{profile?.name?.split(' ')[0]} 👋</Text>
        </View>
        <TouchableOpacity onPress={confirmSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{weekLogs}</Text>
          <Text style={styles.statLabel}>Sets This Week</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRose]}>
          <Text style={[styles.statValue, { color: COLORS.white }]}>{today.slice(0,3)}</Text>
          <Text style={[styles.statLabel, { color:'rgba(255,255,255,0.7)' }]}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayExercises.length}</Text>
          <Text style={styles.statLabel}>Today's Exercises</Text>
        </View>
      </View>

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab==='today' && styles.tabBtnActive]}
          onPress={() => setActiveTab('today')}>
          <Text style={[styles.tabText, activeTab==='today' && styles.tabTextActive]}>
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab==='week' && styles.tabBtnActive]}
          onPress={() => setActiveTab('week')}>
          <Text style={[styles.tabText, activeTab==='week' && styles.tabTextActive]}>
            Full Week
          </Text>
        </TouchableOpacity>
      </View>

      {/* Free-form log button — always visible */}
      <TouchableOpacity style={styles.freeLogBtn}
        onPress={() => navigation.navigate('ClientLog', { exercises: [], day: today, freeLog: true })}>
        <Text style={styles.freeLogBtnText}>📝 Log a Workout Freely</Text>
      </TouchableOpacity>

      {/* No program onboarding */}
      {!program && (
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingEmoji}>🏋️</Text>
          <Text style={styles.onboardingTitle}>No Program Assigned Yet</Text>
          <Text style={styles.onboardingText}>
            Your coach hasn't assigned a program yet. You can still log workouts freely using the button above. Pull down to refresh once your coach assigns a program.
          </Text>
        </View>
      )}

      {/* TODAY TAB */}
      {activeTab === 'today' && program && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today — {today}</Text>
          {todayExercises.length === 0
            ? <View style={styles.restCard}>
                <Text style={styles.restEmoji}>😴</Text>
                <Text style={styles.restText}>Rest Day</Text>
                <Text style={styles.restSub}>Recovery is part of the program</Text>
              </View>
            : <View>
                <TouchableOpacity style={styles.workoutCard}
                  onPress={() => navigation.navigate('ClientWorkout', {
                    exercises: todayExercises, day: today, program
                  })}>
                  <View style={styles.workoutCardTop}>
                    <View>
                      <Text style={styles.workoutCardDay}>{today}</Text>
                      <Text style={styles.workoutCardName}>
                        {program?.workout_templates?.name || 'Workout'}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.startBtn}
                      onPress={() => navigation.navigate('ClientWorkout', {
                        exercises: todayExercises, day: today, program
                      })}>
                      <Text style={styles.startBtnText}>Start ›</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.exerciseList}>
                    {todayExercises.slice(0,4).map((ex, i) => (
                      <View key={i} style={styles.exerciseChip}>
                        <Text style={styles.exerciseChipText}>{ex.exercise_name}</Text>
                        <Text style={styles.exerciseChipSets}>
                          {ex.working_sets}×{ex.reps}
                        </Text>
                      </View>
                    ))}
                    {todayExercises.length > 4 && (
                      <View style={styles.exerciseChip}>
                        <Text style={styles.exerciseChipText}>
                          +{todayExercises.length-4} more
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.rescheduleBtn}
                  onPress={() => navigation.navigate('Reschedule', {
                    program, currentDay: today,
                    currentDate: new Date().toISOString().split('T')[0]
                  })}>
                  <Text style={styles.rescheduleBtnText}>📅 Missed / Move Workout</Text>
                </TouchableOpacity>
              </View>
          }
        </View>
      )}

      {/* WEEK TAB */}
      {activeTab === 'week' && program && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {program?.workout_templates?.name} — Full Week
          </Text>
          {Object.entries(groupByDay()).map(([day, exs]) => (
            <View key={day} style={[styles.dayCard, day===today && styles.dayCardToday]}>
              <View style={styles.dayCardHeader}>
                <View style={styles.dayCardLeft}>
                  <Text style={[styles.dayCardDay, day===today && { color: COLORS.roseGold }]}>
                    {day} {day===today ? '← Today' : ''}
                  </Text>
                  <Text style={styles.dayCardCount}>{exs.length} exercises</Text>
                </View>
                <TouchableOpacity style={styles.dayLogBtn}
                  onPress={() => navigation.navigate('ClientLog', { exercises: exs, day })}>
                  <Text style={styles.dayLogBtnText}>Log</Text>
                </TouchableOpacity>
              </View>
              {exs.map((ex, i) => (
                <View key={i} style={styles.dayExRow}>
                  <Text style={styles.dayExName}>{ex.exercise_name}</Text>
                  <Text style={styles.dayExMeta}>
                    {ex.working_sets}×{ex.reps} · {ex.muscle_group}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {/* Rest days */}
          {DAYS.filter(d => !Object.keys(groupByDay()).includes(d)).map(d => (
            <View key={d} style={styles.restDayCard}>
              <Text style={styles.restDayText}>😴 {d} — Rest Day</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, paddingTop:60 },
  greeting: { color: COLORS.textSecondary, fontSize: SIZES.md },
  name: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy },
  signOutBtn: { padding:8, borderRadius: RADIUS.md, borderWidth:1, borderColor:'#FF4B4B33' },
  signOutText: { color: COLORS.error, fontSize: SIZES.sm },
  statsRow: { flexDirection:'row', paddingHorizontal:16, gap:8, marginBottom:8 },
  statCard: { flex:1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  statCardRose: { backgroundColor: COLORS.roseGoldDark, borderColor: COLORS.roseGold },
  statValue: { fontSize: SIZES.xl, ...FONTS.bold, color: COLORS.roseGold, marginBottom:2 },
  statLabel: { fontSize:10, color: COLORS.textMuted, textAlign:'center' },
  tabRow: { flexDirection:'row', paddingHorizontal:16, gap:8, marginVertical:8 },
  tabBtn: { flex:1, paddingVertical:10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  tabTextActive: { color: COLORS.white },
  freeLogBtn: { marginHorizontal:16, marginBottom:8, paddingVertical:12, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder, alignItems:'center' },
  freeLogBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  onboardingCard: { margin:16, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:24, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  onboardingEmoji: { fontSize:48, marginBottom:12 },
  onboardingTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl, marginBottom:8 },
  onboardingText: { color: COLORS.textSecondary, fontSize: SIZES.sm, textAlign:'center', lineHeight:20 },
  section: { paddingHorizontal:16, marginTop:8 },
  sectionTitle: { fontSize: SIZES.sm, ...FONTS.bold, color: COLORS.white, marginBottom:12, textTransform:'uppercase', letterSpacing:1 },
  restCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:32, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  restEmoji: { fontSize:48, marginBottom:8 },
  restText: { fontSize: SIZES.xl, ...FONTS.bold, color: COLORS.white, marginBottom:4 },
  restSub: { fontSize: SIZES.sm, color: COLORS.textSecondary },
  workoutCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:20, borderWidth:1, borderColor: COLORS.roseGoldMid, marginBottom:8 },
  workoutCardTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  workoutCardDay: { fontSize: SIZES.sm, color: COLORS.roseGold, ...FONTS.semibold },
  workoutCardName: { fontSize: SIZES.xl, ...FONTS.bold, color: COLORS.white, marginTop:2 },
  startBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal:20, paddingVertical:10 },
  startBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  exerciseList: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  exerciseChip: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, paddingHorizontal:12, paddingVertical:6, flexDirection:'row', alignItems:'center', gap:6 },
  exerciseChipText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  exerciseChipSets: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold },
  rescheduleBtn: { paddingVertical:10, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder, alignItems:'center', marginBottom:8 },
  rescheduleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  dayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:10, borderWidth:1, borderColor: COLORS.darkBorder },
  dayCardToday: { borderColor: COLORS.roseGold },
  dayCardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  dayCardLeft: {},
  dayCardDay: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dayCardCount: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  dayLogBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal:16, paddingVertical:6 },
  dayLogBtnText: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  dayExRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderTopWidth:0.5, borderTopColor: COLORS.darkBorder },
  dayExName: { color: COLORS.textSecondary, fontSize: SIZES.sm, flex:1 },
  dayExMeta: { color: COLORS.textMuted, fontSize: SIZES.xs },
  restDayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:8, borderWidth:1, borderColor: COLORS.darkBorder, alignItems:'center' },
  restDayText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  actionsRow: { flexDirection:'row', gap:8, flexWrap:'wrap' },
  actionCard: { width:'22%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:12, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  actionEmoji: { fontSize:24, marginBottom:4 },
  actionText: { color: COLORS.white, fontSize:10, ...FONTS.semibold, textAlign:'center' },
});