import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, Animated, Platform
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getPhaseForDate } from '../../data/cycleData';

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIMER_PRESETS = [30, 60, 90, 120, 180, 300];
const SET_TYPES = ['normal','superset','rest_pause','drop_set'];
const SET_TYPE_LABELS = { normal: 'Normal', superset: 'SS', rest_pause: 'RP', drop_set: 'DS' };
const SET_TYPE_COLORS = {
  normal: COLORS.darkBorder,
  superset: '#4ECDC4',
  rest_pause: '#FFE66D',
  drop_set: '#FF6B6B',
};

export default function ClientLogScreen({ route, navigation }) {
  const { exercises = [], day = '', freeLog = false } = route.params || {};
  const { profile, unit } = useAuth();
  const currentMonth = MONTHS[new Date().getMonth()];
  const ul = unitLabel(unit);

  const [sessionNote, setSessionNote] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [selectedDay, setSelectedDay] = useState(
    day || DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  );
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [previousLogs, setPreviousLogs] = useState({});
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [cyclePhase, setCyclePhase] = useState(null);

  // Superset linking
  const [showSupersetModal, setShowSupersetModal] = useState(false);
  const [supersetSourceIdx, setSupersetSourceIdx] = useState(null);
  const [supersetGroups, setSupersetGroups] = useState({});

  // Timer — Date.now() based
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
    initSets();
    fetchPreviousLogs();
    if (profile?.gender === 'Female') fetchCyclePhase();
    return () => clearInterval(timerIntervalRef.current);
  }, []);

  // Unsaved warning — web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  // Unsaved warning — mobile
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

  async function fetchCyclePhase() {
    if (!profile) return;
    const { data: cycles } = await supabase
      .from('menstrual_cycles').select('*')
      .eq('client_id', profile.id)
      .order('cycle_start_date', { ascending: false }).limit(1);
    if (cycles && cycles.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const phase = getPhaseForDate(today, cycles[0].cycle_start_date, cycles[0].cycle_length);
      if (phase) setCyclePhase(phase);
    }
  }

  function initSets() {
    if (exercises.length > 0) {
      setSets(exercises.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || 'Other',
        prescribed_sets: ex.working_sets || 3,
        prescribed_reps: ex.reps || '8-12',
        entries: Array.from({ length: ex.working_sets || 3 }, () => ({
          weight: '', reps: ex.reps?.split('-')[0] || '',
          unit: profile?.unit_preference || unit || 'kg',
          is_pb: false, set_type: 'normal', superset_group: null,
        }))
      })));
    }
  }

  async function fetchPreviousLogs() {
    if (!profile || exercises.length === 0) return;
    for (const ex of exercises) {
      const { data } = await supabase
        .from('workout_logs').select('*')
        .eq('client_id', profile.id)
        .eq('exercise_name', ex.exercise_name)
        .order('logged_at', { ascending: false }).limit(10);
      if (data?.length > 0) {
        setPreviousLogs(prev => ({ ...prev, [ex.exercise_name]: data }));
      }
    }
  }

  // ── TIMER (Date.now() based) ──────────────────────────

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
      clearInterval(timerIntervalRef.current);
      setTimerPaused(true);
    }
  }

  function resetTimer() {
    clearInterval(timerIntervalRef.current);
    setTimerRunning(false); setTimerPaused(false);
    setTimerFinished(false); setTimerSeconds(timerDuration);
    timerRemainingRef.current = timerDuration;
  }

  function restartTimer() { startTimer(timerDuration); }

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
        new Notification('⏱️ Rest Complete!', { body: 'Next set ready!' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification('⏱️ Rest Complete!', { body: 'Next set ready!' });
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

  // ── SET MANAGEMENT ────────────────────────────────────

  function updateEntry(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
    if (field === 'weight' || field === 'reps') setHasUnsaved(true);
    if (field === 'set_type' && value === 'rest_pause') startTimer(20);
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, {
          weight: '', reps: '', unit: profile?.unit_preference || unit || 'kg',
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
      entries: [{ weight: '', reps: '', unit: profile?.unit_preference || unit || 'kg',
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
    setSupersetGroups(g => ({ ...g, [supersetSourceIdx]: key, [targetIdx]: key }));
    setSets(s => s.map((ex, i) => {
      if (i === supersetSourceIdx || i === targetIdx) {
        return { ...ex, entries: ex.entries.map(e => ({ ...e, set_type: 'superset', superset_group: key })) };
      }
      return ex;
    }));
    setShowSupersetModal(false);
    showAlert('✅ Linked!', `Superset (${key}) created!`);
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

  function getDropSetSuggestion(exIdx, setIdx) {
    const ex = sets[exIdx];
    const prevEntry = ex.entries[setIdx - 1];
    if (!prevEntry?.weight) return null;
    return (parseFloat(prevEntry.weight) * 0.8).toFixed(1);
  }

  // ── PROGRESSION ───────────────────────────────────────

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
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Try ${toDisplay(maxWeight + addWeight, unit)}${ul}`;
      suggestionColor = '#FFE66D'; actionType = 'weight';
    } else if (avgReps >= prescribedReps) {
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Add a rep`;
      suggestionColor = COLORS.success; actionType = 'reps';
    } else {
      suggestion = `Last: ${Math.round(avgReps)} reps @ ${toDisplay(maxWeight, unit)}${ul}\n→ Same weight`;
      suggestionColor = '#FF9F43'; actionType = 'consolidate';
    }
    return { suggestion, suggestionColor, actionType };
  }

  // ── DATE ──────────────────────────────────────────────

  function confirmDate() {
    if (!dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      showAlert('Invalid Date', 'Use YYYY-MM-DD format'); return;
    }
    setSelectedDate(dateInput);
    const d = new Date(dateInput + 'T12:00:00');
    setSelectedDay(DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]);
    setShowDatePicker(false);
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
        .eq('client_id', profile.id)
        .eq('exercise_name', ex.exercise_name)
        .order('weight_kg', { ascending: false }).limit(1);
      const currentPR = prData?.[0]?.weight_kg || 0;
      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        const weightKg = entry.weight ? toKg(parseFloat(entry.weight), entry.unit) : null;
        rows.push({
          client_id: profile.id,
          logged_by: profile.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: currentMonth,
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
        client_id: profile.id,
        date: selectedDate,
        note: sessionNote.trim(),
      }, { onConflict: 'client_id,date' });
    }
    const { error } = await supabase.from('workout_logs').insert(rows);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }
    const prs = rows.filter(r => r.is_personal_best).length;
    setHasUnsaved(false);
    showAlert('✅ Workout Saved!',
      `${rows.length} sets logged!${prs > 0 ? ` 🏆 ${prs} PR!` : ''}`,
      [{ text: 'Done', onPress: () => navigation.goBack() }]
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {freeLog ? '🏋️ Free Workout' : `${selectedDay}`}
            </Text>
            <Text style={styles.headerSub}>📅 {selectedDate}</Text>
          </View>
          {hasUnsaved && (
            <View style={styles.unsavedBadge}>
              <Text style={styles.unsavedBadgeText}>Unsaved</Text>
            </View>
          )}
          <TouchableOpacity style={styles.changeDateBtn}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.changeDateBtnText}>Change Date</Text>
          </TouchableOpacity>
        </View>

        {/* Cycle phase banner */}
        {cyclePhase && (
          <View style={[styles.cycleBanner, { borderColor: cyclePhase.color || COLORS.roseGold }]}>
            <Text style={styles.cycleBannerEmoji}>{cyclePhase.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cycleBannerPhase, { color: cyclePhase.color || COLORS.roseGold }]}>
                {cyclePhase.name}
              </Text>
              <Text style={styles.cycleBannerNote}>
                {cyclePhase.workoutRecommendations?.[0]}
              </Text>
            </View>
          </View>
        )}

        {/* Day selector */}
        {!freeLog && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {DAYS.map(d => (
              <TouchableOpacity key={d}
                style={[styles.chip, selectedDay === d && styles.chipActive]}
                onPress={() => setSelectedDay(d)}>
                <Text style={[styles.chipText, selectedDay === d && styles.chipTextActive]}>
                  {d.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Session note */}
        <RNTextInput value={sessionNote} onChangeText={setSessionNote}
          style={styles.noteInput}
          placeholder="Session note (optional)..."
          placeholderTextColor={COLORS.textMuted} multiline />

        {/* Exercises */}
        {sets.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No exercises</Text>
            <Text style={styles.emptySub}>Add exercises below</Text>
          </View>
        )}

        {sets.map((ex, exIdx) => {
          const progression = getProgressionSuggestion(ex.exercise_name, ex);
          const ssGroup = supersetGroups[exIdx];
          return (
            <View key={exIdx} style={[styles.exerciseCard,
              ssGroup && { borderLeftColor: '#4ECDC4', borderLeftWidth: 3 }]}>

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
                  <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                  <Text style={styles.prescribedText}>
                    Prescribed: {ex.prescribed_sets}×{ex.prescribed_reps}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
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
                          {ssGroup && entry.set_type === 'superset' ? `${ssGroup} ` : ''}
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
                          <Text style={styles.removeSetBtnText}>✕</Text>
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

                    {dropSuggestion && (
                      <TouchableOpacity style={styles.dropSuggest}
                        onPress={() => updateEntry(exIdx, setIdx, 'weight', dropSuggestion)}>
                        <Text style={styles.dropSuggestText}>
                          💡 Drop: {dropSuggestion}{entry.unit} (−20%) — tap to apply
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
                        <Text style={styles.unitToggleText}>{entry.unit || 'kg'}</Text>
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
        opacity: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
      }]}>
        <TouchableOpacity style={styles.timerFabInner}
          onPress={() => { if (!timerRunning && !timerFinished) setShowTimerModal(true); }}
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
            <RNTextInput value={dateInput} onChangeText={setDateInput}
              style={styles.modalInput} placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted} />
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
              style={styles.modalInput} placeholder="e.g. Bench Press"
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
            <RNTextInput value={timerCustomInput} onChangeText={setTimerCustomInput}
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
              Pair with{' '}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: COLORS.darkBorder },
  headerTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  headerSub: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  unsavedBadge: { backgroundColor: '#FFE66D33', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#FFE66D' },
  unsavedBadgeText: { color: '#FFE66D', fontSize: 9, ...FONTS.bold },
  changeDateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.md, backgroundColor: COLORS.roseGoldFaint, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  changeDateBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  cycleBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1.5, backgroundColor: COLORS.darkCard },
  cycleBannerEmoji: { fontSize: 22 },
  cycleBannerPhase: { fontSize: SIZES.sm, ...FONTS.bold },
  cycleBannerNote: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  chipScroll: { marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  noteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 50, textAlignVertical: 'top', marginBottom: 12 },
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
  removeSetBtnText: { color: COLORS.error, fontSize: SIZES.sm },
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