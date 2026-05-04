import React, { useState, useEffect, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, Animated
} from 'react-native';
import { Text } from 'react-native-paper';
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

  // Timer state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerDuration, setTimerDuration] = useState(90);
  const [timerCustomInput, setTimerCustomInput] = useState('');
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const timerRef = useRef(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (exercises.length > 0) {
      setSets(exercises.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || 'Other',
        prescribed_sets: ex.working_sets || 3,
        prescribed_reps: ex.reps || '8-12',
        entries: Array.from({ length: ex.working_sets || 3 }, () => ({
          weight: '', reps: ex.reps?.split('-')[0] || '', unit: unit || 'kg', is_pb: false
        }))
      })));
      fetchPreviousLogs(exercises.map(e => e.exercise_name));
    }
  }, []);

  // ── TIMER ─────────────────────────────────────────────

  useEffect(() => {
    if (timerRunning && !timerPaused) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            setTimerFinished(true);
            triggerTimerAlert();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning, timerPaused]);

  function triggerTimerAlert() {
    // Flash animation
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    // Browser notification
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('⏱️ Rest Complete!', {
          body: 'Time to get back to work!',
          icon: '/favicon.ico',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification('⏱️ Rest Complete!', { body: 'Time to get back to work!' });
          }
        });
      }
    }
  }

  function startTimer(seconds) {
    clearInterval(timerRef.current);
    setTimerDuration(seconds);
    setTimerSeconds(seconds);
    setTimerRunning(true);
    setTimerPaused(false);
    setTimerFinished(false);
    setShowTimerModal(false);
  }

  function pauseResumeTimer() {
    setTimerPaused(p => !p);
  }

  function resetTimer() {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerFinished(false);
    setTimerSeconds(timerDuration);
  }

  function restartTimer() {
    startTimer(timerDuration);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  const timerProgress = timerDuration > 0 ? timerSeconds / timerDuration : 0;
  const timerColor = timerSeconds <= 10 ? '#FF6B6B'
    : timerSeconds <= 30 ? '#FFE66D' : COLORS.success;

  // ── PREVIOUS LOGS ─────────────────────────────────────

  async function fetchPreviousLogs(exerciseNames) {
    if (!profile?.id) return;
    const results = {};
    for (const name of exerciseNames) {
      const { data } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', profile.id)
        .eq('exercise_name', name)
        .order('logged_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        const byDate = {};
        data.forEach(log => {
          const date = log.logged_at?.split('T')[0];
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(log);
        });
        const lastDate = Object.keys(byDate).sort().reverse()[0];
        results[name] = byDate[lastDate] || [];
      }
    }
    setPreviousLogs(results);
  }

  // ── PROGRESSIVE OVERLOAD ─────────────────────────────

  function getProgressionSuggestion(exerciseName, prescribed) {
    const prev = previousLogs[exerciseName];
    if (!prev || prev.length === 0) return null;
    const prescribedRepsStr = prescribed?.prescribed_reps || '8';
    const prescribedReps = parseInt(prescribedRepsStr.split('-')[0]) || 8;
    const prescribedRepsMax = parseInt(prescribedRepsStr.split('-').pop()) || prescribedReps;
    const prescribedSets = parseInt(prescribed?.prescribed_sets) || 3;
    const maxWeight = Math.max(...prev.map(l => l.weight_kg || 0));
    const avgReps = prev.reduce((s, l) => s + (l.reps || 0), 0) / prev.length;
    let suggestion = '', suggestionColor = COLORS.success, actionType = '';
    if (avgReps >= prescribedRepsMax) {
      const addWeight = unit === 'lbs' ? 5 : 2.5;
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul}\n→ Add weight: try ${prescribedSets}×${prescribedReps} @ ${toDisplay(maxWeight + addWeight, unit)}${ul}`;
      suggestionColor = '#FFE66D'; actionType = 'weight';
    } else if (avgReps >= prescribedReps) {
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul}\n→ Add rep: try ${prescribedSets}×${Math.round(avgReps) + 1} @ ${toDisplay(maxWeight, unit)}${ul}`;
      suggestionColor = COLORS.success; actionType = 'reps';
    } else {
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul}\n→ Consolidate: same weight`;
      suggestionColor = '#FF9F43'; actionType = 'consolidate';
    }
    return { suggestion, suggestionColor, actionType };
  }

  // ── SET MANAGEMENT ───────────────────────────────────

  function updateEntry(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, { weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }
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
      entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
    }]);
    fetchPreviousLogs([newEx.name.trim()]);
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
  }

  function confirmDate() {
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setSelectedDate(dateInput);
      const d = new Date(dateInput + 'T12:00:00');
      setSelectedDay(DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]);
    } else {
      showAlert('Invalid Date', 'Please use YYYY-MM-DD format'); return;
    }
    setShowDatePicker(false);
  }

  // ── SAVE ─────────────────────────────────────────────

  async function handleSave() {
    if (!profile?.id) { showAlert('Error', 'Not logged in'); return; }

    // Get cycle phase for this date if female
    let cyclePhase = null;
    if (profile.gender === 'Female') {
      const { data: cycles } = await supabase
        .from('menstrual_cycles')
        .select('*')
        .eq('client_id', profile.id)
        .order('cycle_start_date', { ascending: false });
      if (cycles && cycles.length > 0) {
        const phase = getPhaseForDate(selectedDate, cycles[0].cycle_start_date, cycles[0].cycle_length);
        cyclePhase = phase?.name || null;
      }
    }

    const rows = [];
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
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: weightKg && weightKg > currentPR,
          logged_at: new Date(selectedDate + 'T12:00:00').toISOString(),
          cycle_phase: cyclePhase,
        });
      });
    }

    if (!rows.length) { showAlert('No data', 'Enter at least one set'); return; }
    setLoading(true);

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
    showAlert('✅ Workout Saved!',
      `${rows.length} sets logged!${prs > 0 ? `\n🏆 ${prs} new PR!` : ''}${cyclePhase ? `\n🌸 Tagged: ${cyclePhase}` : ''}`,
      [{ text: 'Done', onPress: () => navigation.navigate('ClientHome') }]
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {freeLog && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
          </View>
        )}

        <View style={styles.dayBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayText}>
              {freeLog ? '📝 Free Log' : `${selectedDay} — ${currentMonth}`}
            </Text>
            <Text style={styles.dateSubText}>📅 {selectedDate}</Text>
          </View>
          <TouchableOpacity style={styles.changeDateBtn}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.changeDateBtnText}>Change Date</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.sectionLabel}>Session Note</Text>
          <RNTextInput value={sessionNote} onChangeText={setSessionNote}
            style={styles.noteInput} placeholder="How did the session feel?"
            placeholderTextColor={COLORS.textMuted} multiline />
        </View>

        {sets.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No exercises added yet</Text>
            <Text style={styles.emptySub}>Tap "Add Exercise" below</Text>
          </View>
        )}

        {sets.map((ex, exIdx) => {
          const progression = getProgressionSuggestion(ex.exercise_name, ex);
          return (
            <View key={exIdx} style={styles.exerciseCard}>
              <View style={styles.exHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                  {!freeLog && (
                    <Text style={styles.prescribedText}>
                      Prescribed: {ex.prescribed_sets}×{ex.prescribed_reps}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => removeExercise(exIdx)} style={styles.removeExBtn}>
                  <Text style={{ color: COLORS.error }}>✕</Text>
                </TouchableOpacity>
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

              {ex.entries.map((entry, setIdx) => (
                <View key={setIdx} style={styles.setCard}>
                  <View style={styles.setCardHeader}>
                    <View style={styles.setNumBadge}>
                      <Text style={styles.setNumBadgeText}>Set {setIdx + 1}</Text>
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
              ))}

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

      {/* ── FLOATING TIMER BUTTON ── */}
      <Animated.View style={[styles.timerFab, {
        backgroundColor: timerRunning
          ? (timerFinished ? '#FF6B6B' : timerColor)
          : COLORS.roseGold,
        opacity: flashAnim.interpolate({
          inputRange: [0, 1], outputRange: [1, 0.2]
        }),
      }]}>
        <TouchableOpacity
          style={styles.timerFabInner}
          onPress={() => {
            if (timerRunning || timerFinished) return;
            setShowTimerModal(true);
          }}
          onLongPress={() => {
            if (timerRunning) { pauseResumeTimer(); }
          }}>
          <Text style={styles.timerFabIcon}>⏱️</Text>
          <Text style={styles.timerFabText}>
            {timerRunning || timerFinished
              ? formatTime(timerSeconds)
              : 'Rest'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Timer controls overlay (shows when running) */}
      {(timerRunning || timerFinished) && (
        <View style={styles.timerOverlay}>
          <View style={styles.timerOverlayCard}>
            <Text style={styles.timerOverlayTitle}>
              {timerFinished ? '✅ Rest Complete!' : '⏱️ Rest Timer'}
            </Text>
            <Text style={[styles.timerOverlayCount, { color: timerColor }]}>
              {formatTime(timerSeconds)}
            </Text>

            {/* Progress bar */}
            <View style={styles.timerProgressBg}>
              <View style={[styles.timerProgressFill, {
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
              }]} />
            </View>

            <View style={styles.timerOverlayBtns}>
              {!timerFinished ? (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn}
                    onPress={pauseResumeTimer}>
                    <Text style={styles.timerOverlayBtnText}>
                      {timerPaused ? '▶ Resume' : '⏸ Pause'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.timerOverlayBtn}
                    onPress={resetTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Reset</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn}
                    onPress={restartTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.timerOverlayBtn, { backgroundColor: COLORS.roseGold }]}
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
                <TouchableOpacity key={s}
                  style={styles.timerPresetBtn}
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
              style={styles.modalInput}
              placeholder="e.g. 45"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric" />
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 120 },
  section: { marginBottom: 12 },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  dayBanner: { backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dateSubText: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.xs, marginTop: 2 },
  changeDateBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.2)' },
  changeDateBtnText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.semibold },
  noteCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  noteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, color: COLORS.white, fontSize: SIZES.sm, minHeight: 60, borderWidth: 1, borderColor: COLORS.darkBorder, textAlignVertical: 'top' },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  exHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 2 },
  prescribedText: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  removeExBtn: { padding: 8 },
  progressionCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 10, borderWidth: 1, borderLeftWidth: 3 },
  progressionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  progressionIcon: { fontSize: 14 },
  progressionTitle: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  progressionText: { fontSize: SIZES.xs, lineHeight: 18 },
  setCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  setCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  setNumBadge: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  setNumBadgeText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  setCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid, borderColor: COLORS.roseGold },
  prBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  removeSetBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.sm },
  removeSetBtnText: { color: COLORS.error, fontSize: SIZES.sm },
  setCardInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputGroup: { flex: 1 },
  inputGroupLabel: { color: COLORS.textMuted, fontSize: 10, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  inputGroupField: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 10, color: COLORS.white, fontSize: SIZES.lg, borderWidth: 1, borderColor: COLORS.darkBorder, textAlign: 'center', ...FONTS.bold, height: 48 },
  unitToggle: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.roseGoldMid, alignItems: 'center', justifyContent: 'center', height: 48, minWidth: 52 },
  unitToggleText: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.bold },
  addSetBtn: { marginTop: 8, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  addExBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  addExBtnText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.md },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', elevation: 6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  timerFab: { position: 'absolute', bottom: 24, right: 16, borderRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  timerFabInner: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', minWidth: 70 },
  timerFabIcon: { fontSize: 20 },
  timerFabText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold, marginTop: 2 },
  timerOverlay: { position: 'absolute', bottom: 90, right: 16, left: 16 },
  timerOverlayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 20, borderWidth: 2, borderColor: COLORS.roseGold, shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10 },
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