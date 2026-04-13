import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, View } from 'react-native';
import { Text, Button, Surface, Chip } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { PRESET_TEMPLATES } from '../../data/presetTemplates';

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

export default function AssignProgramScreen({ route, navigation }) {
  const { client } = route.params;
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    if (!selectedTpl) { Alert.alert('Error', 'Please select a template'); return; }
    setLoading(true);

    const { data: tplData, error: tplError } = await supabase
      .from('workout_templates').insert({
        name: selectedTpl.name,
        split_type: selectedTpl.split_type,
        is_preset: true,
      }).select().single();

    if (tplError) { Alert.alert('Error', tplError.message); setLoading(false); return; }

    const exercises = selectedTpl.exercises.map((ex, i) => ({
      template_id: tplData.id,
      day: ex.day,
      exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group,
      warmup_sets: ex.warmup_sets,
      working_sets: ex.working_sets,
      reps: ex.reps,
      order_index: i,
    }));

    await supabase.from('template_exercises').insert(exercises);

    await supabase.from('client_programs').insert({
      client_id: client.id,
      template_id: tplData.id,
      month: selectedMonth,
      year: new Date().getFullYear(),
      is_active: true,
    });

    setLoading(false);
    Alert.alert('✅ Program Assigned!',
      `${selectedTpl.name} assigned to ${client.name} for ${selectedMonth}`, [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.clientBanner}>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.clientSub}>Assigning a workout program</Text>
      </Surface>

      <Text style={styles.sectionLabel}>Select Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {MONTHS.map(m => (
          <Chip key={m} selected={selectedMonth === m} onPress={() => setSelectedMonth(m)}
            style={styles.chip} selectedColor="#6C63FF">{m.slice(0,3)}</Chip>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Select Template</Text>
      {PRESET_TEMPLATES.map(tpl => (
        <Surface key={tpl.id}
          style={[styles.tplCard, selectedTpl?.id === tpl.id && styles.tplCardSelected]}>
          <View style={styles.tplRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tplName}>{tpl.name}</Text>
              <Text style={styles.tplSplit}>{tpl.split_type} · {tpl.exercises.length} exercises</Text>
            </View>
            <Button compact mode={selectedTpl?.id === tpl.id ? 'contained' : 'outlined'}
              onPress={() => setSelectedTpl(tpl)}>
              {selectedTpl?.id === tpl.id ? 'Selected' : 'Select'}
            </Button>
          </View>
        </Surface>
      ))}

      <Button mode="contained" onPress={handleAssign} loading={loading}
        style={styles.assignBtn} contentStyle={{ paddingVertical: 6 }}
        disabled={!selectedTpl}>
        Assign Program
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  clientBanner: { padding: 16, borderRadius: 12, backgroundColor: '#6C63FF22', borderLeftWidth: 4, borderLeftColor: '#6C63FF', marginBottom: 16 },
  clientName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  clientSub: { color: '#6C63FF', fontSize: 13, marginTop: 2 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  chipRow: { marginBottom: 4 },
  chip: { marginRight: 8 },
  tplCard: { padding: 14, borderRadius: 12, backgroundColor: '#1a1a1a', marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  tplCardSelected: { borderColor: '#6C63FF' },
  tplRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tplName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  tplSplit: { color: '#888', fontSize: 12, marginTop: 2 },
  assignBtn: { marginTop: 24, borderRadius: 8 },
});