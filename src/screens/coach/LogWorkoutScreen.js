import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getCurrentPhase } from '../../data/cycleData';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

// Phase weight/rep multipliers for cycle-based suggestions
const PHASE_MODIFIERS = {
  'Menstrual Phase': { weightMult: 0.75, repsRange: '12-15', label: 'Low Intensity', color: '#FF6B6B', tip: 'Reduce weight 20-30%, higher reps' },
  'Follicular Phase': { weightMult: 1.0, repsRange: null, label: 'Normal', color: '#4ECDC4', tip: 'Normal prescription, energy rising' },
  'Ovulatory Phase': { weightMult: 1.05, repsRange: null, label: 'Peak Performance', color: '#FFE66D', tip: 'Peak window — try for PRs' },
  'Luteal Phase (Early)': { weightMult: 0.95, repsRange: null, label: 'Slightly Reduced', color: '#FF9F43', tip: 'Slight reduction, maintain form' },
  'Luteal Phase (Late)': { weightMult: 0.875, repsRange: '10-12', label: 'Moderate Reduction', color: '#FF7675', tip: 'Reduce weight 10-15%, focus on form' },
};

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
  const [sets, setSets] = useState([{
    exercise_name: '', muscle_group: 'Chest',
    prescribed_sets: 3, prescribed_reps: '8-12',
    entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
  }]);
  const [loading, setLoading] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [program, setProgram] = useState(null);
  const [cyclePhase, setCyclePhase] = useState(null);
  const [previousLogs, setPreviousLogs] = useState({});

  useEffect(() => {
    if (client) {
      fetchClientProgram();
      if (client.gender === 'Female') fetchCyclePhase();
    }
  }, []);

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.darkBg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.white }}>No client selected</Text>
      </View>
    );
  }

  async function fetchCyclePhase() {
    const { data } = await supabase
      .from('menstrual_cycles')
      .select('*')
      .eq('client_id', client.id)
      .order('cycle_start_date', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const phase = getCurrentPhase(data[0].cycle_start_date, data[0].cycle_length);
      setCyclePhase(phase);
    }
  }

  async function fetchClientProgram() {
    const { data } = await supabase
      .from('client_programs')
      .select('*, workout_templates(*, template_exercises(*))')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data?.workout_templates?.template_exercises) {
      setProgram(data);
      loadDayExercises(selectedDay, data);
    }
  }

  async function fetchPreviousLogs(exerciseNames) {
    const results = {};
    for (const name of exerciseNames) {
      const { data } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', client.id)
        .eq('exercise_name', name)
        .order('logged_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        // Group by session date
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

  function loadDayExercises(day, prog) {
    const p = prog || program;
    if (!p?.workout_templates?.template_exercises) return;
    const seen = new Set();
    const dayExs = p.workout_templates.template_exercises
      .filter(e => e.day === day)
      .sort((a, b) => a.order_index - b.order_index)
      .filter(ex => {
        if (seen.has(ex.exercise_name)) return false;
        seen.add(ex.exercise_name);
        return true;
      });
    if (dayExs.length > 0) {
      setSets(dayExs.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || 'Other',
        prescribed_sets: ex.working_sets || 3,
        prescribed_reps: ex.reps || '8-12',
        entries: Array.from({ length: ex.working_sets || 3 }, () => ({
          weight: '', reps: ex.reps?.split('-')[0] || '', unit: unit || 'kg', is_pb: false
        }))
      })));
      fetchPreviousLogs(dayExs.map(e => e.exercise_name));
    }
  }

  // ── PROGRESSIVE OVERLOAD SUGGESTION ─────────────────

  function getProgressionSuggestion(exerciseName, prescribed) {
    const prev = previousLogs[exerciseName];
    if (!prev || prev.length === 0) return null;

    const prescribedSets = parseInt(prescribed?.prescribed_sets) || 3;
    const prescribedRepsStr = prescribed?.prescribed_reps || '8';
    const prescribedReps = parseInt(prescribedRepsStr.split('-')[0]) || 8;
    const prescribedRepsMax = parseInt(prescribedRepsStr.split('-').pop()) || prescribedReps;

    const maxWeight = Math.max(...prev.map(l => l.weight_kg || 0));
    const avgReps = prev.reduce((s, l) => s + (l.reps || 0), 0) / prev.length;
    const lastDate = prev[0]?.logged_at?.split('T')[0] || '';

    let suggestion = '';
    let suggestionColor = COLORS.success;

    if (avgReps >= prescribedRepsMax) {
      // Exceeded max reps — add weight, reset to min reps
      const addWeight = unit === 'lbs' ? 5 : 2.5;
      const newWeight = toDisplay(maxWeight + addWeight, unit);
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul} on ${lastDate}\n→ Try: ${prescribedSets}×${prescribedReps} @ ${newWeight}${ul} (+${addWeight}${ul})`;
      suggestionColor = '#FFE66D';
    } else if (avgReps >= prescribedReps) {
      // Hit prescribed reps — add 1 rep
      const newReps = Math.round(avgReps) + 1;
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul} on ${lastDate}\n→ Try: ${prescribedSets}×${newReps} @ ${toDisplay(maxWeight, unit)}${ul} (+1 rep)`;
      suggestionColor = COLORS.success;
    } else {
      // Missed reps — consolidate
      suggestion = `Last: ${prescribedSets}×${Math.round(avgReps)} @ ${toDisplay(maxWeight, unit)}${ul} on ${lastDate}\n→ Try: ${prescribedSets}×${prescribedReps} @ ${toDisplay(maxWeight, unit)}${ul} (same — consolidate)`;
      suggestionColor = '#FF9F43';
    }

    return { suggestion, suggestionColor, maxWeight, avgReps, lastDate };
  }

  // ── CYCLE PHASE SUGGESTION PER EXERCISE ─────────────

  function getCycleSuggestion(exerciseName, prescribed) {
    if (!cyclePhase) return null;
    const prev = previousLogs[exerciseName];
    if (!prev || prev.length === 0) return null;

    const phaseName = cyclePhase.name;
    const modifier = Object.entries(PHASE_MODIFIERS).find(([key]) =>
      phaseName.toLowerCase().includes(key.toLowerCase().split(' ')[0])
    );
    if (!modifier) return null;

    const [, mod] = modifier;
    const lastWeight = Math.max(...prev.map(l => l.weight_kg || 0));
    const suggestedWeight = toDisplay(lastWeight * mod.weightMult, unit);
    const repsStr = mod.repsRange || prescribed?.prescribed_reps || '8-12';

    return {
      ...mod,
      exerciseName,
      suggestedWeight,
      repsStr,
      lastWeight: toDisplay(lastWeight, unit),
      text: `${exerciseName}: try ${suggestedWeight}${ul} × ${repsStr} reps (was ${toDisplay(lastWeight, unit)}${ul})`,
    };
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
    const newSet = {
      exercise_name: newEx.name.trim(),
      muscle_group: newEx.muscle_group,
      prescribed_sets: 3,
      prescribed_reps: '8-12',
      entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
    };
    setSets(s => [...s, newSet]);
    fetchPreviousLogs([newEx.name.trim()]);
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
  }

  function confirmDate() {
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setSelectedDate(dateInput);
      const d = new Date(dateInput + 'T12:00:00');
      setSelectedMonth(MONTHS[d.getMonth()]);
      const dayIdx = d.getDay();
      const newDay = DAYS[dayIdx === 0 ? 6 : dayIdx - 1];
      setSelectedDay(newDay);
      loadDayExercises(newDay, null);
    } else {
      showAlert('Invalid Date', 'Please use YYYY-MM-DD format');
      return;
    }
    setShowDatePicker(false);
  }

  async function handleSave() {
    const rows = [];
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
        const isPR = weightKg && weightKg > currentPR;
        rows.push({
          client_id: client.id,
          logged_by: user?.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: selectedMonth,
          week: 1,
          day: selectedDay,
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: isPR,
          logged_at: new Date(selectedDate + 'T12:00:00').toISOString(),
        });
      });
    }

    if (!rows.length) { showAlert('No data', 'Enter at least one set'); return; }
    setLoading(true);

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
    showAlert('✅ Workout Logged!',
      `${rows.length} sets saved for ${client.name} on ${selectedDate}!${prs > 0 ? `\n🏆 ${prs} new PR!` : ''}`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  }

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
        </View>

        {/* ── CYCLE PHASE BANNER (female only) ─────────── */}
        {cyclePhase && (
          <View style={[styles.cycleBanner, {
            borderColor: PHASE_MODIFIERS[cyclePhase.name]?.color || COLORS.roseGold
          }]}>
            <View style={styles.cycleBannerHeader}>
              <Text style={styles.cycleBannerEmoji}>{cyclePhase.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cycleBannerPhase, {
                  color: PHASE_MODIFIERS[cyclePhase.name]?.color || COLORS.roseGold
                }]}>
                  {cyclePhase.name} — Day {cyclePhase.dayInPhase}
                </Text>
                <Text style={styles.cycleBannerLabel}>
                  {PHASE_MODIFIERS[cyclePhase.name]?.label || 'Check phase'} · {PHASE_MODIFIERS[cyclePhase.name]?.tip}
                </Text>
              </View>
            </View>

            {/* Per-exercise cycle suggestions */}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}>
          {DAYS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.chip, selectedDay === d && styles.chipActive]}
              onPress={() => {
                setSelectedDay(d);
                loadDayExercises(d, null);
              }}>
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
          placeholderTextColor={COLORS.textMuted}
          multiline />

        {/* Exercises */}
        <Text style={styles.sectionLabel}>Exercises</Text>
        {sets.map((ex, exIdx) => {
          const progression = getProgressionSuggestion(ex.exercise_name, ex);

          return (
            <View key={exIdx} style={styles.exerciseCard}>
              <View style={styles.exHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.exercise_name || 'New Exercise'}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                  <Text style={styles.prescribedText}>
                    Prescribed: {ex.prescribed_sets} sets × {ex.prescribed_reps} reps
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                  <Text style={{ fontSize: 18 }}>🗑️</Text>
                </TouchableOpacity>
              </View>

              {/* Progressive overload suggestion */}
              {progression && (
                <View style={[styles.progressionCard, { borderColor: progression.suggestionColor }]}>
                  <Text style={styles.progressionTitle}>📈 Progressive Overload Guide</Text>
                  <Text style={[styles.progressionText, { color: progression.suggestionColor }]}>
                    {progression.suggestion}
                  </Text>
                </View>
              )}

              {/* Sets */}
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
                        <Text style={{ color: COLORS.error }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.setCardInputs}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>Weight</Text>
                      <RNTextInput
                        value={entry.weight}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                        style={styles.inputGroupField}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric" />
                    </View>
                    <TouchableOpacity style={styles.unitToggle}
                      onPress={() => updateEntry(exIdx, setIdx, 'unit',
                        entry.unit === 'kg' ? 'lbs' : 'kg')}>
                      <Text style={styles.unitToggleText}>{entry.unit}</Text>
                    </TouchableOpacity>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>Reps</Text>
                      <RNTextInput
                        value={entry.reps}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                        style={styles.inputGroupField}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric" />
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

      {/* Date picker modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📅 Select Date</Text>
            <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
            <RNTextInput value={dateInput} onChangeText={setDateInput}
              style={styles.modalInput}
              placeholder="e.g. 2026-04-15"
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
              style={styles.modalInput}
              placeholder="e.g. Barbell Bench Press"
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.lg, marginBottom: 12 },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.white, fontSize: 18, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.xs },
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
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 2 },
  prescribedText: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  progressionCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, marginBottom: 10, borderWidth: 1, borderLeftWidth: 3 },
  progressionTitle: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 4 },
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
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
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