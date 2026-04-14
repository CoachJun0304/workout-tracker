import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, TextInput as RNTextInput, Modal,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { PRESET_TEMPLATES } from '../../data/presetTemplates';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLES = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
                 'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core'];

export default function AssignProgramScreen({ route, navigation }) {
  const { client } = route.params;
  const { profile } = useAuth();
  const [tab, setTab] = useState('preset');
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  // Custom builder state
  const [templateName, setTemplateName] = useState('');
  const [inputMode, setInputMode] = useState('form');
  const [exercises, setExercises] = useState([]);
  const [bulkText, setBulkText] = useState('');

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [form, setForm] = useState({
    day: 'Monday', exercise_name: '',
    warmup_sets: '0', working_sets: '3',
    reps: '8-12', muscle_group: 'Chest',
  });

  useEffect(() => { fetchSaved(); }, []);

  async function fetchSaved() {
    const { data } = await supabase
      .from('workout_templates')
      .select('*, template_exercises(*)')
      .order('created_at', { ascending: false });
    setSavedTemplates(data || []);
  }

  // ── FORM MODAL ─────────────────────────────────────────

  function openAdd() {
    setEditIdx(null);
    setForm({
      day: 'Monday', exercise_name: '',
      warmup_sets: '0', working_sets: '3',
      reps: '8-12', muscle_group: 'Chest',
    });
    setShowModal(true);
  }

  function openEdit(idx) {
    const ex = exercises[idx];
    setEditIdx(idx);
    setForm({
      day: ex.day,
      exercise_name: ex.exercise_name,
      warmup_sets: String(ex.warmup_sets),
      working_sets: String(ex.working_sets),
      reps: ex.reps,
      muscle_group: ex.muscle_group,
    });
    setShowModal(true);
  }

  function saveForm() {
    if (!form.exercise_name.trim()) {
      Alert.alert('Error', 'Exercise name is required'); return;
    }
    const ex = {
      day: form.day,
      exercise_name: form.exercise_name.trim(),
      warmup_sets: parseInt(form.warmup_sets) || 0,
      working_sets: parseInt(form.working_sets) || 3,
      reps: form.reps || '8-12',
      muscle_group: form.muscle_group,
    };
    if (editIdx !== null) {
      setExercises(e => e.map((item, i) => i === editIdx ? ex : item));
    } else {
      setExercises(e => [...e, ex]);
    }
    setShowModal(false);
  }

  function removeExercise(idx) {
    Alert.alert('Remove', 'Remove this exercise?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive',
        onPress: () => setExercises(e => e.filter((_, i) => i !== idx)) },
    ]);
  }

  // ── BULK PARSE ─────────────────────────────────────────

  function parseBulk() {
    const lines = bulkText.split('\n').filter(l => l.trim());
    const parsed = [];
    const errors = [];
    lines.forEach((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) {
        errors.push(`Line ${i+1}: needs 5+ parts`); return;
      }
      if (!DAYS.includes(parts[0])) {
        errors.push(`Line ${i+1}: "${parts[0]}" is not a valid day`); return;
      }
      parsed.push({
        day: parts[0],
        exercise_name: parts[1],
        warmup_sets: parseInt(parts[2]) || 0,
        working_sets: parseInt(parts[3]) || 3,
        reps: parts[4] || '8-12',
        muscle_group: parts[5] || 'Other',
      });
    });
    if (errors.length > 0) {
      Alert.alert('Format errors', errors.slice(0,5).join('\n'));
    }
    if (parsed.length > 0) {
      setExercises(e => [...e, ...parsed]);
      setBulkText('');
      Alert.alert('✅ Done', `${parsed.length} exercises added.`);
    }
  }

  // ── SAVE TEMPLATE ──────────────────────────────────────

  async function saveTemplate() {
    if (!templateName.trim()) {
      Alert.alert('Error', 'Template name is required'); return;
    }
    if (exercises.length === 0) {
      Alert.alert('Error', 'Add at least one exercise'); return;
    }
    setLoading(true);
    const { data: tpl, error } = await supabase
      .from('workout_templates')
      .insert({
        name: templateName.trim(),
        split_type: 'Custom',
        created_by: profile?.id || null,
        is_preset: false,
      })
      .select().single();

    if (error) { Alert.alert('Error', error.message); setLoading(false); return; }

    await supabase.from('template_exercises').insert(
      exercises.map((ex, i) => ({
        template_id: tpl.id,
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
    await fetchSaved();
    Alert.alert('✅ Template Saved!',
      `"${templateName}" saved with ${exercises.length} exercises.\n\nGo to Saved tab to assign it to ${client.name}.`);
    setTemplateName('');
    setExercises([]);
    setTab('saved');
  }

  // ── ASSIGN ─────────────────────────────────────────────

  async function assign(tplId, tplName) {
    const { data: existing } = await supabase
      .from('client_programs')
      .select('id')
      .eq('client_id', client.id)
      .eq('month', month)
      .eq('is_active', true);

    if (existing && existing.length > 0) {
      Alert.alert('Program Exists',
        `${client.name} already has a program for ${month}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add to existing',
            onPress: () => doAssign(tplId, tplName, false) },
          { text: 'Replace', style: 'destructive',
            onPress: () => doAssign(tplId, tplName, true) },
        ]
      );
    } else {
      doAssign(tplId, tplName, false);
    }
  }

  async function doAssign(tplId, tplName, replace) {
    setLoading(true);
    if (replace) {
      await supabase.from('client_programs')
        .update({ is_active: false })
        .eq('client_id', client.id)
        .eq('month', month);
    }
    const { error } = await supabase.from('client_programs').insert({
      client_id: client.id,
      template_id: tplId,
      month,
      year: new Date().getFullYear(),
      is_active: true,
    });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('✅ Assigned!',
      `"${tplName}" assigned to ${client.name} for ${month}.`, [
      { text: 'Done', onPress: () => navigation.goBack() }
    ]);
  }

  // ── RENDER ─────────────────────────────────────────────

  const groupByDay = exs => {
    const g = {};
    exs.forEach(ex => {
      if (!g[ex.day]) g[ex.day] = [];
      g[ex.day].push(ex);
    });
    return g;
  };

  return (
    <View style={styles.container}>

      {/* Client + month header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Assigning for {month}</Text>
        </View>
      </View>

      {/* Month scroller */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.monthScroll}
        contentContainerStyle={styles.monthScrollContent}>
        {MONTHS.map(m => (
          <TouchableOpacity key={m}
            style={[styles.monthChip, month === m && styles.monthChipActive]}
            onPress={() => setMonth(m)}>
            <Text style={[styles.monthChipText,
              month === m && styles.monthChipTextActive]}>
              {m.slice(0, 3)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { key: 'preset', label: '📋 Pre-loaded' },
          { key: 'saved',  label: '💾 Saved' },
          { key: 'custom', label: '✏️ Custom' },
        ].map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── PRESET ── */}
        {tab === 'preset' && PRESET_TEMPLATES.map(tpl => (
          <View key={tpl.id} style={styles.tplCard}>
            <View style={styles.tplRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tplName}>{tpl.name}</Text>
                <Text style={styles.tplMeta}>
                  {tpl.split_type} · {tpl.exercises.length} exercises
                </Text>
              </View>
              <TouchableOpacity style={styles.assignBtn}
                onPress={() => assign(tpl.id, tpl.name)} disabled={loading}>
                <Text style={styles.assignBtnText}>Assign</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dayChips}>
              {[...new Set(tpl.exercises.map(e => e.day))].map(d => (
                <View key={d} style={styles.dayChip}>
                  <Text style={styles.dayChipText}>{d.slice(0,3)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* ── SAVED ── */}
        {tab === 'saved' && (
          savedTemplates.length === 0
            ? <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>No saved templates</Text>
                <Text style={styles.emptySub}>Build one in the Custom tab</Text>
              </View>
            : savedTemplates.map(tpl => (
              <View key={tpl.id} style={styles.tplCard}>
                <View style={styles.tplRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplName}>{tpl.name}</Text>
                    <Text style={styles.tplMeta}>
                      {tpl.split_type} · {tpl.template_exercises?.length || 0} exercises
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.assignBtn}
                    onPress={() => assign(tpl.id, tpl.name)} disabled={loading}>
                    <Text style={styles.assignBtnText}>Assign</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
        )}

        {/* ── CUSTOM ── */}
        {tab === 'custom' && (
          <View>
            <Text style={styles.hint}>
              Build a custom program then save it as a template
            </Text>

            {/* Name */}
            <Text style={styles.fieldLabel}>Template Name</Text>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              style={styles.input}
              mode="outlined"
              placeholder={`e.g. ${client.name.split(' ')[0]}'s PPL May`}
              placeholderTextColor={COLORS.textMuted}
              outlineColor={COLORS.darkBorder2}
              activeOutlineColor={COLORS.roseGold}
              textColor={COLORS.white}
            />

            {/* Mode toggle */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn,
                  inputMode === 'form' && styles.modeBtnActive]}
                onPress={() => setInputMode('form')}>
                <Text style={[styles.modeBtnText,
                  inputMode === 'form' && styles.modeBtnTextActive]}>
                  ➕ Add One by One
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn,
                  inputMode === 'bulk' && styles.modeBtnActive]}
                onPress={() => setInputMode('bulk')}>
                <Text style={[styles.modeBtnText,
                  inputMode === 'bulk' && styles.modeBtnTextActive]}>
                  📋 Bulk Paste
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form mode */}
            {inputMode === 'form' && (
              <TouchableOpacity style={styles.addExBtn} onPress={openAdd}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>
            )}

            {/* Bulk mode */}
            {inputMode === 'bulk' && (
              <View style={styles.bulkBox}>
                <Text style={styles.bulkHint}>
                  Format: Day | Exercise | Warmup | Working | Reps | Muscle{'\n\n'}
                  Example:{'\n'}
                  Monday | Bench Press | 2 | 4 | 6-10 | Chest{'\n'}
                  Monday | Incline Press | 0 | 3 | 8-12 | Chest{'\n'}
                  Wednesday | Barbell Row | 2 | 4 | 6-10 | Back
                </Text>
                <RNTextInput
                  value={bulkText}
                  onChangeText={setBulkText}
                  style={styles.bulkInput}
                  multiline
                  numberOfLines={6}
                  placeholder="Paste exercises here..."
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity
                  style={[styles.parseBtn, !bulkText.trim() && { opacity: 0.4 }]}
                  onPress={parseBulk}
                  disabled={!bulkText.trim()}>
                  <Text style={styles.parseBtnText}>⚡ Parse & Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Exercise list */}
            {exercises.length > 0 && (
              <View style={styles.exListBox}>
                <Text style={styles.fieldLabel}>
                  Program ({exercises.length} exercises)
                </Text>
                {Object.entries(groupByDay(exercises)).map(([day, dayExs]) => (
                  <View key={day}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayHeaderText}>{day}</Text>
                      <Text style={styles.dayHeaderCount}>
                        {dayExs.length} exercises
                      </Text>
                    </View>
                    {dayExs.map((ex, globalI) => {
                      const idx = exercises.findIndex(
                        e => e.day === ex.day &&
                             e.exercise_name === ex.exercise_name
                      );
                      return (
                        <View key={globalI} style={styles.exRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.exName}>{ex.exercise_name}</Text>
                            <Text style={styles.exMeta}>
                              W:{ex.warmup_sets} S:{ex.working_sets} |
                              {ex.reps} | {ex.muscle_group}
                            </Text>
                          </View>
                          <TouchableOpacity style={styles.editBtn}
                            onPress={() => openEdit(idx)}>
                            <Text style={styles.editBtnText}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.removeBtn}
                            onPress={() => removeExercise(idx)}>
                            <Text style={styles.removeBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.saveTemplateBtn, loading && { opacity: 0.5 }]}
                  onPress={saveTemplate}
                  disabled={loading}>
                  <Text style={styles.saveTemplateBtnText}>
                    {loading ? 'Saving...' : '💾 Save as Template'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Add/Edit Exercise Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalCard}
            contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editIdx !== null ? 'Edit Exercise' : 'Add Exercise'}
            </Text>

            {/* Day picker */}
            <Text style={styles.modalLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}>
              {DAYS.map(d => (
                <TouchableOpacity key={d}
                  style={[styles.pickerChip,
                    form.day === d && styles.pickerChipActive]}
                  onPress={() => setForm(f => ({ ...f, day: d }))}>
                  <Text style={[styles.pickerChipText,
                    form.day === d && styles.pickerChipTextActive]}>
                    {d.slice(0,3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Exercise name */}
            <Text style={styles.modalLabel}>Exercise Name</Text>
            <RNTextInput
              value={form.exercise_name}
              onChangeText={v => setForm(f => ({ ...f, exercise_name: v }))}
              style={styles.modalInput}
              placeholder="e.g. Bench Press"
              placeholderTextColor={COLORS.textMuted}
            />

            {/* Sets */}
            <View style={styles.setsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Warmup Sets</Text>
                <RNTextInput
                  value={form.warmup_sets}
                  onChangeText={v => setForm(f => ({ ...f, warmup_sets: v }))}
                  style={styles.modalInput}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Working Sets</Text>
                <RNTextInput
                  value={form.working_sets}
                  onChangeText={v => setForm(f => ({ ...f, working_sets: v }))}
                  style={styles.modalInput}
                  placeholder="3"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Reps</Text>
                <RNTextInput
                  value={form.reps}
                  onChangeText={v => setForm(f => ({ ...f, reps: v }))}
                  style={styles.modalInput}
                  placeholder="8-12"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            {/* Muscle group */}
            <Text style={styles.modalLabel}>Muscle Group</Text>
            <View style={styles.muscleGrid}>
              {MUSCLES.map(m => (
                <TouchableOpacity key={m}
                  style={[styles.muscleChip,
                    form.muscle_group === m && styles.muscleChipActive]}
                  onPress={() => setForm(f => ({ ...f, muscle_group: m }))}>
                  <Text style={[styles.muscleChipText,
                    form.muscle_group === m && styles.muscleChipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveForm}>
                <Text style={styles.modalSaveText}>
                  {editIdx !== null ? 'Update' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 14,
    backgroundColor: COLORS.darkCard,
    borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.roseGoldMid,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.roseGold, fontSize: 18, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 1 },
  monthScroll: { maxHeight: 44 },
  monthScrollContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  monthChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  monthChipText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  monthChipTextActive: { color: COLORS.white },
  tabRow: { flexDirection: 'row', padding: 10, gap: 6 },
  tabBtn: {
    flex: 1, paddingVertical: 9, borderRadius: RADIUS.full,
    backgroundColor: COLORS.darkCard, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, fontSize: 11, ...FONTS.semibold },
  tabTextActive: { color: COLORS.white },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40 },
  tplCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  tplRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tplName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  tplMeta: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  assignBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  assignBtnText: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.bold },
  dayChips: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  dayChip: {
    backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.roseGoldMid,
  },
  dayChipText: { color: COLORS.roseGold, fontSize: 10, ...FONTS.semibold },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  hint: {
    color: COLORS.textSecondary, fontSize: SIZES.sm,
    marginBottom: 14, lineHeight: 20,
  },
  fieldLabel: {
    color: COLORS.textSecondary, fontSize: SIZES.xs,
    ...FONTS.semibold, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  input: { backgroundColor: COLORS.darkCard2, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: RADIUS.full,
    backgroundColor: COLORS.darkCard, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  modeBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  modeBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  modeBtnTextActive: { color: COLORS.white },
  addExBtn: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.roseGoldMid,
    borderStyle: 'dashed', marginBottom: 12,
  },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md },
  bulkBox: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  bulkHint: {
    color: COLORS.textMuted, fontSize: 11,
    lineHeight: 18, marginBottom: 10,
  },
  bulkInput: {
    backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md,
    padding: 12, color: COLORS.white, fontSize: SIZES.sm,
    borderWidth: 1, borderColor: COLORS.darkBorder,
    minHeight: 120, textAlignVertical: 'top', marginBottom: 10,
  },
  parseBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 12, alignItems: 'center',
  },
  parseBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm },
  exListBox: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6, marginTop: 10,
  },
  dayHeaderText: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.bold },
  dayHeaderCount: { color: COLORS.textMuted, fontSize: SIZES.xs },
  exRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md,
    padding: 10, marginBottom: 6, gap: 8,
  },
  exName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  exMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  editBtn: { padding: 6 },
  editBtnText: { fontSize: 16 },
  removeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.error + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { color: COLORS.error, fontSize: 12, ...FONTS.bold },
  saveTemplateBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  saveTemplateBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.darkCard,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalContent: { padding: 24, paddingBottom: 40 },
  modalTitle: {
    color: COLORS.white, ...FONTS.heavy,
    fontSize: SIZES.xl, marginBottom: 16,
  },
  modalLabel: {
    color: COLORS.textSecondary, fontSize: SIZES.xs,
    ...FONTS.semibold, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md,
    padding: 12, color: COLORS.white, fontSize: SIZES.md,
    borderWidth: 1, borderColor: COLORS.darkBorder2, marginBottom: 8,
  },
  setsRow: { flexDirection: 'row', gap: 8 },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  muscleChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  muscleChipActive: {
    backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold,
  },
  muscleChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.medium },
  muscleChipTextActive: { color: COLORS.white },
  pickerChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2,
    borderWidth: 1, borderColor: COLORS.darkBorder, marginRight: 6,
  },
  pickerChipActive: {
    backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold,
  },
  pickerChipText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  pickerChipTextActive: { color: COLORS.white },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.full,
    backgroundColor: COLORS.darkCard2, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: RADIUS.full,
    backgroundColor: COLORS.roseGold, alignItems: 'center',
  },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});