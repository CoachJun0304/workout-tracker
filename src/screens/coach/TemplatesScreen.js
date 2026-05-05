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

  // Edit template modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExModal, setShowExModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);
  const [editingExIdx, setEditingExIdx] = useState(null);
  const [tplName, setTplName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [bulkText, setBulkText] = useState('');
  const [exForm, setExForm] = useState({
    day: 'Monday', exercise_name: '', warmup_sets: '0',
    working_sets: '3', reps: '8-12', muscle_group: 'Chest',
  });

  // Batch move state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedExIndices, setSelectedExIndices] = useState([]);
  const [showBatchMoveModal, setShowBatchMoveModal] = useState(false);
  const [batchTargetDay, setBatchTargetDay] = useState('Monday');
  const [batchFilterDay, setBatchFilterDay] = useState('All');

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
    const sorted = [...(tpl.template_exercises || [])]
      .sort((a, b) => a.order_index - b.order_index);
    setExercises(sorted);
    setBatchMode(false);
    setSelectedExIndices([]);
    setBatchFilterDay('All');
    setShowEditModal(true);
  }

  function openAddEx() {
    setEditingExIdx(null);
    setExForm({
      day: 'Monday', exercise_name: '', warmup_sets: '0',
      working_sets: '3', reps: '8-12', muscle_group: 'Chest',
    });
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
    if (!exForm.exercise_name.trim()) {
      showAlert('Error', 'Exercise name required'); return;
    }
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
      setSelectedExIndices(s => s.filter(i => i !== idx).map(i => i > idx ? i - 1 : i));
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

  // ── BULK PASTE ────────────────────────────────────────

  function parseBulkExercises() {
    if (!bulkText.trim()) { showAlert('Error', 'Paste some exercises first'); return; }
    const lines = bulkText.split('\n').filter(l => l.trim());
    const parsed = [];
    const errors = [];
    lines.forEach((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) {
        errors.push(`Line ${i + 1}: needs at least 5 parts (Day | Exercise | Warmup | Sets | Reps)`);
        return;
      }
      const [day, exercise_name, warmup_sets, working_sets, reps, muscle_group] = parts;
      if (!DAYS.includes(day)) {
        errors.push(`Line ${i + 1}: invalid day "${day}" — use Monday, Tuesday, etc.`);
        return;
      }
      if (!exercise_name?.trim()) {
        errors.push(`Line ${i + 1}: exercise name is empty`);
        return;
      }
      parsed.push({
        day,
        exercise_name: exercise_name.trim(),
        warmup_sets: parseInt(warmup_sets) || 0,
        working_sets: parseInt(working_sets) || 3,
        reps: reps?.trim() || '8-12',
        muscle_group: MUSCLE_GROUPS.includes(muscle_group?.trim())
          ? muscle_group.trim() : 'Other',
      });
    });
    if (errors.length > 0) {
      showAlert('Parse Errors', errors.slice(0, 5).join('\n'));
      if (parsed.length === 0) return;
    }
    if (parsed.length > 0) {
      setExercises(e => [...e, ...parsed]);
      setBulkText('');
      setShowBulkModal(false);
      showAlert('✅ Added!', `${parsed.length} exercise(s) added to the template.`);
    }
  }

  // ── BATCH MOVE ────────────────────────────────────────

  function toggleExSelection(idx) {
    setSelectedExIndices(s =>
      s.includes(idx) ? s.filter(i => i !== idx) : [...s, idx]
    );
  }

  function selectAll() {
    const filtered = batchFilterDay === 'All'
      ? exercises.map((_, i) => i)
      : exercises.map((ex, i) => ex.day === batchFilterDay ? i : -1).filter(i => i !== -1);
    setSelectedExIndices(filtered);
  }

  function clearSelection() { setSelectedExIndices([]); }

  function applyBatchMove() {
    if (selectedExIndices.length === 0) {
      showAlert('No exercises selected', 'Select at least one exercise to move');
      return;
    }
    setExercises(exs =>
      exs.map((ex, i) =>
        selectedExIndices.includes(i) ? { ...ex, day: batchTargetDay } : ex
      )
    );
    setSelectedExIndices([]);
    setShowBatchMoveModal(false);
    showAlert('✅ Moved!',
      `${selectedExIndices.length} exercise(s) moved to ${batchTargetDay}`);
  }

  // ── SAVE / DELETE ─────────────────────────────────────

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
      `Delete "${tpl.name}" and all ${tpl.template_exercises?.length || 0} exercises? This cannot be undone.`,
      async () => {
        setLoading(true);
        await supabase.from('template_exercises').delete().eq('template_id', tpl.id);
        const { error } = await supabase.from('workout_templates').delete().eq('id', tpl.id);
        setLoading(false);
        if (error) { showAlert('Error', error.message); return; }
        showAlert('🗑️ Deleted', `"${tpl.name}" has been permanently deleted.`);
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

  const groupByDay = (exs) => {
    const g = {};
    (exs || []).forEach(ex => {
      if (!g[ex.day]) g[ex.day] = [];
      g[ex.day].push(ex);
    });
    return g;
  };

  const filteredIndices = exercises
    .map((ex, i) => (batchFilterDay === 'All' || ex.day === batchFilterDay) ? i : -1)
    .filter(i => i !== -1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Workout Templates</Text>
      <Text style={styles.pageSub}>Manage your workout program templates</Text>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySub}>
            Create programs from the Assign Program screen
          </Text>
        </View>
      ) : templates.map(tpl => (
        <View key={tpl.id} style={styles.tplCard}>
          <TouchableOpacity
            onPress={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}>
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
                  <Text style={styles.dayTagText}>{d.slice(0, 3)}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          {expandedId === tpl.id && (
            <View style={styles.preview}>
              {Object.entries(groupByDay(tpl.template_exercises))
                .sort(([a], [b]) => DAYS.indexOf(a) - DAYS.indexOf(b))
                .map(([day, exs]) => (
                  <View key={day} style={styles.dayGroup}>
                    <Text style={styles.dayLabel}>{day}</Text>
                    {exs.sort((a, b) => a.order_index - b.order_index).map((ex, i) => (
                      <View key={i} style={styles.exRow}>
                        <Text style={styles.exName}>{ex.exercise_name}</Text>
                        <Text style={styles.exMeta}>
                          {ex.working_sets}×{ex.reps} · {ex.muscle_group}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))
              }
            </View>
          )}
        </View>
      ))}

      {/* ── EDIT TEMPLATE MODAL ── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '95%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>✏️ Edit Template</Text>

              <Text style={styles.modalLabel}>Template Name</Text>
              <RNTextInput value={tplName} onChangeText={setTplName}
                style={styles.modalInput}
                placeholder="Template name"
                placeholderTextColor={COLORS.textMuted} />

              {/* Batch mode toggle */}
              <View style={styles.batchToolbar}>
                <TouchableOpacity
                  style={[styles.batchToggleBtn, batchMode && styles.batchToggleBtnActive]}
                  onPress={() => {
                    setBatchMode(!batchMode);
                    setSelectedExIndices([]);
                  }}>
                  <Text style={[styles.batchToggleBtnText,
                    batchMode && styles.batchToggleBtnTextActive]}>
                    {batchMode ? '✕ Exit Batch' : '📦 Batch Move'}
                  </Text>
                </TouchableOpacity>
                {batchMode && selectedExIndices.length > 0 && (
                  <TouchableOpacity style={styles.batchMoveBtn}
                    onPress={() => setShowBatchMoveModal(true)}>
                    <Text style={styles.batchMoveBtnText}>
                      Move {selectedExIndices.length} →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Batch controls */}
              {batchMode && (
                <View style={styles.batchControls}>
                  <Text style={styles.batchHint}>
                    Tap exercises to select. Filter by day for quick selection.
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }}>
                    {['All', ...DAYS].map(d => (
                      <TouchableOpacity key={d}
                        style={[styles.dayFilterChip,
                          batchFilterDay === d && styles.dayFilterChipActive]}
                        onPress={() => setBatchFilterDay(d)}>
                        <Text style={[styles.dayFilterChipText,
                          batchFilterDay === d && styles.dayFilterChipTextActive]}>
                          {d === 'All' ? 'All Days' : d.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.batchSelectRow}>
                    <TouchableOpacity style={styles.batchSelectBtn} onPress={selectAll}>
                      <Text style={styles.batchSelectBtnText}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.batchClearBtn} onPress={clearSelection}>
                      <Text style={styles.batchClearBtnText}>Clear</Text>
                    </TouchableOpacity>
                    <Text style={styles.batchCount}>
                      {selectedExIndices.length} selected
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.modalLabel}>
                Exercises ({exercises.length})
              </Text>

              {/* Exercise list */}
              {(batchMode ? filteredIndices : exercises.map((_, i) => i)).map(i => {
                const ex = exercises[i];
                const isSelected = selectedExIndices.includes(i);
                return (
                  <TouchableOpacity key={i}
                    style={[styles.exItem,
                      batchMode && isSelected && styles.exItemSelected]}
                    onPress={() => batchMode ? toggleExSelection(i) : openEditEx(i)}
                    activeOpacity={0.7}>

                    {batchMode && (
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                      </View>
                    )}

                    {!batchMode && (
                      <View style={styles.exReorder}>
                        <TouchableOpacity onPress={() => moveEx(i, -1)}>
                          <Text style={styles.reorderBtn}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => moveEx(i, 1)}>
                          <Text style={styles.reorderBtn}>▼</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.exItemName,
                        batchMode && isSelected && { color: COLORS.roseGold }]}>
                        {ex.exercise_name}
                      </Text>
                      <Text style={styles.exItemMeta}>
                        {ex.day} · {ex.muscle_group} · {ex.working_sets}×{ex.reps}
                        {ex.warmup_sets > 0 ? ` + ${ex.warmup_sets}wu` : ''}
                      </Text>
                    </View>

                    {!batchMode && (
                      <View style={styles.exItemActions}>
                        <TouchableOpacity style={styles.exEditBtn}
                          onPress={() => openEditEx(i)}>
                          <Text style={{ fontSize: 14 }}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.exDeleteBtn}
                          onPress={() => removeEx(i)}>
                          <Text style={{ fontSize: 14 }}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {batchMode && (
                      <View style={[styles.dayBadge,
                        isSelected && { backgroundColor: COLORS.roseGold }]}>
                        <Text style={styles.dayBadgeText}>{ex.day.slice(0, 3)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Add exercise buttons */}
              <View style={styles.addExRow}>
                <TouchableOpacity
                  style={[styles.addExBtn, { flex: 1 }]}
                  onPress={openAddEx}>
                  <Text style={styles.addExBtnText}>➕ Add One</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addExBtn, { flex: 1, borderColor: '#4ECDC4' }]}
                  onPress={() => { setBulkText(''); setShowBulkModal(true); }}>
                  <Text style={[styles.addExBtnText, { color: '#4ECDC4' }]}>
                    📋 Bulk Paste
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowEditModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveEdit} disabled={loading}>
                  <Text style={styles.modalSaveText}>
                    {loading ? 'Saving...' : '✅ Save Template'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── ADD/EDIT EXERCISE MODAL ── */}
      <Modal visible={showExModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingExIdx !== null ? '✏️ Edit Exercise' : '➕ Add Exercise'}
              </Text>

              <Text style={styles.modalLabel}>Exercise Name</Text>
              <RNTextInput value={exForm.exercise_name}
                onChangeText={v => setExForm(f => ({ ...f, exercise_name: v }))}
                style={styles.modalInput}
                placeholder="e.g. Bench Press"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}>
                {DAYS.map(d => (
                  <TouchableOpacity key={d}
                    style={[styles.chip, exForm.day === d && styles.chipActive]}
                    onPress={() => setExForm(f => ({ ...f, day: d }))}>
                    <Text style={[styles.chipText, exForm.day === d && styles.chipTextActive]}>
                      {d.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Muscle Group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}>
                {MUSCLE_GROUPS.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.chip, exForm.muscle_group === m && styles.chipActive]}
                    onPress={() => setExForm(f => ({ ...f, muscle_group: m }))}>
                    <Text style={[styles.chipText, exForm.muscle_group === m && styles.chipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Warm-up Sets</Text>
                  <RNTextInput value={exForm.warmup_sets}
                    onChangeText={v => setExForm(f => ({ ...f, warmup_sets: v }))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Working Sets</Text>
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

      {/* ── BULK PASTE MODAL ── */}
      <Modal visible={showBulkModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>📋 Bulk Paste Exercises</Text>

              <View style={styles.bulkHelp}>
                <Text style={styles.bulkHelpTitle}>Format — one exercise per line:</Text>
                <Text style={styles.bulkHelpFormat}>
                  Day | Exercise Name | Warmup Sets | Working Sets | Reps | Muscle Group
                </Text>
                <Text style={styles.bulkHelpNote}>
                  Muscle Group is optional. Valid days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
                </Text>
                <View style={styles.bulkHelpExample}>
                  <Text style={styles.bulkHelpExampleText}>
                    Monday | Bench Press | 2 | 3 | 8-12 | Chest{'\n'}
                    Monday | Incline DB Press | 0 | 3 | 10-12 | Chest{'\n'}
                    Monday | Cable Fly | 0 | 3 | 12-15 | Chest{'\n'}
                    Wednesday | Squat | 3 | 4 | 5 | Quads{'\n'}
                    Wednesday | Romanian Deadlift | 2 | 3 | 8-10 | Hamstrings{'\n'}
                    Friday | Deadlift | 2 | 3 | 5 | Back
                  </Text>
                </View>
              </View>

              <Text style={styles.modalLabel}>
                Paste Exercises ({bulkText.split('\n').filter(l => l.trim()).length} lines)
              </Text>
              <RNTextInput
                value={bulkText}
                onChangeText={setBulkText}
                style={styles.bulkInput}
                placeholder={`Monday | Bench Press | 2 | 3 | 8-12 | Chest\nMonday | Incline DB Press | 0 | 3 | 10-12 | Chest`}
                placeholderTextColor={COLORS.textMuted}
                multiline />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowBulkModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn}
                  onPress={parseBulkExercises}>
                  <Text style={styles.modalSaveText}>⚡ Parse & Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── BATCH MOVE MODAL ── */}
      <Modal visible={showBatchMoveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📦 Move Exercises</Text>
            <Text style={styles.modalSubtitle}>
              Moving {selectedExIndices.length} exercise(s) to:
            </Text>

            <Text style={styles.modalLabel}>Target Day</Text>
            <View style={styles.batchDayGrid}>
              {DAYS.map(d => (
                <TouchableOpacity key={d}
                  style={[styles.batchDayBtn, batchTargetDay === d && styles.batchDayBtnActive]}
                  onPress={() => setBatchTargetDay(d)}>
                  <Text style={[styles.batchDayBtnText,
                    batchTargetDay === d && styles.batchDayBtnTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.batchPreview}>
              <Text style={styles.batchPreviewTitle}>Selected exercises:</Text>
              {selectedExIndices.slice(0, 5).map(i => (
                <Text key={i} style={styles.batchPreviewItem}>
                  • {exercises[i]?.exercise_name} ({exercises[i]?.day} → {batchTargetDay})
                </Text>
              ))}
              {selectedExIndices.length > 5 && (
                <Text style={styles.batchPreviewMore}>
                  +{selectedExIndices.length - 5} more...
                </Text>
              )}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowBatchMoveModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={applyBatchMove}>
                <Text style={styles.modalSaveText}>Move to {batchTargetDay}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy, marginBottom: 4 },
  pageSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom: 20 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: COLORS.white, fontSize: SIZES.xl, ...FONTS.bold },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 6, textAlign: 'center' },
  tplCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder, overflow: 'hidden' },
  tplHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  tplName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  tplMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  tplActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 8, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm },
  deleteBtn: { backgroundColor: '#FF4B4B22' },
  actionBtnText: { fontSize: 16 },
  dayTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  dayTag: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  dayTagText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  preview: { borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder, padding: 14 },
  dayGroup: { marginBottom: 12 },
  dayLabel: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  exName: { color: COLORS.white, fontSize: SIZES.sm, flex: 1 },
  exMeta: { color: COLORS.textMuted, fontSize: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipTextActive: { color: COLORS.white },
  exItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder, gap: 8 },
  exItemSelected: { borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  exReorder: { gap: 2 },
  reorderBtn: { color: COLORS.textMuted, fontSize: 14, padding: 2 },
  exItemName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  exItemMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  exItemActions: { flexDirection: 'row', gap: 4 },
  exEditBtn: { padding: 6, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm },
  exDeleteBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.sm },
  addExRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addExBtn: { borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.roseGoldMid, backgroundColor: COLORS.roseGoldFaint },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
  bulkHelp: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  bulkHelpTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 6 },
  bulkHelpFormat: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom: 4 },
  bulkHelpNote: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8 },
  bulkHelpExample: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm, padding: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  bulkHelpExampleText: { color: '#4ECDC4', fontSize: SIZES.xs, lineHeight: 18 },
  bulkInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 180, textAlignVertical: 'top', marginBottom: 8 },
  batchToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  batchToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  batchToggleBtnActive: { backgroundColor: COLORS.roseGoldFaint, borderColor: COLORS.roseGold },
  batchToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  batchToggleBtnTextActive: { color: COLORS.roseGold },
  batchMoveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold },
  batchMoveBtnText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  batchControls: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchHint: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8 },
  dayFilterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  dayFilterChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayFilterChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  dayFilterChipTextActive: { color: COLORS.white },
  batchSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  batchSelectBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  batchSelectBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  batchClearBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchClearBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  batchCount: { color: COLORS.textMuted, fontSize: SIZES.xs, marginLeft: 'auto' },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: COLORS.darkBorder, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.darkCard },
  checkboxActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  checkboxTick: { color: COLORS.white, fontSize: 12, ...FONTS.bold },
  dayBadge: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  dayBadgeText: { color: COLORS.white, fontSize: 9, ...FONTS.bold },
  batchDayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  batchDayBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder, minWidth: '30%', alignItems: 'center' },
  batchDayBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  batchDayBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  batchDayBtnTextActive: { color: COLORS.white },
  batchPreview: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchPreviewTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom: 6 },
  batchPreviewItem: { color: COLORS.white, fontSize: SIZES.xs, marginBottom: 3 },
  batchPreviewMore: { color: COLORS.textMuted, fontSize: SIZES.xs, fontStyle: 'italic' },
});