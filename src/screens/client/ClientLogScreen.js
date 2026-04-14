import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

export default function ClientLogScreen({ route, navigation }) {
  const { exercises = [], day = '' } = route.params || {};
  const { profile } = useAuth();
  const currentMonth = MONTHS[new Date().getMonth()];
  const [sets, setSets] = useState(
    exercises.map(ex => ({
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      entries: Array.from({ length: ex.working_sets || 1 }, () => ({
        weight: '', reps: '', is_pb: false
      }))
    }))
  );
  const [loading, setLoading] = useState(false);

  function updateEntry(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, { weight: '', reps: '', is_pb: false }] }
      : ex
    ));
  }

  async function handleSave() {
    const rows = [];
    sets.forEach(ex => {
      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        rows.push({
          client_id: profile.id,
          logged_by: profile.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: currentMonth,
          week: 1,
          day: day,
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: entry.weight ? parseFloat(entry.weight) : null,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: entry.is_pb,
        });
      });
    });

    if (rows.length === 0) { Alert.alert('No data', 'Enter at least one set'); return; }
    setLoading(true);
    const { error } = await supabase.from('workout_logs').insert(rows);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('✅ Workout Logged!', `${rows.length} sets saved!`, [
      { text: 'Done', onPress: () => navigation.navigate('ClientHome') }
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.dayBanner}>
        <Text style={styles.dayText}>{day} — {currentMonth}</Text>
      </View>

      {sets.map((ex, exIdx) => (
        <View key={exIdx} style={styles.exerciseCard}>
          <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
          <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>

          <View style={styles.setHeader}>
            <Text style={styles.setHeaderText}>Set</Text>
            <Text style={styles.setHeaderText}>Weight (kg)</Text>
            <Text style={styles.setHeaderText}>Reps</Text>
            <Text style={styles.setHeaderText}>PR 🏆</Text>
          </View>

          {ex.entries.map((entry, setIdx) => (
            <View key={setIdx} style={styles.setRow}>
              <Text style={styles.setNum}>{setIdx + 1}</Text>
              <TextInput value={entry.weight}
                onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                style={styles.setInput} mode="outlined" keyboardType="numeric"
                placeholder="0" dense
                outlineColor={COLORS.darkBorder2}
                activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white} />
              <TextInput value={entry.reps}
                onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                style={styles.setInput} mode="outlined" keyboardType="numeric"
                placeholder="0" dense
                outlineColor={COLORS.darkBorder2}
                activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white} />
              <TouchableOpacity
                style={[styles.prBtn, entry.is_pb && styles.prBtnActive]}
                onPress={() => updateEntry(exIdx, setIdx, 'is_pb', !entry.is_pb)}>
                <Text style={styles.prBtnText}>{entry.is_pb ? '🏆' : '○'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
            <Text style={styles.addSetBtnText}>+ Add Set</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        <Text style={styles.saveBtnText}>
          {loading ? 'Saving...' : '💾 Save Workout'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  dayBanner: {
    backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.md,
    padding: 14, marginBottom: 16,
  },
  dayText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  exerciseCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  exerciseName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold, marginBottom: 2 },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.medium, marginBottom: 12 },
  setHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 8, paddingHorizontal: 4,
  },
  setHeaderText: {
    flex: 1, color: COLORS.textMuted, fontSize: 10,
    fontWeight: '600', textAlign: 'center',
  },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  setNum: { color: COLORS.textMuted, width: 20, textAlign: 'center', fontSize: SIZES.sm },
  setInput: { flex: 1, backgroundColor: COLORS.darkCard2, height: 38 },
  prBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.darkCard2, justifyContent: 'center', alignItems: 'center',
  },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid },
  prBtnText: { fontSize: 16 },
  addSetBtn: {
    marginTop: 8, alignItems: 'center', padding: 8,
    borderWidth: 1, borderColor: COLORS.darkBorder,
    borderRadius: RADIUS.md, borderStyle: 'dashed',
  },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  saveBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
    shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
});