import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Platform, Modal, TextInput as RNTextInput
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

export default function LogWorkoutScreen({ route, navigation }) {
  const { client } = route.params || {};
  const { user, unit } = useAuth();
  const [selectedDay, setSelectedDay] = useState(
    DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  );
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [sessionNote, setSessionNote] = useState('');
  const [sets, setSets] = useState([
    { exercise_name: '', muscle_group: 'Chest', entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }
  ]);
  const [loading, setLoading] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [program, setProgram] = useState(null);

  useEffect(() => { if (client) fetchClientProgram(); }, []);

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white' }}>No client selected. Go back and select a client.</Text>
      </View>
    );
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
      const todayExercises = data.workout_templates.template_exercises
        .filter(e => e.day === selectedDay)
        .sort((a, b) => a.order_index - b.order_index);
      if (todayExercises.length > 0) {
        setSets(todayExercises.map(ex => ({
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group || 'Other',
          entries: Array.from({ length: ex.working_sets || 3 }, () => ({
            weight: '', reps: ex.reps || '', unit: unit || 'kg', is_pb: false
          }))
        })));
      }
    }
  }

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
      entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
    }]);
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
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
        const weightKg = toKg(parseFloat(entry.weight), entry.unit);
        const isPR = weightKg > currentPR;
        rows.push({
          client_id: client.id,
          logged_by: user.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: selectedMonth,
          week: parseInt(selectedWeek),
          day: selectedDay,
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: isPR,
        });
      });
    }

    if (!rows.length) { showAlert('No data', 'Enter at least one set'); return; }
    setLoading(true);

    if (sessionNote.trim()) {
      await supabase.from('session_notes').upsert({
        client_id: client.id,
        date: new Date().toISOString().split('T')[0],
        note: sessionNote.trim(),
      }, { onConflict: 'client_id,date' });
    }

    const { error } = await supabase.from('workout_logs').insert(rows);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }

    const prs = rows.filter(r => r.is_personal_best).length;
    showAlert('✅ Workout Logged!',
      `${rows.length} sets saved for ${client.name}!${prs > 0 ? `\n🏆 ${prs} new PR!` : ''}`,
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
          <View>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.clientSub}>
              {program ? program.workout_templates?.name : 'No program assigned'}
            </Text>
          </View>
        </View>

        {/* Month */}
        <Text style={styles.sectionLabel}>Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {MONTHS.map(m => (
            <TouchableOpacity key={m}
              style={[styles.chip, selectedMonth === m && styles.chipActive]}
              onPress={() => setSelectedMonth(m)}>
              <Text style={[styles.chipText, selectedMonth === m && styles.chipTextActive]}>
                {m.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Week */}
        <Text style={styles.sectionLabel}>Week</Text>
        <View style={styles.weekRow}>
          {['1', '2', '3', '4'].map(w => (
            <TouchableOpacity key={w}
              style={[styles.weekBtn, selectedWeek === w && styles.weekBtnActive]}
              onPress={() => setSelectedWeek(w)}>
              <Text style={[styles.weekBtnText, selectedWeek === w && styles.weekBtnTextActive]}>
                Week {w}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Day */}
        <Text style={styles.sectionLabel}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {DAYS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.chip, selectedDay === d && styles.chipActive]}
              onPress={() => {
                setSelectedDay(d);
                if (program?.workout_templates?.template_exercises) {
                  const dayExs = program.workout_templates.template_exercises
                    .filter(e => e.day === d)
                    .sort((a, b) => a.order_index - b.order_index);
                  if (dayExs.length > 0) {
                    setSets(dayExs.map(ex => ({
                      exercise_name: ex.exercise_name,
                      muscle_group: ex.muscle_group || 'Other',
                      entries: Array.from({ length: ex.working_sets || 3 }, () => ({
                        weight: '', reps: ex.reps || '', unit: unit || 'kg', is_pb: false
                      }))
                    })));
                  }
                }
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
        {sets.map((ex, exIdx) => (
          <View key={exIdx} style={styles.exerciseCard}>
            <View style={styles.exHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.exercise_name || 'New Exercise'}</Text>
                <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
              </View>
              <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>

            {/* Set headers */}
{ex.entries.map((entry, setIdx) => {
  const e1rm = entry.weight && entry.reps
    ? estimated1RM(toKg(parseFloat(entry.weight), entry.unit), parseInt(entry.reps))
    : null;
  return (
    <View key={setIdx} style={styles.setCard}>
      {/* Top row: Set number + PR toggle + Delete */}
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
          <TouchableOpacity
            style={styles.removeSetBtn}
            onPress={() => removeSet(exIdx, setIdx)}>
            <Text style={styles.removeSetBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom row: Weight + Unit + Reps */}
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
        <TouchableOpacity
          style={styles.unitToggle}
          onPress={() => updateEntry(exIdx, setIdx, 'unit',
            entry.unit === 'kg' ? 'lbs' : 'kg')}>
          <Text style={styles.unitToggleText}>{entry.unit || 'kg'}</Text>
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

      {e1rm && (
        <Text style={styles.e1rmText}>
          est. 1RM: {toDisplay(e1rm, entry.unit || 'kg')}{entry.unit || 'kg'}
        </Text>
      )}
    </View>
  );
})}

            <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
              <Text style={styles.addSetBtnText}>+ Add Set</Text>
            </TouchableOpacity>
          </View>
        ))}

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
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.lg, marginBottom: 16 },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.white, fontSize: 18, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.xs },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  chipRow: { marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  weekRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  weekBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  weekBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  weekBtnText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  weekBtnTextActive: { color: COLORS.white },
  noteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder2, minHeight: 60, textAlignVertical: 'top', marginBottom: 4 },
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  exHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 2 },
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
  e1rmText: { color: COLORS.textMuted, fontSize: 10, textAlign: 'right', marginBottom: 4 },
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
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder2, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});