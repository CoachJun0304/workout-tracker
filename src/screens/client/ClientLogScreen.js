import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, TextInput as RNTextInput, Modal
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function ClientLogScreen({ route, navigation }) {
  const { exercises = [], day = '', freeLog = false } = route.params || {};
  const { profile, unit } = useAuth();
  const currentMonth = MONTHS[new Date().getMonth()];
  const [sessionNote, setSessionNote] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name:'', muscle_group:'Chest' });
  const [selectedDay, setSelectedDay] = useState(day || DAYS[new Date().getDay()===0?6:new Date().getDay()-1]);

  useEffect(() => {
    if (exercises.length > 0) {
      setSets(exercises.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || '',
        entries: Array.from({ length: ex.working_sets || 1 }, () => ({
          weight: '', reps: '', is_pb: false
        }))
      })));
    }
  }, []);

  function updateEntry(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, { weight:'', reps:'', is_pb:false }] }
      : ex
    ));
  }

  function removeSet(exIdx, setIdx) {
    Alert.alert('Remove Set', 'Remove this set?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        setSets(s => s.map((ex, i) => i === exIdx
          ? { ...ex, entries: ex.entries.filter((_, j) => j !== setIdx) }
          : ex
        ))
      }
    ]);
  }

  function removeExercise(exIdx) {
    Alert.alert('Remove Exercise', 'Remove this exercise from the log?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        setSets(s => s.filter((_, i) => i !== exIdx))
      }
    ]);
  }

  function addExercise() {
    if (!newEx.name.trim()) { Alert.alert('Error', 'Exercise name required'); return; }
    setSets(s => [...s, {
      exercise_name: newEx.name.trim(),
      muscle_group: newEx.muscle_group,
      entries: [{ weight:'', reps:'', is_pb:false }]
    }]);
    setNewEx({ name:'', muscle_group:'Chest' });
    setShowAddEx(false);
  }

  async function handleSave() {
    const rows = [];
    for (const ex of sets) {
      // Get existing PRs for this exercise
      const { data: prData } = await supabase
        .from('workout_logs').select('weight_kg')
        .eq('client_id', profile.id)
        .eq('exercise_name', ex.exercise_name)
        .order('weight_kg', { ascending: false }).limit(1);
      const currentPR = prData?.[0]?.weight_kg || 0;

      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        const weightKg = toKg(parseFloat(entry.weight), unit);
        const isPR = weightKg > currentPR;
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
          is_personal_best: isPR,
          is_free_log: freeLog,
        });
      });
    }

    if (!rows.length) { Alert.alert('No data', 'Enter at least one set'); return; }

    setLoading(true);
    const { error } = await supabase.from('workout_logs').insert(rows);

    // Save session note
    if (sessionNote.trim()) {
      await supabase.from('session_notes').upsert({
        client_id: profile.id,
        date: new Date().toISOString().split('T')[0],
        note: sessionNote.trim(),
      }, { onConflict: 'client_id,date' });
    }

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }

    const prs = rows.filter(r => r.is_personal_best).length;
    Alert.alert('✅ Workout Logged!',
      `${rows.length} sets saved!${prs > 0 ? `\n🏆 ${prs} new Personal Record${prs>1?'s':''}!` : ''}`, [
      { text: 'Done', onPress: () => navigation.navigate('ClientHome') }
    ]);
  }

  const ul = unitLabel(unit);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Day selector for free logs */}
        {freeLog && (
          <View>
            <Text style={styles.sectionLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
              {DAYS.map(d => (
                <TouchableOpacity key={d}
                  style={[styles.dayChip, selectedDay===d && styles.dayChipActive]}
                  onPress={() => setSelectedDay(d)}>
                  <Text style={[styles.dayChipText, selectedDay===d && styles.dayChipTextActive]}>
                    {d.slice(0,3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.dayBanner}>
          <Text style={styles.dayText}>
            {freeLog ? '📝 Free Workout Log' : `${selectedDay} — ${currentMonth}`}
          </Text>
          <Text style={styles.unitText}>Unit: {ul}</Text>
        </View>

        {/* Session note */}
        <View style={styles.noteCard}>
          <Text style={styles.sectionLabel}>Session Note (optional)</Text>
          <RNTextInput value={sessionNote} onChangeText={setSessionNote}
            style={styles.noteInput}
            placeholder="How did the session feel? Any notes..."
            placeholderTextColor={COLORS.textMuted}
            multiline />
        </View>

        {/* Exercises */}
        {sets.map((ex, exIdx) => (
          <View key={exIdx} style={styles.exerciseCard}>
            <View style={styles.exHeader}>
              <View style={{ flex:1 }}>
                <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
              </View>
              <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                <Text style={{ fontSize:18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.setHeader}>
              <Text style={styles.setHeaderText}>Set</Text>
              <Text style={styles.setHeaderText}>Weight ({ul})</Text>
              <Text style={styles.setHeaderText}>Reps</Text>
              <Text style={styles.setHeaderText}>PR 🏆</Text>
              <Text style={styles.setHeaderText}>Del</Text>
            </View>

            {ex.entries.map((entry, setIdx) => {
              const e1rm = entry.weight && entry.reps
                ? estimated1RM(toKg(parseFloat(entry.weight), unit), parseInt(entry.reps))
                : null;
              return (
                <View key={setIdx}>
                  <View style={styles.setRow}>
                    <Text style={styles.setNum}>{setIdx+1}</Text>
                    <RNTextInput value={entry.weight}
                      onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                      style={styles.setInput} placeholder="0"
                      placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    <RNTextInput value={entry.reps}
                      onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                      style={styles.setInput} placeholder="0"
                      placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    <TouchableOpacity
                      style={[styles.prBtn, entry.is_pb && styles.prBtnActive]}
                      onPress={() => updateEntry(exIdx, setIdx, 'is_pb', !entry.is_pb)}>
                      <Text>{entry.is_pb ? '🏆' : '○'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSet(exIdx, setIdx)}>
                      <Text style={{ fontSize:16, color: COLORS.error }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {e1rm && (
                    <Text style={styles.e1rmText}>
                      est. 1RM: {toDisplay(e1rm, unit)}{ul}
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

        {/* Add exercise button */}
        <TouchableOpacity style={styles.addExBtn} onPress={() => setShowAddEx(true)}>
          <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
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
            <RNTextInput value={newEx.name} onChangeText={v => setNewEx(e=>({...e,name:v}))}
              style={styles.modalInput} placeholder="e.g. Barbell Bench Press"
              placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Muscle Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
              {MUSCLE_GROUPS.map(m => (
                <TouchableOpacity key={m}
                  style={[styles.muscleChip, newEx.muscle_group===m && styles.muscleChipActive]}
                  onPress={() => setNewEx(e=>({...e,muscle_group:m}))}>
                  <Text style={[styles.muscleChipText, newEx.muscle_group===m && styles.muscleChipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddEx(false)}>
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
  container: { flex:1, backgroundColor: COLORS.darkBg },
  content: { padding:16, paddingBottom:40 },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:8 },
  dayRow: { marginBottom:10 },
  dayChip: { paddingHorizontal:14, paddingVertical:7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight:8, borderWidth:1, borderColor: COLORS.darkBorder },
  dayChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayChipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  dayChipTextActive: { color: COLORS.white },
  dayBanner: { backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.md, padding:14, marginBottom:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  dayText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  unitText: { color:'rgba(255,255,255,0.7)', fontSize: SIZES.xs },
  noteCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  noteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:10, color: COLORS.white, fontSize: SIZES.sm, minHeight:60, borderWidth:1, borderColor: COLORS.darkBorder2, textAlignVertical:'top' },
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  exHeader: { flexDirection:'row', alignItems:'center', marginBottom:12 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop:2 },
  setHeader: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  setHeaderText: { flex:1, color: COLORS.textMuted, fontSize:10, fontWeight:'600', textAlign:'center' },
  setRow: { flexDirection:'row', alignItems:'center', marginBottom:4, gap:6 },
  setNum: { color: COLORS.textMuted, width:20, textAlign:'center', fontSize: SIZES.sm },
  setInput: { flex:1, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding:8, color: COLORS.white, fontSize: SIZES.sm, borderWidth:1, borderColor: COLORS.darkBorder2, textAlign:'center', height:38 },
  prBtn: { width:36, height:36, borderRadius:18, backgroundColor: COLORS.darkCard2, justifyContent:'center', alignItems:'center' },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid },
  e1rmText: { color: COLORS.textMuted, fontSize:10, textAlign:'right', marginBottom:4 },
  addSetBtn: { marginTop:8, alignItems:'center', padding:8, borderWidth:1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md, borderStyle:'dashed' },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  addExBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  addExBtnText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.md },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:16, alignItems:'center', shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  muscleChip: { paddingHorizontal:12, paddingVertical:6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight:6, borderWidth:1, borderColor: COLORS.darkBorder },
  muscleChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  muscleChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  muscleChipTextActive: { color: COLORS.white },
  modalBtns: { flexDirection:'row', gap:12 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});