import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, toKg, unitLabel } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getPhaseForDate, CYCLE_PHASES } from '../../data/cycleData';

const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CoachHealthScreen({ route }) {
  const { client } = route.params || {};
  const { profile } = useAuth();
  const [tab, setTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [macroLogs, setMacroLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [editingWeight, setEditingWeight] = useState(null);
  const [targetInput, setTargetInput] = useState({ protein: '', carbs: '', fats: '' });
  const [feedbackText, setFeedbackText] = useState('');
  const [loading, setLoading] = useState(false);

  const clientUnit = client?.unit_preference || 'kg';
  const ul = unitLabel(clientUnit);
  const isFemale = client?.gender === 'Female';

  useEffect(() => {
    if (client?.id) fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [wRes, mRes, tRes, fRes, cRes] = await Promise.all([
        supabase.from('weight_logs').select('*')
          .eq('client_id', client.id)
          .order('logged_at', { ascending: false }),
        supabase.from('macro_logs').select('*')
          .eq('client_id', client.id)
          .order('date', { ascending: false }).limit(14),
        supabase.from('macro_targets').select('*')
          .eq('client_id', client.id).single(),
        supabase.from('workout_feedback').select('*')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false }),
        supabase.from('menstrual_cycles').select('*')
          .eq('client_id', client.id)
          .order('cycle_start_date', { ascending: false }),
      ]);
      setWeightLogs(wRes.data || []);
      setMacroLogs(mRes.data || []);
      setMacroTargets(tRes.data || null);
      setFeedbacks(fRes.data || []);
      setCycles(cRes.data || []);
      if (tRes.data) {
        setTargetInput({
          protein: String(tRes.data.protein_g),
          carbs: String(tRes.data.carbs_g),
          fats: String(tRes.data.fats_g),
        });
      }
    } catch (e) {
      console.log('fetchAll error:', e.message);
    }
  }

  async function saveWeight() {
    if (!weightInput.trim()) return;
    setLoading(true);
    if (editingWeight) {
      await supabase.from('weight_logs').update({
        weight_kg: toKg(parseFloat(weightInput), clientUnit),
        notes: weightNotes.trim() || null,
      }).eq('id', editingWeight.id);
    } else {
      await supabase.from('weight_logs').insert({
        client_id: client.id,
        logged_by: profile.id,
        weight_kg: toKg(parseFloat(weightInput), clientUnit),
        notes: weightNotes.trim() || null,
      });
    }
    setLoading(false);
    setWeightInput(''); setWeightNotes(''); setEditingWeight(null);
    setShowWeightModal(false);
    fetchAll();
  }

  async function deleteWeight(id) {
    showConfirm('Delete', 'Remove this weigh-in?', async () => {
      await supabase.from('weight_logs').delete().eq('id', id);
      fetchAll();
    }, null, 'Delete', true);
  }

  async function saveMacroTargets() {
    setLoading(true);
    const calories = (
      (parseFloat(targetInput.protein) || 0) * 4 +
      (parseFloat(targetInput.carbs) || 0) * 4 +
      (parseFloat(targetInput.fats) || 0) * 9
    ).toFixed(0);
    await supabase.from('macro_targets').upsert({
      client_id: client.id,
      protein_g: parseFloat(targetInput.protein) || 0,
      carbs_g: parseFloat(targetInput.carbs) || 0,
      fats_g: parseFloat(targetInput.fats) || 0,
      calories: parseFloat(calories),
      set_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });
    setLoading(false);
    setShowTargetModal(false);
    showAlert('✅ Targets Set!', `Macro targets updated for ${client.name}.`);
    fetchAll();
  }

  async function saveFeedback() {
    if (!feedbackText.trim()) return;
    setLoading(true);
    await supabase.from('workout_feedback').insert({
      client_id: client.id,
      coach_id: profile.id,
      workout_date: new Date().toISOString().split('T')[0],
      feedback: feedbackText.trim(),
    });
    setLoading(false);
    setFeedbackText('');
    setShowFeedbackModal(false);
    fetchAll();
  }

  function getCalendarCells() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const phase = cycles.length > 0
        ? getPhaseForDate(dateStr, cycles[0].cycle_start_date, cycles[0].cycle_length)
        : null;
      cells.push({ day: d, date: dateStr, phase });
    }
    return cells;
  }

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.darkBg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.white }}>No client selected</Text>
      </View>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const tabs = ['weight', 'macros', 'feedback', ...(isFemale ? ['cycle'] : [])];
  const tabLabels = ['⚖️ Weight', '🥗 Macros', '💬 Feedback', ...(isFemale ? ['🌸 Cycle'] : [])];

  return (
    <View style={styles.container}>
      {/* Client banner */}
      <View style={styles.banner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name?.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Health & Nutrition · {ul}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}>
        {tabLabels.map((label, i) => (
          <TouchableOpacity key={i}
            style={[styles.tabBtn, tab === tabs[i] && styles.tabBtnActive]}
            onPress={() => setTab(tabs[i])}>
            <Text style={[styles.tabText, tab === tabs[i] && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Main scrollable content */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* WEIGHT TAB */}
        {tab === 'weight' && (
          <View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => {
                setEditingWeight(null);
                setWeightInput('');
                setWeightNotes('');
                setShowWeightModal(true);
              }}>
              <Text style={styles.actionBtnText}>+ Log Weigh-in for {client.name}</Text>
            </TouchableOpacity>
            {weightLogs.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No weight logs yet</Text>
                </View>
              : weightLogs.map((log, i) => {
                  const prev = weightLogs[i + 1];
                  const diff = prev ? (log.weight_kg - prev.weight_kg).toFixed(1) : null;
                  return (
                    <View key={log.id} style={styles.logRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.logDate}>
                          {new Date(log.logged_at).toLocaleDateString('en-US',
                            { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
                      </View>
                      <View style={styles.logRight}>
                        <Text style={styles.logWeight}>
                          {toDisplay(log.weight_kg, clientUnit)}{ul}
                        </Text>
                        {diff !== null && (
                          <Text style={[styles.logDiff, {
                            color: diff > 0 ? COLORS.error : diff < 0 ? COLORS.success : COLORS.textMuted
                          }]}>
                            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(toDisplay(Math.abs(parseFloat(diff)), clientUnit))}{ul}
                          </Text>
                        )}
                      </View>
                      <View style={styles.logActions}>
                        <TouchableOpacity style={styles.editBtn}
                          onPress={() => {
                            setEditingWeight(log);
                            setWeightInput(String(toDisplay(log.weight_kg, clientUnit)));
                            setWeightNotes(log.notes || '');
                            setShowWeightModal(true);
                          }}>
                          <Text>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.delBtn}
                          onPress={() => deleteWeight(log.id)}>
                          <Text>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
            }
          </View>
        )}

        {/* MACROS TAB */}
        {tab === 'macros' && (
          <View>
            {macroTargets ? (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Current Targets</Text>
                <View style={styles.macroRow}>
                  {[
                    { label: 'Protein', val: macroTargets.protein_g, color: '#FF6B6B' },
                    { label: 'Carbs', val: macroTargets.carbs_g, color: '#4ECDC4' },
                    { label: 'Fats', val: macroTargets.fats_g, color: '#FFE66D' },
                    { label: 'kcal', val: macroTargets.calories, color: COLORS.roseGold },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill,
                      { backgroundColor: m.color + '22', borderColor: m.color }]}>
                      <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}g</Text>
                      <Text style={styles.macroPillLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No macro targets set</Text>
              </View>
            )}
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => setShowTargetModal(true)}>
              <Text style={styles.actionBtnText}>
                {macroTargets ? '✏️ Edit Macro Targets' : '+ Set Macro Targets'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Recent Logs</Text>
            {macroLogs.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No macro logs yet</Text>
                </View>
              : macroLogs.map(log => (
                <View key={log.date} style={styles.macroLogRow}>
                  <Text style={styles.macroLogDate}>{log.date}</Text>
                  <View style={styles.macroLogValues}>
                    <Text style={[styles.macroLogVal, { color: '#FF6B6B' }]}>P:{log.protein_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: '#4ECDC4' }]}>C:{log.carbs_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: '#FFE66D' }]}>F:{log.fats_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: COLORS.roseGold }]}>{log.calories}kcal</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* FEEDBACK TAB */}
        {tab === 'feedback' && (
          <View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => setShowFeedbackModal(true)}>
              <Text style={styles.actionBtnText}>+ Leave Feedback for {client.name}</Text>
            </TouchableOpacity>
            {feedbacks.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No feedback yet</Text>
                </View>
              : feedbacks.map((fb, i) => (
                <View key={i} style={styles.feedbackCard}>
                  <Text style={styles.feedbackDate}>{fb.workout_date}</Text>
                  <Text style={styles.feedbackText}>{fb.feedback}</Text>
                </View>
              ))
            }
          </View>
        )}

        {/* CYCLE TAB */}
        {tab === 'cycle' && (
          <View>
            {!isFemale ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Not applicable</Text>
              </View>
            ) : cycles.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No cycle data</Text>
                <Text style={styles.emptySub}>
                  Client needs to log their period in their Health tab
                </Text>
              </View>
            ) : (
              <View>
                {/* Cycle info */}
                <View style={styles.cycleInfoCard}>
                  <Text style={styles.cycleInfoTitle}>🌸 Cycle Info</Text>
                  <Text style={styles.cycleInfoText}>
                    Last period: {cycles[0].cycle_start_date}
                  </Text>
                  <Text style={styles.cycleInfoText}>
                    Cycle: {cycles[0].cycle_length} days · Period: {cycles[0].period_length} days
                  </Text>
                </View>

                {/* Phase legend */}
                <View style={styles.phaseLegendRow}>
                  {Object.values(CYCLE_PHASES).map(ph => (
                    <View key={ph.name} style={styles.phaseLegendItem}>
                      <View style={[styles.legendDot, { backgroundColor: ph.color }]} />
                      <Text style={styles.legendText}>{ph.emoji} {ph.name.split(' ')[0]}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar */}
                <View style={styles.calendarCard}>
                  <View style={styles.calNav}>
                    <TouchableOpacity onPress={() => setCalendarMonth(m =>
                      new Date(m.getFullYear(), m.getMonth() - 1))}>
                      <Text style={styles.calNavBtn}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.calMonthText}>{monthName}</Text>
                    <TouchableOpacity onPress={() => setCalendarMonth(m =>
                      new Date(m.getFullYear(), m.getMonth() + 1))}>
                      <Text style={styles.calNavBtn}>›</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calDayHeaders}>
                    {DAYS_OF_WEEK.map(d => (
                      <Text key={d} style={styles.calDayHeader}>{d}</Text>
                    ))}
                  </View>
                  <View style={styles.calGrid}>
                    {getCalendarCells().map((cell, i) => {
                      if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                      const isToday = cell.date === todayStr;
                      return (
                        <View key={cell.date} style={styles.calCell}>
                          <View style={[styles.calCellInner, {
                            backgroundColor: cell.phase ? cell.phase.color + '40' : 'transparent',
                            borderColor: isToday ? COLORS.roseGold : cell.phase ? cell.phase.color : COLORS.darkBorder,
                            borderWidth: isToday ? 2 : 1,
                          }]}>
                            <Text style={[styles.calCellDay, {
                              color: isToday ? COLORS.roseGold : COLORS.white
                            }]}>{cell.day}</Text>
                            {cell.phase && <Text style={{ fontSize: 6 }}>{cell.phase.emoji}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Phase cards */}
                {Object.values(CYCLE_PHASES).map(phase => (
                  <View key={phase.name}
                    style={[styles.phaseCard, { borderColor: phase.color }]}>
                    <Text style={[styles.phaseTitle, { color: phase.color }]}>
                      {phase.emoji} {phase.name}
                    </Text>
                    <Text style={styles.phaseRec}>💪 {phase.workoutRecommendations[0]}</Text>
                    <Text style={styles.phaseRec}>🥗 {phase.nutritionTips[0]}</Text>
                    <Text style={styles.phaseRec}>⚖️ {phase.weightNote}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Weight Modal */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingWeight ? '✏️ Edit Weigh-in' : '⚖️ Log Weigh-in'}
            </Text>
            <Text style={styles.modalLabel}>Weight ({ul})</Text>
            <RNTextInput value={weightInput} onChangeText={setWeightInput}
              style={styles.modalInput} placeholder="0"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Notes</Text>
            <RNTextInput value={weightNotes} onChangeText={setWeightNotes}
              style={styles.modalInput} placeholder="Optional notes..."
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => { setShowWeightModal(false); setEditingWeight(null); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveWeight} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Macro Target Modal */}
      <Modal visible={showTargetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🎯 Set Macro Targets</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { key: 'protein', label: 'Protein (g)', color: '#FF6B6B' },
                { key: 'carbs', label: 'Carbs (g)', color: '#4ECDC4' },
                { key: 'fats', label: 'Fats (g)', color: '#FFE66D' },
              ].map(m => (
                <View key={m.key} style={{ flex: 1 }}>
                  <Text style={[styles.modalLabel, { color: m.color }]}>{m.label}</Text>
                  <RNTextInput value={targetInput[m.key]}
                    onChangeText={v => setTargetInput(t => ({ ...t, [m.key]: v }))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
              ))}
            </View>
            <Text style={{ color: COLORS.roseGold, textAlign: 'center', marginBottom: 12 }}>
              Total: {(
                (parseFloat(targetInput.protein) || 0) * 4 +
                (parseFloat(targetInput.carbs) || 0) * 4 +
                (parseFloat(targetInput.fats) || 0) * 9
              ).toFixed(0)} kcal
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowTargetModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveMacroTargets} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
      <Modal visible={showFeedbackModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💬 Workout Feedback</Text>
            <Text style={styles.modalLabel}>Feedback</Text>
            <RNTextInput value={feedbackText} onChangeText={setFeedbackText}
              style={[styles.modalInput, { minHeight: 100, textAlignVertical: 'top' }]}
              placeholder="e.g. Great session! Increase bench next week..."
              placeholderTextColor={COLORS.textMuted} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowFeedbackModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveFeedback} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Send'}</Text>
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
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.darkCard, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  tabScroll: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.xs },
  tabTextActive: { color: COLORS.white },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  actionBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  actionBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  empty: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4, textAlign: 'center' },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  logDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  logNotes: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  logRight: { alignItems: 'flex-end', marginRight: 8 },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.lg },
  logDiff: { fontSize: SIZES.sm, ...FONTS.medium, marginTop: 2 },
  logActions: { flexDirection: 'row', gap: 4 },
  editBtn: { padding: 6, backgroundColor: COLORS.darkCard2, borderRadius: 6 },
  delBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: 6 },
  targetsCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  targetsTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroPill: { flex: 1, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1 },
  macroPillValue: { fontSize: SIZES.md, ...FONTS.bold },
  macroPillLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  macroLogRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  macroLogDate: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom: 6 },
  macroLogValues: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  macroLogVal: { fontSize: SIZES.sm, ...FONTS.semibold },
  feedbackCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid, borderLeftWidth: 3, borderLeftColor: COLORS.roseGold },
  feedbackDate: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom: 4 },
  feedbackText: { color: COLORS.white, fontSize: SIZES.sm, lineHeight: 20 },
  cycleInfoCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  cycleInfoTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 8 },
  cycleInfoText: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom: 4 },
  phaseLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  phaseLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  calendarCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder, maxWidth: 400, alignSelf: 'center', width: '100%' },
  calNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calNavBtn: { color: COLORS.roseGold, fontSize: 24, ...FONTS.bold, paddingHorizontal: 8 },
  calMonthText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  calDayHeaders: { flexDirection: 'row', marginBottom: 6 },
  calDayHeader: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, ...FONTS.semibold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100/7}%`, aspectRatio: 1, padding: 1 },
  calCellInner: { flex: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  calCellDay: { fontSize: 9, ...FONTS.medium },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderLeftWidth: 3 },
  phaseTitle: { ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 6 },
  phaseRec: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});