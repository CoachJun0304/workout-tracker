import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Platform, Modal, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { showAlert, showConfirm } from '../../utils/webAlert';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExModal, setShowExModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);
  const [editingExIdx, setEditingExIdx] = useState(null);
  const [tplName, setTplName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [exForm, setExForm] = useState({
    day: 'Monday', exercise_name: '', warmup_sets: '0',
    working_sets: '3', reps: '8-12', muscle_group: 'Chest',
  });

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    const { data } = await supabase
      .from('workout_templates')
      .select('*, template_exercises(*)')
      .order('created_at', { ascending: false });
    setTemplates(data || []);
  }

  function openEdit(tpl) {
    setEditingTpl(tpl);
    setTplName(tpl.name);
    const sorted = [...(tpl.template_exercises || [])].sort((a,b) => a.order_index - b.order_index);
    setExercises(sorted);
    setShowEditModal(true);
  }

  function openAddEx() {
    setEditingExIdx(null);
    setExForm({ day:'Monday', exercise_name:'', warmup_sets:'0', working_sets:'3', reps:'8-12', muscle_group:'Chest' });
    setShowExModal(true);
  }

  function openEditEx(idx) {
    const ex = exercises[idx];
    setEditingExIdx(idx);
    setExForm({
      day: ex.day,
      exercise_name: ex.exercise_name,
      warmup_sets: String(ex.warmup_sets),
      working_sets: String(ex.working_sets),
      reps: ex.reps,
      muscle_group: ex.muscle_group,
    });
    setShowExModal(true);
  }

  function saveExForm() {
    if (!exForm.exercise_name.trim()) { showAlert('Error', 'Exercise name required'); return; }
    const newEx = {
      day: exForm.day,
      exercise_name: exForm.exercise_name.trim(),
      warmup_sets: parseInt(exForm.warmup_sets) || 0,
      working_sets: parseInt(exForm.working_sets) || 3,
      reps: exForm.reps,
      muscle_group: exForm.muscle_group,
    };
    if (editingExIdx !== null) {
      setExercises(e => e.map((ex, i) => i === editingExIdx ? { ...ex, ...newEx } : ex));
    } else {
      setExercises(e => [...e, newEx]);
    }
    setShowExModal(false);
  }

  function removeEx(idx) {
    showConfirm('Remove Exercise', 'Remove this exercise from the template?', () => {
      setExercises(e => e.filter((_, i) => i !== idx));
    }, null, 'Remove', true);
  }

  function moveEx(idx, dir) {
    setExercises(e => {
      const arr = [...e];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  async function saveEdit() {
    if (!tplName.trim()) { showAlert('Error', 'Template name required'); return; }
    if (!exercises.length) { showAlert('Error', 'Add at least one exercise'); return; }
    setLoading(true);

    await supabase.from('workout_templates')
      .update({ name: tplName.trim() })
      .eq('id', editingTpl.id);

    await supabase.from('template_exercises')
      .delete().eq('template_id', editingTpl.id);

    await supabase.from('template_exercises').insert(
      exercises.map((ex, i) => ({
        template_id: editingTpl.id,
        day: ex.day,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        warmup_sets: ex.warmup_sets,
        working_sets: ex.working_sets,
        reps: ex.reps,
        order_index: i,
      }))
    );

    setLoading(false);
    setShowEditModal(false);
    showAlert('✅ Saved!', `"${tplName}" has been updated.`);
    fetchTemplates();
  }

  async function deleteTemplate(tpl) {
    showConfirm(
      'Delete Template',
      `Delete "${tpl.name}"? This will NOT remove it from already-assigned programs.`,
      async () => {
        setLoading(true);
        await supabase.from('template_exercises').delete().eq('template_id', tpl.id);
        await supabase.from('workout_templates').delete().eq('id', tpl.id);
        setLoading(false);
        fetchTemplates();
      },
      null, 'Delete', true
    );
  }

  async function duplicateTemplate(tpl) {
    setLoading(true);
    const { data: newTpl } = await supabase.from('workout_templates').insert({
      name: `${tpl.name} (Copy)`,
      split_type: tpl.split_type,
      is_preset: false,
    }).select().single();

    if (newTpl && tpl.template_exercises?.length > 0) {
      await supabase.from('template_exercises').insert(
        tpl.template_exercises.map((ex, i) => ({
          template_id: newTpl.id,
          day: ex.day,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          warmup_sets: ex.warmup_sets,
          working_sets: ex.working_sets,
          reps: ex.reps,
          order_index: i,
        }))
      );
    }

    setLoading(false);
    showAlert('✅ Duplicated!', `"${tpl.name} (Copy)" created.`);
    fetchTemplates();
  }

  function showOptions(tpl) {
    if (Platform.OS === 'web') {
      const choice = window.prompt(
        `"${tpl.name}"\n\nType:\n1 = Edit\n2 = Duplicate\n3 = Delete`
      );
      if (choice === '1') openEdit(tpl);
      else if (choice === '2') duplicateTemplate(tpl);
      else if (choice === '3') deleteTemplate(tpl);
    } else {
      const { Alert } = require('react-native');
      Alert.alert(tpl.name, 'Choose an action', [
        { text: 'Cancel', style: 'cancel' },
        { text: '✏️ Edit', onPress: () => openEdit(tpl) },
        { text: '📋 Duplicate', onPress: () => duplicateTemplate(tpl) },
        { text: '🗑️ Delete', style: 'destructive', onPress: () => deleteTemplate(tpl) },
      ]);
    }
  }

  const groupByDay = (exercises) => {
    const g = {};
    (exercises || []).forEach(ex => {
      if (!g[ex.day]) g[ex.day] = [];
      g[ex.day].push(ex);
    });
    return g;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Workout Templates</Text>
      <Text style={styles.pageSub}>
        {Platform.OS === 'web'
          ? 'Click the action buttons to edit, duplicate or delete'
          : 'Long press a template for options'}
      </Text>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySub}>Create programs from the Assign Program screen</Text>
        </View>
      ) : templates.map(tpl => (
        <View key={tpl.id} style={styles.tplCard}>
          <TouchableOpacity
            onPress={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
            onLongPress={() => showOptions(tpl)}>
            <View style={styles.tplHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tplName}>{tpl.name}</Text>
                <Text style={styles.tplMeta}>
                  {tpl.split_type} · {tpl.template_exercises?.length || 0} exercises
                </Text>
              </View>
              <View style={styles.tplActions}>
                <TouchableOpacity style={styles.actionBtn}
                  onPress={() => openEdit(tpl)}>
                  <Text style={styles.actionBtnText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn}
                  onPress={() => duplicateTemplate(tpl)}>
                  <Text style={styles.actionBtnText}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => deleteTemplate(tpl)}>
                  <Text style={styles.actionBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.dayTagRow}>
              {[...new Set((tpl.template_exercises || []).map(e => e.day))].map(d => (
                <View key={d} style={styles.dayTag}>
                  <Text style={styles.dayTagText}>{d.slice(0,3)}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

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

      {/* Edit template modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>✏️ Edit Template</Text>

              <Text style={styles.modalLabel}>Template Name</Text>
              <RNTextInput value={tplName} onChangeText={setTplName}
                style={styles.modalInput}
                placeholder="Template name"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>
                Exercises ({exercises.length})
              </Text>

              {exercises.map((ex, i) => (
                <View key={i} style={styles.exItem}>
                  <View style={styles.exReorder}>
                    <TouchableOpacity onPress={() => moveEx(i, -1)}>
                      <Text style={styles.reorderBtn}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveEx(i, 1)}>
                      <Text style={styles.reorderBtn}>▼</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exItemName}>{ex.exercise_name}</Text>
                    <Text style={styles.exItemMeta}>
                      {ex.day} · {ex.muscle_group} · W:{ex.warmup_sets} S:{ex.working_sets} · {ex.reps}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.exEditBtn}
                    onPress={() => openEditEx(i)}>
                    <Text style={{ fontSize: 14 }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.exDelBtn}
                    onPress={() => removeEx(i)}>
                    <Text style={{ fontSize: 14 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addExBtn} onPress={openAddEx}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowEditModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn}
                  onPress={saveEdit} disabled={loading}>
                  <Text style={styles.modalSaveText}>
                    {loading ? 'Saving...' : '✅ Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exercise form modal */}
      <Modal visible={showExModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>
                {editingExIdx !== null ? '✏️ Edit Exercise' : '➕ Add Exercise'}
              </Text>

              <Text style={styles.modalLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}>
                {DAYS.map(d => (
                  <TouchableOpacity key={d}
                    style={[styles.dayChip, exForm.day === d && styles.dayChipActive]}
                    onPress={() => setExForm(f => ({ ...f, day: d }))}>
                    <Text style={[styles.dayChipText, exForm.day === d && styles.dayChipTextActive]}>
                      {d.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Exercise Name</Text>
              <RNTextInput value={exForm.exercise_name}
                onChangeText={v => setExForm(f => ({ ...f, exercise_name: v }))}
                style={styles.modalInput}
                placeholder="e.g. Barbell Bench Press"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>Muscle Group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}>
                {MUSCLE_GROUPS.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.dayChip, exForm.muscle_group === m && styles.dayChipActive]}
                    onPress={() => setExForm(f => ({ ...f, muscle_group: m }))}>
                    <Text style={[styles.dayChipText, exForm.muscle_group === m && styles.dayChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.setsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Warmup</Text>
                  <RNTextInput value={exForm.warmup_sets}
                    onChangeText={v => setExForm(f => ({ ...f, warmup_sets: v }))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Working</Text>
                  <RNTextInput value={exForm.working_sets}
                    onChangeText={v => setExForm(f => ({ ...f, working_sets: v }))}
                    style={styles.modalInput} placeholder="3"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Reps</Text>
                  <RNTextInput value={exForm.reps}
                    onChangeText={v => setExForm(f => ({ ...f, reps: v }))}
                    style={styles.modalInput} placeholder="8-12"
                    placeholderTextColor={COLORS.textMuted} />
                </View>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowExModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={saveExForm}>
                  <Text style={styles.modalSaveText}>
                    {editingExIdx !== null ? 'Update' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40, maxWidth: 800, alignSelf: 'center', width: '100%' },
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
  tplActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 8, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md },
  deleteBtn: { backgroundColor: '#FF4B4B22' },
  actionBtnText: { fontSize: 16 },
  dayTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayTag: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  dayTagText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  preview: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder, paddingTop: 12 },
  dayGroup: { marginBottom: 12 },
  dayLabel: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  exName: { color: COLORS.textSecondary, fontSize: SIZES.sm, flex: 1 },
  exMeta: { color: COLORS.textMuted, fontSize: SIZES.xs },
  exItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, marginBottom: 6, gap: 8 },
  exReorder: { gap: 2 },
  reorderBtn: { color: COLORS.textMuted, fontSize: 12, padding: 2 },
  exItemName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  exItemMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  exEditBtn: { padding: 6, backgroundColor: COLORS.darkCard, borderRadius: 6 },
  exDelBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: 6 },
  addExBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.roseGoldMid, marginBottom: 16 },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.bold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder2, marginBottom: 8 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  dayChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.medium },
  dayChipTextActive: { color: COLORS.white },
  setsRow: { flexDirection: 'row', gap: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});