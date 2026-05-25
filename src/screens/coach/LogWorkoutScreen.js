import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, Animated, Platform, AppState
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getCurrentPhase, getPhaseForDate } from '../../data/cycleData';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];
const TIMER_PRESETS = [30, 60, 90, 120, 180, 300];
const SET_TYPES = ['normal','superset','rest_pause','drop_set'];
const SET_TYPE_LABELS = { normal: 'Normal', superset: 'SS', rest_pause: 'RP', drop_set: 'DS' };
const SET_TYPE_COLORS = {
  normal: COLORS.darkBorder,
  superset: '#4ECDC4',
  rest_pause: '#FFE66D',
  drop_set: '#FF6B6B',
};
const PHASE_MODIFIERS = {
  menstrual: { weightMult: 0.75, repsRange: '12-15', label: 'Low Intensity', color: '#FF6B6B', tip: 'Reduce weight 20-30%, higher reps' },
  follicular: { weightMult: 1.0, repsRange: null, label: 'Normal / Build', color: '#4ECDC4', tip: 'Normal prescription — energy rising' },
  ovulat: { weightMult: 1.05, repsRange: null, label: 'Peak Performance', color: '#FFE66D', tip: 'Peak window — try for PRs' },
  luteal: { weightMult: 0.875, repsRange: '10-12', label: 'Moderate Reduction', color: '#FF9F43', tip: 'Reduce weight 10-15%, focus on form' },
};

function getPhaseModifier(phaseName) {
  if (!phaseName) return null;
  const n = phaseName.toLowerCase();
  for (const [key, mod] of Object.entries(PHASE_MODIFIERS)) {
    if (n.includes(key)) return mod;
  }
  return null;
}

