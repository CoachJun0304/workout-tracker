import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Text, Surface, Button, Chip } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { PRESET_TEMPLATES } from '../../data/presetTemplates';

export default function TemplatesScreen() {
  const [selectedTpl, setSelectedTpl] = useState(null);

  async function savePresetToDb(tpl) {
    const { data: existing } = await supabase
      .from('workout_templates').select('id').eq('name', tpl.name).single();
    if (existing) { Alert.alert('Already saved', tpl.name + ' is already in your templates.'); return; }
    const { data: template, error } = await supabase.from('workout_templates').insert({
      name: tpl.name, split_type: tpl.split_type, is_preset: true
    }).select().single();
    if (error) { Alert.alert('Error', error.message); return; }
    const exercises = tpl.exercises.map((ex, i) => ({
      template_id: template.id, day: ex.day, exercise_name: ex.exercise_name,
      muscle_group: ex.muscle_group, warmup_sets: ex.warmup_sets,
      working_sets: ex.working_sets, reps: ex.reps, order_index: i,
    }));
    await supabase.from('template_exercises').insert(exercises);
    Alert.alert('✅ Saved!', tpl.name + ' saved to your templates.');
  }

  const groupByDay = (exercises) => {
    const grouped = {};
    exercises.forEach(ex => {
      if (!grouped[ex.day]) grouped[ex.day] = [];
      grouped[ex.day].push(ex);
    });
    return grouped;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Pre-loaded Splits</Text>
      <Text style={styles.pageSubtitle}>Tap a template to preview, then save and assign to clients</Text>
      {PRESET_TEMPLATES.map(tpl => (
        <View key={tpl.id}>
          <Surface style={[styles.tplCard, selectedTpl?.id === tpl.id && styles.tplCardActive]}
            onTouchEnd={() => setSelectedTpl(selectedTpl?.id === tpl.id ? null : tpl)}>
            <View style={styles.tplHeader}>
              <View>
                <Text style={styles.tplName}>{tpl.name}</Text>
                <Chip style={styles.splitChip} textStyle={styles.splitChipText}>{tpl.split_type}</Chip>
              </View>
              <View style={styles.tplMeta}>
                <Text style={styles.tplCount}>{tpl.exercises.length}</Text>
                <Text style={styles.tplCountLabel}>exercises</Text>
              </View>
            </View>
            {selectedTpl?.id === tpl.id && (
              <View style={styles.preview}>
                {Object.entries(groupByDay(tpl.exercises)).map(([day, exs]) => (
                  <View key={day} style={styles.dayGroup}>
                    <Text style={styles.dayLabel}>{day}</Text>
                    {exs.map((ex, i) => (
                      <View key={i} style={styles.exRow}>
                        <Text style={styles.exName}>{ex.exercise_name}</Text>
                        <Text style={styles.exMeta}>W:{ex.warmup_sets} S:{ex.working_sets} | {ex.reps}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                <Button mode="contained" onPress={() => savePresetToDb(tpl)}
                  style={styles.saveBtn} icon="content-save">
                  Save to My Templates
                </Button>
              </View>
            )}
          </Surface>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  pageSubtitle: { color: '#888', fontSize: 13, marginBottom: 20 },
  tplCard: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  tplCardActive: { borderColor: '#6C63FF' },
  tplHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tplName: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 6 },
  splitChip: { backgroundColor: '#6C63FF22', alignSelf: 'flex-start' },
  splitChipText: { color: '#6C63FF', fontSize: 11 },
  tplMeta: { alignItems: 'center' },
  tplCount: { color: '#6C63FF', fontSize: 28, fontWeight: 'bold' },
  tplCountLabel: { color: '#888', fontSize: 11 },
  preview: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 16 },
  dayGroup: { marginBottom: 12 },
  dayLabel: { color: '#6C63FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  exName: { color: '#ddd', fontSize: 13, flex: 1 },
  exMeta: { color: '#888', fontSize: 12 },
  saveBtn: { marginTop: 12, borderRadius: 8 },
});