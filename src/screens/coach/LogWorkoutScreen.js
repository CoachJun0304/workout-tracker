import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, Chip, SegmentedButtons } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

export default function LogWorkoutScreen({ route, navigation }) {
  const { client } = route.params;
  const { user } = useAuth();
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [sets, setSets] = useState([
    { exercise_name: '', muscle_group: '', entries: [{ weight: '', reps: '', is_pb: false }] }
  ]);
  const [loading, setLoading] = useState(false);

  function addExercise() {
    setSets(s => [...s, { exercise_name: '', muscle_group: '', entries: [{ weight: '', reps: '', is_pb: false }] }]);
  }

  function addSet(exIdx) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, { weight: '', reps: '', is_pb: false }] }
      : ex
    ));
  }

  function updateSet(exIdx, setIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
  }

  function updateExercise(exIdx, field, value) {
    setSets(s => s.map((ex, i) => i === exIdx ? { ...ex, [field]: value } : ex));
  }

  async function handleSave() {
    const rows = [];
    sets.forEach(ex => {
      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
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
          weight_kg: entry.weight ? parseFloat(entry.weight) : null,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: entry.is_pb,
        });
      });
    });
    if (rows.length === 0) { Alert.alert('Error', 'No workout data to save'); return; }
    setLoading(true);
    const { error } = await supabase.from('workout_logs').insert(rows);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('✅ Workout Logged!', `${rows.length} sets saved for ${client.name}`, [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.clientBanner}>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.clientSplit}>{client.preferred_split || 'No split assigned'}</Text>
      </Surface>

      <Text style={styles.sectionLabel}>Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {MONTHS.map(m => (
          <Chip key={m} selected={selectedMonth === m} onPress={() => setSelectedMonth(m)}
            style={styles.chip} selectedColor="#6C63FF">{m.slice(0,3)}</Chip>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Week</Text>
      <SegmentedButtons value={selectedWeek} onValueChange={setSelectedWeek}
        buttons={['1','2','3','4'].map(w => ({ value: w, label: 'Week ' + w }))}
        style={styles.segmented} />

      <Text style={styles.sectionLabel}>Day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {DAYS.map(d => (
          <Chip key={d} selected={selectedDay === d} onPress={() => setSelectedDay(d)}
            style={styles.chip} selectedColor="#6C63FF">{d.slice(0,3)}</Chip>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Exercises</Text>
      {sets.map((ex, exIdx) => (
        <Surface key={exIdx} style={styles.exerciseCard}>
          <TextInput label="Exercise Name" value={ex.exercise_name}
            onChangeText={v => updateExercise(exIdx, 'exercise_name', v)}
            style={styles.input} mode="outlined" />
          <TextInput label="Muscle Group" value={ex.muscle_group}
            onChangeText={v => updateExercise(exIdx, 'muscle_group', v)}
            style={styles.input} mode="outlined" />
          <View style={styles.setHeader}>
            <Text style={styles.setHeaderText}>Set</Text>
            <Text style={styles.setHeaderText}>Weight (kg)</Text>
            <Text style={styles.setHeaderText}>Reps</Text>
            <Text style={styles.setHeaderText}>PR</Text>
          </View>
          {ex.entries.map((entry, setIdx) => (
            <View key={setIdx} style={styles.setRow}>
              <Text style={styles.setNum}>{setIdx + 1}</Text>
              <TextInput value={entry.weight} onChangeText={v => updateSet(exIdx, setIdx, 'weight', v)}
                style={styles.setInput} mode="outlined" keyboardType="numeric" placeholder="0" dense />
              <TextInput value={entry.reps} onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)}
                style={styles.setInput} mode="outlined" keyboardType="numeric" placeholder="0" dense />
              <Button compact mode={entry.is_pb ? 'contained' : 'outlined'}
                onPress={() => updateSet(exIdx, setIdx, 'is_pb', !entry.is_pb)}
                style={styles.prBtn}>🏆</Button>
            </View>
          ))}
          <Button compact icon="plus" onPress={() => addSet(exIdx)} style={styles.addSetBtn}>Add Set</Button>
        </Surface>
      ))}

      <Button icon="plus" mode="outlined" onPress={addExercise} style={styles.addExBtn}>Add Exercise</Button>
      <Button mode="contained" onPress={handleSave} loading={loading}
        style={styles.saveBtn} contentStyle={{ paddingVertical: 6 }} icon="content-save">
        Save Workout
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  clientBanner: { padding: 16, borderRadius: 12, backgroundColor: '#6C63FF22', borderLeftWidth: 4, borderLeftColor: '#6C63FF', marginBottom: 16 },
  clientName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  clientSplit: { color: '#6C63FF', fontSize: 13, marginTop: 2 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  chipRow: { marginBottom: 4 },
  chip: { marginRight: 8 },
  segmented: { marginBottom: 8 },
  exerciseCard: { padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#2a2a2a' },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  setHeaderText: { color: '#888', fontSize: 11, fontWeight: '600', flex: 1, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  setNum: { color: '#888', width: 24, textAlign: 'center', fontWeight: 'bold' },
  setInput: { flex: 1, backgroundColor: '#2a2a2a', height: 40 },
  prBtn: { borderRadius: 6 },
  addSetBtn: { marginTop: 4 },
  addExBtn: { marginTop: 8, marginBottom: 8, borderRadius: 8 },
  saveBtn: { marginTop: 16, borderRadius: 8 },
});