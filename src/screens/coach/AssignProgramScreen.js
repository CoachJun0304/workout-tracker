import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  TextInput as RNTextInput, Modal
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { showAlert, showConfirm } from '../../utils/webAlert';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

export default function AssignProgramScreen({ route, navigation }) {
  const { client } = route.params || {};
  const { profile } = useAuth();
  const [tab, setTab] = useState('saved');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  // Custom program
  const [customName, setCustomName] = useState('');
  const [customMode, setCustomMode] = useState('form');
  const [exercises, setExercises] = useState([]);
  const [bulkText, setBulkText] = useState('');
  const [showExModal, setShowExModal] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
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
    setSavedTemplates(data || []);
  }

  // ── EXERCISE FORM ─────────────────────────────────────

  function openAdd() {
    setEditingIdx(null);
    setExForm({
      day: 'Monday', exercise_name: '', warmup_sets: '0',
      working_sets: '3', reps: '8-12', muscle_group: 'Chest',
    });
    setShowExModal(true);
  }

  function openEdit(idx) {
    const ex = exercises[idx];
    setEditingIdx(idx);
    setExForm({
      day: ex.day, exercise_name: ex.exercise_name,
      warmup_sets: String(ex.warmup_sets), working_sets: String(ex.working_sets),
      reps: ex.reps, muscle_group: ex.muscle_group,
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
    if (editingIdx !== null) {
      setExercises(e => e.map((ex, i) => i === editingIdx ? newEx : ex));
    } else {
      setExercises(e => [...e, newEx]);
    }
    setShowExModal(false);
  }

  function moveExercise(idx, dir) {
    setExercises(e => {
      const arr = [...e];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  function removeExercise(idx) {
    showConfirm('Remove', 'Remove this exercise?', () => {
      setExercises(e => e.filter((_, i) => i !== idx));
      setSelectedExIndices(s =>
        s.filter(i => i !== idx).map(i => i > idx ? i - 1 : i)
      );
    }, null, 'Remove', true);
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

  function clearSelection() {
    setSelectedExIndices([]);
  }

  function applyBatchMove() {
    if (selectedExIndices.length === 0) {
      showAlert('No exercises selected', 'Select at least one exercise'); return;
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

  const filteredIndices = exercises
    .map((ex, i) => (batchFilterDay === 'All' || ex.day === batchFilterDay) ? i : -1)
    .filter(i => i !== -1);

  // ── BULK PASTE ────────────────────────────────────────

  function parseBulk() {
    const lines = bulkText.split('\n').filter(l => l.trim());
    const parsed = [];
    const errors = [];
    lines.forEach((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) { errors.push(`Line ${i + 1}: needs 5 parts`); return; }
      const [day, exercise_name, warmup_sets, working_sets, reps, muscle_group] = parts;
      if (!DAYS.includes(day)) {
        errors.push(`Line ${i + 1}: invalid day "${day}"`); return;
      }
      parsed.push({
        day, exercise_name,
        warmup_sets: parseInt(warmup_sets) || 0,
        working_sets: parseInt(working_sets) || 3,
        reps: reps || '8-12',
        muscle_group: muscle_group || 'Other',
      });
    });
    if (errors.length) showAlert('Errors', errors.slice(0, 5).join('\n'));
    if (parsed.length) {
      setExercises(e => [...e, ...parsed]);
      setBulkText('');
      showAlert('✅ Parsed!', `${parsed.length} exercises added.`);
    }
  }

  // ── SAVE & ASSIGN ─────────────────────────────────────

  async function saveCustomTemplate() {
    if (!customName.trim()) { showAlert('Error', 'Template name required'); return; }
    if (!exercises.length) { showAlert('Error', 'Add at least one exercise'); return; }
    setLoading(true);

    const { data: tpl, error } = await supabase.from('workout_templates').insert({
      name: customName.trim(),
      split_type: 'Custom',
      created_by: profile?.id || null,
      is_preset: false,
    }).select().single();

    if (error) { showAlert('Error', error.message); setLoading(false); return; }

    await supabase.from('template_exercises').insert(
      exercises.map((ex, i) => ({ template_id: tpl.id, ...ex, order_index: i }))
    );

    await fetchTemplates();
    setLoading(false);
    showAlert('✅ Saved!',
      `"${customName}" saved. Select it from the Saved tab to assign.`);
    setCustomName('');
    setExercises([]);
    setTab('saved');
  }

  async function assignProgram(templateId, templateName) {
    const { data: existing } = await supabase
      .from('client_programs').select('id')
      .eq('client_id', client.id)
      .eq('month', selectedMonth).eq('is_active', true);

    if (existing?.length > 0) {
      showAlert('Program Exists',
        `${client.name} already has a program for ${selectedMonth}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add to existing', onPress: () => doAssign(templateId, templateName, false) },
        { text: 'Replace', style: 'destructive', onPress: () => doAssign(templateId, templateName, true) },
      ]);
    } else {
      doAssign(templateId, templateName, false);
    }
  }

  async function doAssign(templateId, templateName, replace) {
    setLoading(true);
    if (replace) {
      await supabase.from('client_programs').update({ is_active: false })
        .eq('client_id', client.id).eq('month', selectedMonth);
    }
    const { error } = await supabase.from('client_programs').insert({
      client_id: client.id,
      template_id: templateId,
      month: selectedMonth,
      year: new Date().getFullYear(),
      is_active: true,
    });
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }
    showAlert('✅ Program Assigned!',
      `"${templateName}" assigned to ${client.name} for ${selectedMonth}.`,
      [{ text: 'Done', onPress: () => navigation.goBack() }]
    );
  }

  if (!client) return null;

  const groupByDay = (exs) => {
    const g = {};
    (exs || []).forEach(ex => {
      if (!g[ex.day]) g[ex.day] = [];
      g[ex.day].push(ex);
    });
    return g;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.clientSub}>Assign Workout Program</Text>
          </View>
        </View>

        {/* Month selector */}
        <Text style={styles.sectionLabel}>Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.monthScroll}>
          {MONTHS.map(m => (
            <TouchableOpacity key={m}
              style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
              onPress={() => setSelectedMonth(m)}>
              <Text style={[styles.monthChipText,
                selectedMonth === m && styles.monthChipTextActive]}>
                {m.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'saved' && styles.tabBtnActive]}
            onPress={() => setTab('saved')}>
            <Text style={[styles.tabBtnText, tab === 'saved' && styles.tabBtnTextActive]}>
              📋 Saved Templates
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'custom' && styles.tabBtnActive]}
            onPress={() => setTab('custom')}>
            <Text style={[styles.tabBtnText, tab === 'custom' && styles.tabBtnTextActive]}>
              ✏️ Build Custom
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── SAVED TEMPLATES TAB ── */}
        {tab === 'saved' && (
          <View>
            {savedTemplates.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No saved templates</Text>
                <Text style={styles.emptySub}>Build a custom program in the other tab</Text>
              </View>
            ) : savedTemplates.map(tpl => (
              <View key={tpl.id} style={styles.tplCard}>
                <View style={styles.tplHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplName}>{tpl.name}</Text>
                    <Text style={styles.tplMeta}>
                      {tpl.split_type} · {tpl.template_exercises?.length || 0} exercises
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.assignBtn, loading && { opacity: 0.6 }]}
                    onPress={() => assignProgram(tpl.id, tpl.name)}
                    disabled={loading}>
                    <Text style={styles.assignBtnText}>Assign →</Text>
                  </TouchableOpacity>
                </View>

                {/* Day tags */}
                <View style={styles.dayTagRow}>
                  {[...new Set((tpl.template_exercises || []).map(e => e.day))].map(d => (
                    <View key={d} style={styles.dayTag}>
                      <Text style={styles.dayTagText}>{d.slice(0, 3)}</Text>
                    </View>
                  ))}
                </View>

                {/* Exercise preview grouped by day */}
                {Object.entries(groupByDay(tpl.template_exercises))
                  .sort(([a], [b]) => DAYS.indexOf(a) - DAYS.indexOf(b))
                  .map(([day, exs]) => (
                    <View key={day} style={styles.dayGroup}>
                      <Text style={styles.dayGroupLabel}>{day}</Text>
                      {exs.sort((a, b) => a.order_index - b.order_index).map((ex, i) => (
                        <View key={i} style={styles.exPreviewRow}>
                          <Text style={styles.exPreviewName}>{ex.exercise_name}</Text>
                          <Text style={styles.exPreviewMeta}>
                            {ex.working_sets}×{ex.reps}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))
                }
              </View>
            ))}
          </View>
        )}

        {/* ── CUSTOM BUILDER TAB ── */}
        {tab === 'custom' && (
          <View>
            <Text style={styles.sectionLabel}>Template Name</Text>
            <RNTextInput value={customName} onChangeText={setCustomName}
              style={styles.nameInput}
              placeholder="e.g. Push Pull Legs Program"
              placeholderTextColor={COLORS.textMuted} />

            {/* Mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, customMode === 'form' && styles.modeBtnActive]}
                onPress={() => setCustomMode('form')}>
                <Text style={[styles.modeBtnText, customMode === 'form' && styles.modeBtnTextActive]}>
                  Form Entry
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, customMode === 'bulk' && styles.modeBtnActive]}
                onPress={() => setCustomMode('bulk')}>
                <Text style={[styles.modeBtnText, customMode === 'bulk' && styles.modeBtnTextActive]}>
                  Bulk Paste
                </Text>
              </TouchableOpacity>
            </View>

            {customMode === 'bulk' && (
              <View style={styles.bulkCard}>
                <Text style={styles.bulkHelp}>
                  Format: Day | Exercise | Warmup Sets | Working Sets | Reps | Muscle Group{'\n'}
                  Example: Monday | Bench Press | 2 | 3 | 8-12 | Chest
                </Text>
                <RNTextInput value={bulkText} onChangeText={setBulkText}
                  style={styles.bulkInput}
                  placeholder="Paste exercises here..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline />
                <TouchableOpacity style={styles.parseBulkBtn} onPress={parseBulk}>
                  <Text style={styles.parseBulkBtnText}>⚡ Parse Exercises</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Exercises list with batch move */}
            {exercises.length > 0 && (
              <View>
                <View style={styles.batchToolbar}>
                  <Text style={styles.sectionLabel}>
                    Exercises ({exercises.length})
                  </Text>
                  <TouchableOpacity
                    style={[styles.batchToggleBtn, batchMode && styles.batchToggleBtnActive]}
                    onPress={() => {
                      setBatchMode(!batchMode);
                      setSelectedExIndices([]);
                    }}>
                    <Text style={[styles.batchToggleBtnText,
                      batchMode && styles.batchToggleBtnTextActive]}>
                      {batchMode ? '✕ Exit' : '📦 Batch Move'}
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
                            {d === 'All' ? 'All' : d.slice(0, 3)}
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

                {/* Exercise items */}
                {(batchMode ? filteredIndices : exercises.map((_, i) => i)).map(i => {
                  const ex = exercises[i];
                  const isSelected = selectedExIndices.includes(i);
                  return (
                    <TouchableOpacity key={i}
                      style={[styles.exItem,
                        batchMode && isSelected && styles.exItemSelected]}
                      onPress={() => batchMode ? toggleExSelection(i) : openEdit(i)}
                      activeOpacity={0.7}>

                      {batchMode && (
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                          {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                        </View>
                      )}

                      {!batchMode && (
                        <View style={styles.exReorder}>
                          <TouchableOpacity onPress={() => moveExercise(i, -1)}>
                            <Text style={styles.reorderBtn}>▲</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => moveExercise(i, 1)}>
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
                            onPress={() => openEdit(i)}>
                            <Text style={{ fontSize: 14 }}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.exDeleteBtn}
                            onPress={() => removeExercise(i)}>
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
              </View>
            )}

            {customMode === 'form' && (
              <TouchableOpacity style={styles.addExBtn} onPress={openAdd}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>
            )}

            {exercises.length > 0 && (
              <TouchableOpacity
                style={[styles.saveTemplateBtn, loading && { opacity: 0.6 }]}
                onPress={saveCustomTemplate} disabled={loading}>
                <Text style={styles.saveTemplateBtnText}>
                  {loading ? 'Saving...' : '💾 Save & Assign Program'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {/* ── ADD/EDIT EXERCISE MODAL ── */}
      <Modal visible={showExModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingIdx !== null ? '✏️ Edit Exercise' : '➕ Add Exercise'}
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
                    {editingIdx !== null ? 'Update' : 'Add'}
                  </Text>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  clientAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  monthScroll: { marginBottom: 16 },
  monthChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  monthChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  monthChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  monthChipTextActive: { color: COLORS.white },
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding: 3, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, alignItems: 'center' },
  tabBtnActive: { backgroundColor: COLORS.roseGold },
  tabBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  tabBtnTextActive: { color: COLORS.white },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4, textAlign: 'center' },
  tplCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder, padding: 14 },
  tplHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tplName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  tplMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  assignBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 8 },
  assignBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm },
  dayTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  dayTag: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  dayTagText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  dayGroup: { marginBottom: 8 },
  dayGroupLabel: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  exPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  exPreviewName: { color: COLORS.white, fontSize: SIZES.xs },
  exPreviewMeta: { color: COLORS.textMuted, fontSize: SIZES.xs },
  nameInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 12 },
  modeToggle: { flexDirection: 'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding: 3, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.full, alignItems: 'center' },
  modeBtnActive: { backgroundColor: COLORS.roseGold },
  modeBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  modeBtnTextActive: { color: COLORS.white },
  bulkCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  bulkHelp: { color: COLORS.textMuted, fontSize: SIZES.xs, lineHeight: 18, marginBottom: 10, fontStyle: 'italic' },
  bulkInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 120, textAlignVertical: 'top', marginBottom: 8 },
  parseBulkBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 10, alignItems: 'center' },
  parseBulkBtnText: { color: COLORS.white, ...FONTS.bold },
  batchToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  batchToggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchToggleBtnActive: { backgroundColor: COLORS.roseGoldFaint, borderColor: COLORS.roseGold },
  batchToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  batchToggleBtnTextActive: { color: COLORS.roseGold },
  batchMoveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold },
  batchMoveBtnText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  batchControls: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchHint: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8 },
  dayFilterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  dayFilterChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayFilterChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  dayFilterChipTextActive: { color: COLORS.white },
  batchSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  batchSelectBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  batchSelectBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  batchClearBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchClearBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  batchCount: { color: COLORS.textMuted, fontSize: SIZES.xs, marginLeft: 'auto' },
  exItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder, gap: 8 },
  exItemSelected: { borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  exReorder: { gap: 2 },
  reorderBtn: { color: COLORS.textMuted, fontSize: 14, padding: 2 },
  exItemName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  exItemMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  exItemActions: { flexDirection: 'row', gap: 4 },
  exEditBtn: { padding: 6, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm },
  exDeleteBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.sm },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: COLORS.darkBorder, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.darkCard },
  checkboxActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  checkboxTick: { color: COLORS.white, fontSize: 12, ...FONTS.bold },
  dayBadge: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  dayBadgeText: { color: COLORS.white, fontSize: 9, ...FONTS.bold },
  addExBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.bold },
  saveTemplateBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  saveTemplateBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  batchDayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  batchDayBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder, minWidth: '30%', alignItems: 'center' },
  batchDayBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  batchDayBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  batchDayBtnTextActive: { color: COLORS.white },
  batchPreview: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  batchPreviewTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom: 6 },
  batchPreviewItem: { color: COLORS.white, fontSize: SIZES.xs, marginBottom: 3 },
  batchPreviewMore: { color: COLORS.textMuted, fontSize: SIZES.xs, fontStyle: 'italic' },
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
});