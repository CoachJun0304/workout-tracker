import { showAlert, showConfirm } from '../../utils/webAlert';
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, TextInput as RNTextInput, Modal, FlatList
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

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

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    const { data } = await supabase
      .from('workout_templates')
      .select('*, template_exercises(*)')
      .order('created_at', { ascending: false });
    setSavedTemplates(data || []);
  }

  // ── Exercise form ──
  function openAdd() {
    setEditingIdx(null);
    setExForm({ day:'Monday', exercise_name:'', warmup_sets:'0', working_sets:'3', reps:'8-12', muscle_group:'Chest' });
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
    if (!exForm.exercise_name.trim()) { showAlert('Error', 'Exercise name required'); return; }
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
    showAlert('Remove', 'Remove this exercise?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        setExercises(e => e.filter((_, i) => i !== idx))
      }
    ]);
  }

  function parseBulk() {
    const lines = bulkText.split('\n').filter(l => l.trim());
    const parsed = [];
    const errors = [];
    lines.forEach((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) { errors.push(`Line ${i+1}: needs 5 parts`); return; }
      const [day, exercise_name, warmup_sets, working_sets, reps, muscle_group] = parts;
      if (!DAYS.includes(day)) { errors.push(`Line ${i+1}: invalid day "${day}"`); return; }
      parsed.push({
        day, exercise_name,
        warmup_sets: parseInt(warmup_sets)||0,
        working_sets: parseInt(working_sets)||3,
        reps: reps||'8-12',
        muscle_group: muscle_group||'Other',
      });
    });
    if (errors.length) showAlert('Errors', errors.slice(0,5).join('\n'));
    if (parsed.length) {
      setExercises(e => [...e, ...parsed]);
      setBulkText('');
      showAlert('✅ Parsed!', `${parsed.length} exercises added.`);
    }
  }

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
    showAlert('✅ Saved!', `"${customName}" saved. Select it from the Saved tab to assign.`);
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
    showAlert('✅ Assigned!',
      `"${templateName}" assigned to ${client.name} for ${selectedMonth}.`, [
      { text: 'Done', onPress: () => navigation.goBack() }
    ]);
  }

  const groupByDay = (exs) => {
    const g = {};
    (exs||[]).forEach(ex => { if (!g[ex.day]) g[ex.day]=[]; g[ex.day].push(ex); });
    return g;
  };

  return (
    <View style={styles.container}>
      {/* Client banner */}
      <View style={styles.clientBanner}>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Assign program for {selectedMonth}</Text>
        </View>
      </View>

      {/* Month picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.monthRow} contentContainerStyle={{ paddingHorizontal:16, gap:8 }}>
        {MONTHS.map(m => (
          <TouchableOpacity key={m}
            style={[styles.monthChip, selectedMonth===m && styles.monthChipActive]}
            onPress={() => setSelectedMonth(m)}>
            <Text style={[styles.monthChipText, selectedMonth===m && styles.monthChipTextActive]}>
              {m.slice(0,3)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { key:'saved', label:'💾 Saved' },
          { key:'custom', label:'✏️ Custom' },
        ].map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.tabBtn, tab===t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab===t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── SAVED TAB ── */}
        {tab === 'saved' && (
          <View>
            <Text style={styles.hint}>Tap Assign to give this program to {client.name}</Text>
            {savedTemplates.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>📭</Text>
                  <Text style={styles.emptyText}>No saved templates yet</Text>
                  <Text style={styles.emptySub}>Create one using the Custom tab</Text>
                </View>
              : savedTemplates.map(tpl => (
                <View key={tpl.id} style={styles.tplCard}>
                  <View style={styles.tplRow}>
                    <View style={{ flex:1 }}>
                      <Text style={styles.tplName}>{tpl.name}</Text>
                      <Text style={styles.tplMeta}>
                        {tpl.split_type} · {tpl.template_exercises?.length||0} exercises
                      </Text>
                      <View style={styles.dayTagRow}>
                        {[...new Set((tpl.template_exercises||[]).map(e=>e.day))].map(d => (
                          <View key={d} style={styles.dayTag}>
                            <Text style={styles.dayTagText}>{d.slice(0,3)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <TouchableOpacity style={styles.assignBtn}
                      onPress={() => assignProgram(tpl.id, tpl.name)} disabled={loading}>
                      <Text style={styles.assignBtnText}>Assign</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* ── CUSTOM TAB ── */}
        {tab === 'custom' && (
          <View>
            <Text style={styles.hint}>
              Build a custom program for {client.name} then assign it
            </Text>

            <Text style={styles.fieldLabel}>Template Name</Text>
            <TextInput value={customName} onChangeText={setCustomName}
              style={styles.input} mode="outlined"
              placeholder="e.g. Maria PPL May 2025"
              placeholderTextColor={COLORS.textMuted}
              outlineColor={COLORS.darkBorder2}
              activeOutlineColor={COLORS.roseGold}
              textColor={COLORS.white} />

            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, customMode==='form' && styles.modeBtnActive]}
                onPress={() => setCustomMode('form')}>
                <Text style={[styles.modeBtnText, customMode==='form' && styles.modeBtnTextActive]}>
                  ➕ One by One
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, customMode==='bulk' && styles.modeBtnActive]}
                onPress={() => setCustomMode('bulk')}>
                <Text style={[styles.modeBtnText, customMode==='bulk' && styles.modeBtnTextActive]}>
                  📋 Bulk Paste
                </Text>
              </TouchableOpacity>
            </View>

            {customMode === 'form' && (
              <TouchableOpacity style={styles.addExBtn} onPress={openAdd}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>
            )}

            {customMode === 'bulk' && (
              <View style={styles.bulkContainer}>
                <Text style={styles.bulkHint}>
                  Format: Day | Exercise | Warmup Sets | Working Sets | Reps | Muscle{'\n\n'}
                  Example:{'\n'}Monday | Bench Press | 2 | 4 | 6-10 | Chest{'\n'}
                  Monday | Incline DB Press | 0 | 3 | 8-12 | Chest
                </Text>
                <RNTextInput value={bulkText} onChangeText={setBulkText}
                  style={styles.bulkInput} multiline numberOfLines={8}
                  placeholder="Paste exercises here..."
                  placeholderTextColor={COLORS.textMuted} />
                <TouchableOpacity style={styles.parseBtn}
                  onPress={parseBulk} disabled={!bulkText.trim()}>
                  <Text style={styles.parseBtnText}>⚡ Parse Exercises</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Exercise list with reorder */}
            {exercises.length > 0 && (
              <View style={styles.exListContainer}>
                <Text style={styles.fieldLabel}>
                  Exercises ({exercises.length})
                </Text>
                {Object.entries(groupByDay(exercises)).map(([day, dayExs]) => (
                  <View key={day}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayHeaderText}>{day}</Text>
                      <Text style={styles.dayHeaderCount}>{dayExs.length} exercises</Text>
                    </View>
                    {dayExs.map((ex, i) => {
                      const globalIdx = exercises.findIndex(
                        e => e.day===ex.day && e.exercise_name===ex.exercise_name
                      );
                      return (
                        <View key={i} style={styles.exItem}>
                          <View style={styles.exReorder}>
                            <TouchableOpacity onPress={() => moveExercise(globalIdx, -1)}>
                              <Text style={styles.reorderBtn}>▲</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => moveExercise(globalIdx, 1)}>
                              <Text style={styles.reorderBtn}>▼</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={{ flex:1 }}>
                            <Text style={styles.exItemName}>{ex.exercise_name}</Text>
                            <Text style={styles.exItemMeta}>
                              {ex.muscle_group} · W:{ex.warmup_sets} S:{ex.working_sets} · {ex.reps}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => openEdit(globalIdx)}
                            style={styles.exEditBtn}>
                            <Text style={{ fontSize:14 }}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeExercise(globalIdx)}
                            style={styles.exDelBtn}>
                            <Text style={{ fontSize:14 }}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}

                <TouchableOpacity style={styles.saveTemplateBtn}
                  onPress={saveCustomTemplate} disabled={loading}>
                  <Text style={styles.saveTemplateBtnText}>
                    {loading ? 'Saving...' : '💾 Save & Go to Assign Tab'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Exercise form modal */}
      <Modal visible={showExModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingIdx !== null ? '✏️ Edit Exercise' : '➕ Add Exercise'}
              </Text>

              <Text style={styles.modalLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                {DAYS.map(d => (
                  <TouchableOpacity key={d}
                    style={[styles.dayChip, exForm.day===d && styles.dayChipActive]}
                    onPress={() => setExForm(f=>({...f, day:d}))}>
                    <Text style={[styles.dayChipText, exForm.day===d && styles.dayChipTextActive]}>
                      {d.slice(0,3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.modalLabel}>Exercise Name</Text>
              <RNTextInput value={exForm.exercise_name}
                onChangeText={v => setExForm(f=>({...f, exercise_name:v}))}
                style={styles.modalInput} placeholder="e.g. Barbell Bench Press"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>Muscle Group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                {MUSCLE_GROUPS.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.dayChip, exForm.muscle_group===m && styles.dayChipActive]}
                    onPress={() => setExForm(f=>({...f, muscle_group:m}))}>
                    <Text style={[styles.dayChipText, exForm.muscle_group===m && styles.dayChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.setsRow}>
                <View style={{ flex:1 }}>
                  <Text style={styles.modalLabel}>Warmup Sets</Text>
                  <RNTextInput value={exForm.warmup_sets}
                    onChangeText={v => setExForm(f=>({...f, warmup_sets:v}))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={styles.modalLabel}>Working Sets</Text>
                  <RNTextInput value={exForm.working_sets}
                    onChangeText={v => setExForm(f=>({...f, working_sets:v}))}
                    style={styles.modalInput} placeholder="3"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={styles.modalLabel}>Reps</Text>
                  <RNTextInput value={exForm.reps}
                    onChangeText={v => setExForm(f=>({...f, reps:v}))}
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
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  clientBanner: { flexDirection:'row', alignItems:'center', gap:12, padding:16, paddingTop:20, backgroundColor: COLORS.darkCard, borderBottomWidth:1, borderBottomColor: COLORS.darkBorder },
  clientAvatar: { width:44, height:44, borderRadius:22, backgroundColor: COLORS.roseGoldMid, justifyContent:'center', alignItems:'center' },
  clientAvatarText: { color: COLORS.roseGold, fontSize:20, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop:2 },
  monthRow: { maxHeight:52 },
  tabRow: { flexDirection:'row', padding:12, gap:8 },
  tabBtn: { flex:1, paddingVertical:10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  tabTextActive: { color: COLORS.white },
  scroll: { flex:1 },
  scrollContent: { padding:16, paddingBottom:40 },
  hint: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom:12 },
  empty: { alignItems:'center', paddingVertical:40 },
  emptyEmoji: { fontSize:40, marginBottom:8 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop:4, textAlign:'center' },
  tplCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:14, marginBottom:10, borderWidth:1, borderColor: COLORS.darkBorder },
  tplRow: { flexDirection:'row', alignItems:'center', gap:12 },
  tplName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  tplMeta: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginTop:2 },
  dayTagRow: { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  dayTag: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: COLORS.roseGoldMid },
  dayTagText: { color: COLORS.roseGold, fontSize:10, ...FONTS.semibold },
  assignBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal:16, paddingVertical:8 },
  assignBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm },
  fieldLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:12 },
  input: { marginBottom:8, backgroundColor: COLORS.darkCard2 },
  modeToggle: { flexDirection:'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding:3, marginBottom:12 },
  modeBtn: { flex:1, paddingVertical:8, borderRadius: RADIUS.full, alignItems:'center' },
  modeBtnActive: { backgroundColor: COLORS.roseGold },
  modeBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  modeBtnTextActive: { color: COLORS.white },
  addExBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor: COLORS.roseGoldMid, marginBottom:12 },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md },
  bulkContainer: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  bulkHint: { color: COLORS.textMuted, fontSize: SIZES.xs, lineHeight:18, marginBottom:10, fontFamily:'monospace' },
  bulkInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.sm, borderWidth:1, borderColor: COLORS.darkBorder2, minHeight:160, textAlignVertical:'top', marginBottom:10 },
  parseBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:12, alignItems:'center' },
  parseBtnText: { color: COLORS.white, ...FONTS.bold },
  exListContainer: { marginTop:8 },
  dayHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:12, marginBottom:6 },
  dayHeaderText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm, textTransform:'uppercase', letterSpacing:1 },
  dayHeaderCount: { color: COLORS.textMuted, fontSize: SIZES.xs },
  exItem: { flexDirection:'row', alignItems:'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:6, borderWidth:1, borderColor: COLORS.darkBorder, gap:8 },
  exReorder: { gap:2 },
  reorderBtn: { color: COLORS.textMuted, fontSize:12, padding:2 },
  exItemName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  exItemMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  exEditBtn: { padding:6, backgroundColor: COLORS.darkCard2, borderRadius:6 },
  exDelBtn: { padding:6, backgroundColor:'#FF4B4B22', borderRadius:6 },
  saveTemplateBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginTop:16, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  saveTemplateBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  dayChip: { paddingHorizontal:12, paddingVertical:6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight:6, borderWidth:1, borderColor: COLORS.darkBorder },
  dayChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.medium },
  dayChipTextActive: { color: COLORS.white },
  setsRow: { flexDirection:'row', gap:8 },
  modalBtns: { flexDirection:'row', gap:12, marginTop:16 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});