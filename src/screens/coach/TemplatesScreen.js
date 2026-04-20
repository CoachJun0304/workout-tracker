import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function TemplatesScreen({ navigation }) {
  const [templates, setTemplates] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    const { data } = await supabase
      .from('workout_templates')
      .select('*, template_exercises(*)')
      .order('created_at', { ascending: false });
    setTemplates(data || []);
  }

  async function deleteTemplate(tpl) {
    Alert.alert('Delete Template',
      `Delete "${tpl.name}"? This will NOT remove it from already-assigned client programs.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setLoading(true);
        await supabase.from('template_exercises').delete().eq('template_id', tpl.id);
        await supabase.from('workout_templates').delete().eq('id', tpl.id);
        setLoading(false);
        fetchTemplates();
      }}
    ]);
  }

  async function duplicateTemplate(tpl) {
    setLoading(true);
    const { data: newTpl } = await supabase.from('workout_templates').insert({
      name: `${tpl.name} (Copy)`,
      split_type: tpl.split_type,
      is_preset: false,
    }).select().single();

    if (newTpl && tpl.template_exercises?.length > 0) {
      const exercises = tpl.template_exercises.map((ex, i) => ({
        template_id: newTpl.id,
        day: ex.day,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        warmup_sets: ex.warmup_sets,
        working_sets: ex.working_sets,
        reps: ex.reps,
        order_index: i,
      }));
      await supabase.from('template_exercises').insert(exercises);
    }

    setLoading(false);
    Alert.alert('✅ Duplicated!', `"${tpl.name} (Copy)" has been created.`);
    fetchTemplates();
  }

  const groupByDay = (exercises) => {
    const grouped = {};
    (exercises || []).forEach(ex => {
      if (!grouped[ex.day]) grouped[ex.day] = [];
      grouped[ex.day].push(ex);
    });
    return grouped;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Workout Templates</Text>
      <Text style={styles.pageSub}>Tap a template to preview. Long press for options.</Text>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySub}>Create custom programs from the Assign Program screen</Text>
        </View>
      ) : templates.map(tpl => (
        <View key={tpl.id} style={styles.tplCard}>
          <TouchableOpacity
            onPress={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
            onLongPress={() => Alert.alert(tpl.name, 'Choose an action', [
              { text: 'Cancel', style: 'cancel' },
              { text: '📋 Duplicate', onPress: () => duplicateTemplate(tpl) },
              { text: '🗑️ Delete', style: 'destructive', onPress: () => deleteTemplate(tpl) },
            ])}>
            <View style={styles.tplHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tplName}>{tpl.name}</Text>
                <Text style={styles.tplMeta}>
                  {tpl.split_type} · {tpl.template_exercises?.length || 0} exercises
                </Text>
              </View>
              <View style={styles.tplActions}>
                <TouchableOpacity style={styles.dupBtn} onPress={() => duplicateTemplate(tpl)}>
                  <Text style={styles.dupBtnText}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={() => deleteTemplate(tpl)}>
                  <Text style={styles.delBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Day tags */}
            <View style={styles.dayTagRow}>
              {[...new Set((tpl.template_exercises || []).map(e => e.day))].map(d => (
                <View key={d} style={styles.dayTag}>
                  <Text style={styles.dayTagText}>{d.slice(0, 3)}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          {/* Expanded preview */}
          {expandedId === tpl.id && (
            <View style={styles.preview}>
              {Object.entries(groupByDay(tpl.template_exercises)).map(([day, exs]) => (
                <View key={day} style={styles.dayGroup}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  {exs.map((ex, i) => (
                    <View key={i} style={styles.exRow}>
                      <Text style={styles.exName}>{ex.exercise_name}</Text>
                      <Text style={styles.exMeta}>
                        W:{ex.warmup_sets} S:{ex.working_sets} · {ex.reps}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy, marginBottom: 4 },
  pageSub: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom: 20 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4, textAlign: 'center' },
  tplCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  tplHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tplName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  tplMeta: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginTop: 2 },
  tplActions: { flexDirection: 'row', gap: 8 },
  dupBtn: { padding: 8, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md },
  dupBtnText: { fontSize: 16 },
  delBtn: { padding: 8, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.md },
  delBtnText: { fontSize: 16 },
  dayTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayTag: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  dayTagText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  preview: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder, paddingTop: 12 },
  dayGroup: { marginBottom: 12 },
  dayLabel: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  exName: { color: COLORS.textSecondary, fontSize: SIZES.sm, flex: 1 },
  exMeta: { color: COLORS.textMuted, fontSize: SIZES.xs },
});