export default function LogWorkoutScreen({ route, navigation }) {
  const { client } = route.params || {};
  const { user, unit } = useAuth();
  const ul = unitLabel(unit);

  const [selectedDay, setSelectedDay] = useState(
    DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  );
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [program, setProgram] = useState(null);
  const [cyclePhase, setCyclePhase] = useState(null);
  const [previousLogs, setPreviousLogs] = useState({});
  const [cycles, setCycles] = useState([]);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  // Superset linking
  const [showSupersetModal, setShowSupersetModal] = useState(false);
  const [supersetSourceIdx, setSupersetSourceIdx] = useState(null);
  const [supersetGroups, setSupersetGroups] = useState({});

  // Timer — Date.now() based for mobile reliability
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerDuration, setTimerDuration] = useState(90);
  const [timerCustomInput, setTimerCustomInput] = useState('');
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const timerEndTimeRef = useRef(null);
  const timerRemainingRef = useRef(90);
  const timerIntervalRef = useRef(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (client) {
      fetchClientProgram();
      if (client.gender === 'Female') fetchCyclePhase();
    }
  }, []);

  // Unsaved warning — web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  // Unsaved warning — mobile (React Navigation)
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        if (!hasUnsaved) return;
        e.preventDefault();
        showConfirm(
          'Discard workout?',
          'You have unsaved sets. Leave anyway?',
          () => navigation.dispatch(e.data.action),
          null, 'Leave', true
        );
      });
      return unsubscribe;
    }, [hasUnsaved, navigation])
  );

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.darkBg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.white }}>No client selected</Text>
      </View>
    );
  }

  // ── TIMER (Date.now() based — works on mobile) ────────

  function startTimer(seconds) {
    clearInterval(timerIntervalRef.current);
    timerEndTimeRef.current = Date.now() + seconds * 1000;
    timerRemainingRef.current = seconds;
    setTimerDuration(seconds);
    setTimerSeconds(seconds);
    setTimerRunning(true);
    setTimerPaused(false);
    setTimerFinished(false);
    setShowTimerModal(false);

    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEndTimeRef.current - Date.now()) / 1000));
      setTimerSeconds(remaining);
      timerRemainingRef.current = remaining;
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        setTimerFinished(true);
        triggerTimerAlert();
      }
    }, 250);
  }

  function pauseResumeTimer() {
    if (timerPaused) {
      // Resume — reset end time based on remaining
      timerEndTimeRef.current = Date.now() + timerRemainingRef.current * 1000;
      setTimerPaused(false);
      timerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((timerEndTimeRef.current - Date.now()) / 1000));
        setTimerSeconds(remaining);
        timerRemainingRef.current = remaining;
        if (remaining <= 0) {
          clearInterval(timerIntervalRef.current);
          setTimerRunning(false);
          setTimerFinished(true);
          triggerTimerAlert();
        }
      }, 250);
    } else {
      // Pause
      clearInterval(timerIntervalRef.current);
      setTimerPaused(true);
    }
  }

  function resetTimer() {
    clearInterval(timerIntervalRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerFinished(false);
    setTimerSeconds(timerDuration);
    timerRemainingRef.current = timerDuration;
  }

  function restartTimer() { startTimer(timerDuration); }

  useEffect(() => {
    return () => clearInterval(timerIntervalRef.current);
  }, []);

  function triggerTimerAlert() {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('⏱️ Rest Complete!', { body: `${client.name} is ready for the next set!` });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification('⏱️ Rest Complete!', { body: `${client.name} is ready!` });
          }
        });
      }
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  const timerColor = timerSeconds <= 10 ? '#FF6B6B'
    : timerSeconds <= 30 ? '#FFE66D' : COLORS.success;
  const timerProgress = timerDuration > 0 ? timerSeconds / timerDuration : 0;

  // ── CLIENT PROGRAM ────────────────────────────────────

  async function fetchClientProgram() {
    const { data: prog } = await supabase
      .from('client_programs')
      .select('*, workout_templates(*, template_exercises(*))')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setProgram(prog);
    if (prog?.workout_templates?.template_exercises) {
      loadDayExercises(selectedDay, prog);
    }
  }

  async function fetchCyclePhase() {
    const { data: cycles } = await supabase
      .from('menstrual_cycles').select('*')
      .eq('client_id', client.id)
      .order('cycle_start_date', { ascending: false }).limit(1);
    if (cycles && cycles.length > 0) {
      setCycles(cycles);
      const phase = getCurrentPhase(cycles[0].cycle_start_date, cycles[0].cycle_length);
      if (phase) setCyclePhase(phase);
    }
  }

  async function loadDayExercises(day, prog) {
    const p = prog || program;
    if (!p?.workout_templates?.template_exercises) { setSets([]); return; }
    const seen = new Set();
    const dayExs = p.workout_templates.template_exercises
      .filter(e => e.day === day)
      .sort((a, b) => a.order_index - b.order_index)
      .filter(ex => {
        if (seen.has(ex.exercise_name)) return false;
        seen.add(ex.exercise_name); return true;
      });
    const exerciseSets = dayExs.map(ex => ({
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group || 'Other',
      prescribed_sets: ex.working_sets || 3,
      prescribed_reps: ex.reps || '8-12',
      entries: Array.from({ length: ex.working_sets || 3 }, () => ({
        weight: '', reps: ex.reps?.split('-')[0] || '',
        unit: client.unit_preference || unit || 'kg',
        is_pb: false, set_type: 'normal', superset_group: null,
      }))
    }));
    setSets(exerciseSets);
    // Fetch previous logs
    for (const ex of dayExs) {
      const { data } = await supabase
        .from('workout_logs').select('*')
        .eq('client_id', client.id)
        .eq('exercise_name', ex.exercise_name)
        .order('logged_at', { ascending: false }).limit(10);
      if (data?.length > 0) {
        setPreviousLogs(prev => ({ ...prev, [ex.exercise_name]: data }));
      }
    }
  }

  // ── SET MANAGEMENT ────────────────────────────────────

  function updateEntry(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
    if (field === 'weight' || field === 'reps') setHasUnsaved(true);

    // Auto-start short timer for rest-pause
    if (field === 'set_type' && value === 'rest_pause') {
      startTimer(20);
    }
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, {
          weight: '', reps: '', unit: client.unit_preference || unit || 'kg',
          is_pb: false, set_type: 'normal', superset_group: null,
        }] }
      : ex
    ));
  }

  function removeSet(exIdx, setIdx) {
    showConfirm('Remove Set', 'Remove this set?', () => {
      setSets(s => s.map((ex, i) => i === exIdx
        ? { ...ex, entries: ex.entries.filter((_, j) => j !== setIdx) }
        : ex
      ));
    }, null, 'Remove', true);
  }

  function removeExercise(exIdx) {
    showConfirm('Remove Exercise', 'Remove this exercise?', () => {
      setSets(s => s.filter((_, i) => i !== exIdx));
    }, null, 'Remove', true);
  }

  function addExercise() {
    if (!newEx.name.trim()) { showAlert('Error', 'Exercise name required'); return; }
    setSets(s => [...s, {
      exercise_name: newEx.name.trim(),
      muscle_group: newEx.muscle_group,
      prescribed_sets: 3, prescribed_reps: '8-12',
      entries: [{ weight: '', reps: '', unit: client.unit_preference || unit || 'kg',
        is_pb: false, set_type: 'normal', superset_group: null }]
    }]);
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
  }

  // ── SUPERSET LINKING ──────────────────────────────────

  function openSupersetLink(exIdx) {
    setSupersetSourceIdx(exIdx);
    setShowSupersetModal(true);
  }

  function linkSuperset(targetIdx) {
    if (targetIdx === supersetSourceIdx) {
      showAlert('Error', 'Cannot link an exercise with itself'); return;
    }
    const groupKey = `SS${String.fromCharCode(65 + Object.keys(supersetGroups).length)}`;
    const existing = supersetGroups[supersetSourceIdx] || supersetGroups[targetIdx];
    const key = existing || groupKey;
    setSupersetGroups(g => ({
      ...g,
      [supersetSourceIdx]: key,
      [targetIdx]: key,
    }));
    // Tag all sets in both exercises
    setSets(s => s.map((ex, i) => {
      if (i === supersetSourceIdx || i === targetIdx) {
        return { ...ex, entries: ex.entries.map(e => ({ ...e, set_type: 'superset', superset_group: key })) };
      }
      return ex;
    }));
    setShowSupersetModal(false);
    showAlert('✅ Linked!', `${sets[supersetSourceIdx].exercise_name} + ${sets[targetIdx].exercise_name} are now a superset (${key})`);
  }

  function unlinkSuperset(exIdx) {
    const group = supersetGroups[exIdx];
    setSupersetGroups(g => {
      const updated = { ...g };
      Object.keys(updated).forEach(k => { if (updated[k] === group) delete updated[k]; });
      return updated;
    });
    setSets(s => s.map((ex, i) => {
      if (supersetGroups[i] === group) {
        return { ...ex, entries: ex.entries.map(e => ({ ...e, set_type: 'normal', superset_group: null })) };
      }
      return ex;
    }));
  }

  // ── DROP SET SUGGESTION ───────────────────────────────

  function getDropSetSuggestion(exIdx, setIdx) {
    const ex = sets[exIdx];
    const prevEntry = ex.entries[setIdx - 1];
    if (!prevEntry?.weight) return null;
    const prevWeight = parseFloat(prevEntry.weight);
    const suggestedWeight = (prevWeight * 0.8).toFixed(1);
    return suggestedWeight;
  }

  // ── PROGRESSION SUGGESTION ────────────────────────────

  function getProgressionSuggestion(exerciseName, ex) {
    const prev = previousLogs[exerciseName];
    if (!prev || prev.length === 0) return null;
    const prescribedRepsStr = ex.prescribed_reps || '8';
    const prescribedReps = parseInt(prescribedRepsStr.split('-')[0]) || 8;
    const prescribedRepsMax = parseInt(prescribedRepsStr.split('-').pop()) || prescribedReps;
    const maxWeight = Math.max(...prev.map(l => l.weight_kg || 0));
    const avgReps = prev.reduce((s, l) => s + (l.reps || 0), 0) / prev.length;
    let suggestion = '', suggestionColor = COLORS.success, actionType = '';
    if (avgReps >= prescribedRepsMax) {
      const addWeight = unit === 'lbs' ? 5 : 2.5;
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Try ${toDisplay(maxWeight + addWeight, unit)}${ul} for ${prescribedReps} reps`;
      suggestionColor = '#FFE66D'; actionType = 'weight';
    } else if (avgReps >= prescribedReps) {
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Add a rep: aim for ${Math.round(avgReps) + 1}`;
      suggestionColor = COLORS.success; actionType = 'reps';
    } else {
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Same weight, focus on form`;
      suggestionColor = '#FF9F43'; actionType = 'consolidate';
    }
    return { suggestion, suggestionColor, actionType };
  }

  function getCycleSuggestion(exerciseName, ex) {
    if (!cyclePhase || !phaseModifier) return null;
    const prev = previousLogs[exerciseName];
    if (!prev || prev.length === 0) return null;
    const maxWeight = Math.max(...prev.map(l => l.weight_kg || 0));
    const suggested = toDisplay(maxWeight * phaseModifier.weightMult, unit);
    return {
      text: `${exerciseName}: ${suggested}${ul} × ${phaseModifier.repsRange || ex.prescribed_reps}`,
      color: phaseModifier.color,
    };
  }

  // ── DATE ──────────────────────────────────────────────

  function confirmDate() {
    if (!dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      showAlert('Invalid Date', 'Use YYYY-MM-DD format'); return;
    }
    setSelectedDate(dateInput);
    const d = new Date(dateInput + 'T12:00:00');
    const dayName = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
    const monthName = MONTHS[d.getMonth()];
    setSelectedDay(dayName);
    setSelectedMonth(monthName);
    setShowDatePicker(false);
    loadDayExercises(dayName, null);
  }

  // ── SAVE ──────────────────────────────────────────────

  async function handleSave() {
    const hasData = sets.some(ex => ex.entries.some(e => e.weight || e.reps));
    if (!hasData) { showAlert('No data', 'Log at least one set before saving'); return; }
    setLoading(true);
    const rows = [];
    const cyclePhaseTag = cyclePhase?.name || null;
    for (const ex of sets) {
      const { data: prData } = await supabase
        .from('workout_logs').select('weight_kg')
        .eq('client_id', client.id)
        .eq('exercise_name', ex.exercise_name)
        .order('weight_kg', { ascending: false }).limit(1);
      const currentPR = prData?.[0]?.weight_kg || 0;
      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        const weightKg = entry.weight ? toKg(parseFloat(entry.weight), entry.unit) : null;
        rows.push({
          client_id: client.id,
          logged_by: user?.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: selectedMonth,
          week: 1,
          day: selectedDay,
          set_type: entry.set_type || 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: weightKg && weightKg > currentPR,
          logged_at: new Date(selectedDate + 'T12:00:00').toISOString(),
          cycle_phase: cyclePhaseTag,
          superset_group: entry.superset_group || null,
          exercise_set_type: entry.set_type || 'normal',
        });
      });
    }
    if (sessionNote.trim()) {
      await supabase.from('session_notes').upsert({
        client_id: client.id,
        date: selectedDate,
        note: sessionNote.trim(),
      }, { onConflict: 'client_id,date' });
    }
    const { error } = await supabase.from('workout_logs').insert(rows);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }
    const prs = rows.filter(r => r.is_personal_best).length;
    const ssCount = rows.filter(r => r.exercise_set_type === 'superset').length;
    const dsCount = rows.filter(r => r.exercise_set_type === 'drop_set').length;
    const rpCount = rows.filter(r => r.exercise_set_type === 'rest_pause').length;
    let details = `${rows.length} sets logged`;
    if (prs > 0) details += ` 🏆 ${prs} PR!`;
    if (ssCount > 0) details += ` · ${ssCount} SS sets`;
    if (dsCount > 0) details += ` · ${dsCount} Drop sets`;
    if (rpCount > 0) details += ` · ${rpCount} Rest-pause sets`;
    setHasUnsaved(false);
    showAlert('✅ Workout Saved!', details, [
      { text: 'Done', onPress: () => navigation.goBack() }
    ]);
  }

  const phaseModifier = cyclePhase ? getPhaseModifier(cyclePhase.name) : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Client banner */}
        <View style={styles.clientBanner}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.clientSub}>
              {program ? program.workout_templates?.name : 'No program assigned'}
            </Text>
          </View>
          {hasUnsaved && (
            <View style={styles.unsavedBadge}>
              <Text style={styles.unsavedBadgeText}>Unsaved</Text>
            </View>
          )}
        </View>

        {/* Cycle phase banner */}
        {cyclePhase && phaseModifier && (
          <View style={[styles.cycleBanner, { borderColor: phaseModifier.color }]}>
            <View style={styles.cycleBannerHeader}>
              <Text style={styles.cycleBannerEmoji}>{cyclePhase.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cycleBannerPhase, { color: phaseModifier.color }]}>
                  {cyclePhase.name} — Day {cyclePhase.dayInPhase}
                </Text>
                <Text style={styles.cycleBannerLabel}>
                  {phaseModifier.label} · {phaseModifier.tip}
                </Text>
              </View>
            </View>
            {sets.filter(ex => ex.exercise_name).length > 0 && (
              <View style={styles.cycleSuggestionsBox}>
                <Text style={styles.cycleSuggestionsTitle}>
                  💡 Recommended adjustments for today:
                </Text>
                {sets.filter(ex => ex.exercise_name).map((ex, i) => {
                  const sug = getCycleSuggestion(ex.exercise_name, ex);
                  if (!sug) return null;
                  return (
                    <Text key={i} style={[styles.cycleSuggestionItem, { color: sug.color }]}>
                      • {sug.text}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Date banner */}
        <View style={styles.dayBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayText}>{selectedDay} — {selectedMonth}</Text>
            <Text style={styles.dateSubText}>📅 {selectedDate}</Text>
          </View>
          <TouchableOpacity style={styles.changeDateBtn}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.changeDateBtnText}>Change Date</Text>
          </TouchableOpacity>
        </View>

        {/* Day selector */}
        <Text style={styles.sectionLabel}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {DAYS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.chip, selectedDay === d && styles.chipActive]}
              onPress={() => { setSelectedDay(d); loadDayExercises(d, null); }}>
              <Text style={[styles.chipText, selectedDay === d && styles.chipTextActive]}>
                {d.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Session note */}
        <Text style={styles.sectionLabel}>Session Note</Text>
        <RNTextInput value={sessionNote} onChangeText={setSessionNote}
          style={styles.noteInput}
          placeholder="How did the session go?"
          placeholderTextColor={COLORS.textMuted} multiline />

        {/* Exercises */}
        <Text style={styles.sectionLabel}>Exercises</Text>
        {sets.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No exercises loaded</Text>
            <Text style={styles.emptySub}>Select a day or add exercises manually</Text>
          </View>
        )}

        {sets.map((ex, exIdx) => {
          const progression = getProgressionSuggestion(ex.exercise_name, ex);
          const ssGroup = supersetGroups[exIdx];
          return (
            <View key={exIdx} style={[styles.exerciseCard,
              ssGroup && { borderLeftColor: '#4ECDC4', borderLeftWidth: 3 }]}>

              {/* Superset group label */}
              {ssGroup && (
                <View style={styles.ssGroupBanner}>
                  <Text style={styles.ssGroupText}>🔗 {ssGroup}</Text>
                  <TouchableOpacity onPress={() => unlinkSuperset(exIdx)}>
                    <Text style={styles.ssUnlinkText}>Unlink</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.exHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.exercise_name || 'New Exercise'}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                  <Text style={styles.prescribedText}>
                    Prescribed: {ex.prescribed_sets}×{ex.prescribed_reps}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                    <Text style={{ fontSize: 18 }}>🗑️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openSupersetLink(exIdx)}>
                    <Text style={{ fontSize: 14 }}>🔗</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {progression && (
                <View style={[styles.progressionCard, { borderColor: progression.suggestionColor }]}>
                  <View style={styles.progressionHeader}>
                    <Text style={styles.progressionIcon}>
                      {progression.actionType === 'weight' ? '⬆️'
                        : progression.actionType === 'reps' ? '➕' : '🔄'}
                    </Text>
                    <Text style={styles.progressionTitle}>
                      {progression.actionType === 'weight' ? 'Add weight!'
                        : progression.actionType === 'reps' ? 'Add a rep!'
                        : 'Consolidate'}
                    </Text>
                  </View>
                  <Text style={[styles.progressionText, { color: progression.suggestionColor }]}>
                    {progression.suggestion}
                  </Text>
                </View>
              )}

              {ex.entries.map((entry, setIdx) => {
                const dropSuggestion = entry.set_type === 'drop_set'
                  ? getDropSetSuggestion(exIdx, setIdx) : null;
                return (
                  <View key={setIdx} style={[styles.setCard,
                    entry.set_type !== 'normal' && {
                      borderColor: SET_TYPE_COLORS[entry.set_type],
                      borderWidth: 1.5,
                    }]}>
                    <View style={styles.setCardHeader}>
                      <View style={[styles.setNumBadge, {
                        borderColor: SET_TYPE_COLORS[entry.set_type] || COLORS.roseGold
                      }]}>
                        <Text style={[styles.setNumBadgeText, {
                          color: SET_TYPE_COLORS[entry.set_type] || COLORS.roseGold
                        }]}>
                          {entry.set_type === 'superset' && ssGroup ? `${ssGroup} ` : ''}
                          Set {setIdx + 1}
                        </Text>
                      </View>
                      <View style={styles.setCardActions}>
                        <TouchableOpacity
                          style={[styles.prBtn, entry.is_pb && styles.prBtnActive]}
                          onPress={() => updateEntry(exIdx, setIdx, 'is_pb', !entry.is_pb)}>
                          <Text style={styles.prBtnText}>
                            {entry.is_pb ? '🏆 PR' : '○ PR'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.removeSetBtn}
                          onPress={() => removeSet(exIdx, setIdx)}>
                          <Text style={{ color: COLORS.error }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Set type chips */}
                    <View style={styles.setTypeRow}>
                      {SET_TYPES.map(type => (
                        <TouchableOpacity key={type}
                          style={[styles.setTypeChip, {
                            backgroundColor: entry.set_type === type
                              ? SET_TYPE_COLORS[type] : 'transparent',
                            borderColor: SET_TYPE_COLORS[type],
                          }]}
                          onPress={() => updateEntry(exIdx, setIdx, 'set_type', type)}>
                          <Text style={[styles.setTypeChipText, {
                            color: entry.set_type === type ? COLORS.white : SET_TYPE_COLORS[type]
                          }]}>
                            {SET_TYPE_LABELS[type]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Drop set suggestion */}
                    {dropSuggestion && (
                      <TouchableOpacity
                        style={styles.dropSuggest}
                        onPress={() => updateEntry(exIdx, setIdx, 'weight', dropSuggestion)}>
                        <Text style={styles.dropSuggestText}>
                          💡 Suggested drop: {dropSuggestion}{entry.unit} (−20%) — tap to apply
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.setCardInputs}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputGroupLabel}>Weight</Text>
                        <RNTextInput value={entry.weight}
                          onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                          style={styles.inputGroupField} placeholder="0"
                          placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                      </View>
                      <TouchableOpacity style={styles.unitToggle}
                        onPress={() => updateEntry(exIdx, setIdx, 'unit',
                          entry.unit === 'kg' ? 'lbs' : 'kg')}>
                        <Text style={styles.unitToggleText}>{entry.unit}</Text>
                      </TouchableOpacity>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputGroupLabel}>Reps</Text>
                        <RNTextInput value={entry.reps}
                          onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                          style={styles.inputGroupField} placeholder="0"
                          placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                      </View>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
                <Text style={styles.addSetBtnText}>+ Add Set</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addExBtn} onPress={() => setShowAddEx(true)}>
          <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, loading && { opacity: 0.6 }]}
          onPress={handleSave} disabled={loading}>
          <Text style={styles.saveBtnText}>
            {loading ? 'Saving...' : '💾 Save Workout'}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Floating timer */}
      <Animated.View style={[styles.timerFab, {
        backgroundColor: timerRunning
          ? (timerFinished ? '#FF6B6B' : timerColor)
          : COLORS.roseGold,
        opacity: flashAnim.interpolate({
          inputRange: [0, 1], outputRange: [1, 0.2]
        }),
      }]}>
        <TouchableOpacity style={styles.timerFabInner}
          onPress={() => {
            if (timerRunning || timerFinished) return;
            setShowTimerModal(true);
          }}
          onLongPress={() => { if (timerRunning) pauseResumeTimer(); }}>
          <Text style={styles.timerFabIcon}>⏱️</Text>
          <Text style={styles.timerFabText}>
            {timerRunning || timerFinished ? formatTime(timerSeconds) : 'Rest'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Timer overlay */}
      {(timerRunning || timerFinished) && (
        <View style={styles.timerOverlay}>
          <View style={styles.timerOverlayCard}>
            <Text style={styles.timerOverlayTitle}>
              {timerFinished ? '✅ Rest Complete!' : '⏱️ Rest Timer'}
            </Text>
            <Text style={[styles.timerOverlayCount, { color: timerColor }]}>
              {formatTime(timerSeconds)}
            </Text>
            <View style={styles.timerProgressBg}>
              <View style={[styles.timerProgressFill, {
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
              }]} />
            </View>
            <View style={styles.timerOverlayBtns}>
              {!timerFinished ? (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={pauseResumeTimer}>
                    <Text style={styles.timerOverlayBtnText}>
                      {timerPaused ? '▶ Resume' : '⏸ Pause'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={resetTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Reset</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={restartTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.timerOverlayBtn, { backgroundColor: COLORS.roseGold }]}
                    onPress={resetTimer}>
                    <Text style={[styles.timerOverlayBtnText, { color: COLORS.white }]}>
                      ✕ Close
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Date picker modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📅 Select Date</Text>
            <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
            <RNTextInput value={dateInput} onChangeText={setDateInput}
              style={styles.modalInput} placeholder="e.g. 2026-04-15"
              placeholderTextColor={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 12 }}>
              You can log workouts for any past date
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmDate}>
                <Text style={styles.modalSaveText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add exercise modal */}
      <Modal visible={showAddEx} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>➕ Add Exercise</Text>
            <Text style={styles.modalLabel}>Exercise Name</Text>
            <RNTextInput value={newEx.name}
              onChangeText={v => setNewEx(e => ({ ...e, name: v }))}
              style={styles.modalInput} placeholder="e.g. Barbell Bench Press"
              placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Muscle Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}>
              {MUSCLE_GROUPS.map(m => (
                <TouchableOpacity key={m}
                  style={[styles.chip, newEx.muscle_group === m && styles.chipActive]}
                  onPress={() => setNewEx(e => ({ ...e, muscle_group: m }))}>
                  <Text style={[styles.chipText, newEx.muscle_group === m && styles.chipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowAddEx(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={addExercise}>
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Timer setup modal */}
      <Modal visible={showTimerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⏱️ Set Rest Timer</Text>
            <Text style={styles.modalLabel}>Quick Presets</Text>
            <View style={styles.timerPresets}>
              {TIMER_PRESETS.map(s => (
                <TouchableOpacity key={s} style={styles.timerPresetBtn}
                  onPress={() => startTimer(s)}>
                  <Text style={styles.timerPresetBtnText}>
                    {s < 60 ? `${s}s` : `${s / 60}min`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Custom (seconds)</Text>
            <RNTextInput value={timerCustomInput}
              onChangeText={setTimerCustomInput}
              style={styles.modalInput} placeholder="e.g. 45"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowTimerModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={() => {
                  const secs = parseInt(timerCustomInput);
                  if (!secs || secs <= 0) {
                    showAlert('Error', 'Enter a valid number of seconds'); return;
                  }
                  startTimer(secs);
                }}>
                <Text style={styles.modalSaveText}>▶ Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Superset link modal */}
      <Modal visible={showSupersetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔗 Link Superset</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom: 16 }}>
              Select which exercise to pair with{' '}
              <Text style={{ color: COLORS.white, ...FONTS.bold }}>
                {supersetSourceIdx !== null ? sets[supersetSourceIdx]?.exercise_name : ''}
              </Text>
            </Text>
            {sets.map((ex, i) => {
              if (i === supersetSourceIdx) return null;
              return (
                <TouchableOpacity key={i} style={styles.ssLinkOption}
                  onPress={() => linkSuperset(i)}>
                  <Text style={styles.ssLinkOptionText}>{ex.exercise_name}</Text>
                  <Text style={styles.ssLinkOptionMuscle}>{ex.muscle_group}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.modalCancelBtn, { marginTop: 12 }]}
              onPress={() => setShowSupersetModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 120 },
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.lg, marginBottom: 12 },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.white, fontSize: 18, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.xs },
  unsavedBadge: { backgroundColor: '#FFE66D33', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#FFE66D' },
  unsavedBadgeText: { color: '#FFE66D', fontSize: 9, ...FONTS.bold },
  cycleBanner: { borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, borderWidth: 2, backgroundColor: COLORS.darkCard },
  cycleBannerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  cycleBannerEmoji: { fontSize: 24 },
  cycleBannerPhase: { fontSize: SIZES.md, ...FONTS.bold },
  cycleBannerLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, lineHeight: 16, marginTop: 2 },
  cycleSuggestionsBox: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  cycleSuggestionsTitle: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 6 },
  cycleSuggestionItem: { fontSize: SIZES.xs, lineHeight: 18, marginBottom: 3 },
  dayBanner: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  dayText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dateSubText: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  changeDateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.md, backgroundColor: COLORS.roseGoldFaint, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  changeDateBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  chipScroll: { marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  noteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 60, textAlignVertical: 'top', marginBottom: 4 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  ssGroupBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#4ECDC422', borderRadius: RADIUS.md, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#4ECDC4' },
  ssGroupText: { color: '#4ECDC4', fontSize: SIZES.xs, ...FONTS.bold },
  ssUnlinkText: { color: COLORS.error, fontSize: SIZES.xs, ...FONTS.semibold },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.xs, marginTop: 2 },
  prescribedText: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  progressionCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, marginBottom: 10, borderWidth: 1, borderLeftWidth: 3 },
  progressionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  progressionIcon: { fontSize: 14 },
  progressionTitle: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  progressionText: { fontSize: SIZES.xs, lineHeight: 18 },
  setCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  setCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  setNumBadge: { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  setNumBadgeText: { fontSize: SIZES.xs, ...FONTS.bold },
  setCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid, borderColor: COLORS.roseGold },
  prBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  removeSetBtn: { padding: 4, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.sm },
  setTypeRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  setTypeChip: { flex: 1, paddingVertical: 5, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1.5 },
  setTypeChipText: { fontSize: 9, ...FONTS.bold },
  dropSuggest: { backgroundColor: '#FF6B6B11', borderRadius: RADIUS.md, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#FF6B6B44' },
  dropSuggestText: { color: '#FF6B6B', fontSize: SIZES.xs, ...FONTS.semibold },
  setCardInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  inputGroup: { flex: 1 },
  inputGroupLabel: { color: COLORS.textMuted, fontSize: 9, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  inputGroupField: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 8, color: COLORS.white, fontSize: SIZES.lg, borderWidth: 1, borderColor: COLORS.darkBorder, textAlign: 'center', ...FONTS.bold, height: 44 },
  unitToggle: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid, alignItems: 'center', justifyContent: 'center', height: 44, minWidth: 48 },
  unitToggleText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  addSetBtn: { marginTop: 6, alignItems: 'center', padding: 6, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  addExBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  addExBtnText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginBottom: 8, elevation: 6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  timerFab: { position: 'absolute', bottom: 24, right: 16, borderRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  timerFabInner: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', minWidth: 70 },
  timerFabIcon: { fontSize: 20 },
  timerFabText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold, marginTop: 2 },
  timerOverlay: { position: 'absolute', bottom: 90, right: 16, left: 16 },
  timerOverlayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 20, borderWidth: 2, borderColor: COLORS.roseGold, elevation: 10 },
  timerOverlayTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, textAlign: 'center', marginBottom: 8 },
  timerOverlayCount: { fontSize: 56, ...FONTS.heavy, textAlign: 'center', marginBottom: 12 },
  timerProgressBg: { height: 6, backgroundColor: COLORS.darkCard2, borderRadius: 3, marginBottom: 16, overflow: 'hidden' },
  timerProgressFill: { height: 6, borderRadius: 3 },
  timerOverlayBtns: { flexDirection: 'row', gap: 10 },
  timerOverlayBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  timerOverlayBtnText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  timerPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  timerPresetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGoldFaint, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  timerPresetBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
  ssLinkOption: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  ssLinkOptionText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  ssLinkOptionMuscle: { color: COLORS.roseGold, fontSize: SIZES.xs, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});