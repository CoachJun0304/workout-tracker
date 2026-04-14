import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput, Dimensions
} from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const W = Dimensions.get('window').width;
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function HealthScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('weight'); // 'weight' | 'macros'
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [macroInput, setMacroInput] = useState({ protein: '', carbs: '', fats: '', notes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) { fetchAll(); }
  }, [profile]);

  async function fetchAll() {
    if (!profile) return;
    const clientId = profile.id;

    const [wRes, mRes, tRes] = await Promise.all([
      supabase.from('weight_logs').select('*')
        .eq('client_id', clientId).order('logged_at', { ascending: true }),
      supabase.from('macro_logs').select('*')
        .eq('client_id', clientId).order('date', { ascending: true }),
      supabase.from('macro_targets').select('*')
        .eq('client_id', clientId).single(),
    ]);

    setWeightLogs(wRes.data || []);
    setMacroLogs(mRes.data || []);
    setMacroTargets(tRes.data || null);
  }

  // ── WEIGHT HELPERS ─────────────────────────────────────

  function getWeightChange() {
    if (weightLogs.length < 2) return null;
    const first = weightLogs[0].weight_kg;
    const last = weightLogs[weightLogs.length - 1].weight_kg;
    return (last - first).toFixed(1);
  }

  function getRecentWeightChange() {
    if (weightLogs.length < 2) return null;
    const prev = weightLogs[weightLogs.length - 2].weight_kg;
    const last = weightLogs[weightLogs.length - 1].weight_kg;
    return (last - prev).toFixed(1);
  }

  function getWeightChartData() {
    const recent = weightLogs.slice(-10);
    if (recent.length < 2) return null;
    return {
      labels: recent.map(w => w.logged_at.split('T')[0].slice(5)),
      datasets: [{ data: recent.map(w => w.weight_kg), color: () => COLORS.roseGold, strokeWidth: 2 }],
    };
  }

  async function saveWeight() {
    if (!weightInput.trim()) { Alert.alert('Error', 'Enter your weight'); return; }
    setLoading(true);
    const { error } = await supabase.from('weight_logs').insert({
      client_id: profile.id,
      logged_by: profile.id,
      weight_kg: parseFloat(weightInput),
      notes: weightNotes.trim() || null,
    });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setWeightInput('');
    setWeightNotes('');
    setShowWeightModal(false);
    fetchAll();
  }

  // ── MACRO HELPERS ──────────────────────────────────────

  function getMacroColor(log) {
    if (!macroTargets) return COLORS.darkCard;
    const ptRatio = macroTargets.protein_g > 0 ? log.protein_g / macroTargets.protein_g : 1;
    const cbRatio = macroTargets.carbs_g > 0 ? log.carbs_g / macroTargets.carbs_g : 1;
    const ftRatio = macroTargets.fats_g > 0 ? log.fats_g / macroTargets.fats_g : 1;
    const avg = (ptRatio + cbRatio + ftRatio) / 3;
    if (avg >= 0.85 && avg <= 1.15) return '#00C89622'; // green — on target
    if (avg >= 0.6) return '#FFB34722';  // yellow — under
    return '#FF4B4B22'; // red — way under
  }

  function getMacroBorderColor(log) {
    if (!macroTargets) return COLORS.darkBorder;
    const ptRatio = macroTargets.protein_g > 0 ? log.protein_g / macroTargets.protein_g : 1;
    const cbRatio = macroTargets.carbs_g > 0 ? log.carbs_g / macroTargets.carbs_g : 1;
    const ftRatio = macroTargets.fats_g > 0 ? log.fats_g / macroTargets.fats_g : 1;
    const avg = (ptRatio + cbRatio + ftRatio) / 3;
    if (avg >= 0.85 && avg <= 1.15) return '#00C896';
    if (avg >= 0.6) return '#FFB347';
    return '#FF4B4B';
  }

  function getCalendarData() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const log = macroLogs.find(l => l.date === dateStr);
      cells.push({ day: d, date: dateStr, log });
    }
    return cells;
  }

  function getWeeklyMacroSummary() {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const weekLogs = macroLogs.filter(l => new Date(l.date) >= weekAgo);
    if (weekLogs.length === 0) return null;
    return {
      days: weekLogs.length,
      protein: (weekLogs.reduce((s, l) => s + l.protein_g, 0) / weekLogs.length).toFixed(0),
      carbs: (weekLogs.reduce((s, l) => s + l.carbs_g, 0) / weekLogs.length).toFixed(0),
      fats: (weekLogs.reduce((s, l) => s + l.fats_g, 0) / weekLogs.length).toFixed(0),
      calories: (weekLogs.reduce((s, l) => s + l.calories, 0) / weekLogs.length).toFixed(0),
    };
  }

  async function saveMacros() {
    if (!selectedDate) return;
    setLoading(true);
    const calories = (
      (parseFloat(macroInput.protein) || 0) * 4 +
      (parseFloat(macroInput.carbs) || 0) * 4 +
      (parseFloat(macroInput.fats) || 0) * 9
    ).toFixed(0);

    const { error } = await supabase.from('macro_logs').upsert({
      client_id: profile.id,
      logged_by: profile.id,
      date: selectedDate,
      protein_g: parseFloat(macroInput.protein) || 0,
      carbs_g: parseFloat(macroInput.carbs) || 0,
      fats_g: parseFloat(macroInput.fats) || 0,
      calories: parseFloat(calories),
      notes: macroInput.notes || null,
    }, { onConflict: 'client_id,date' });

    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowMacroModal(false);
    setMacroInput({ protein: '', carbs: '', fats: '', notes: '' });
    fetchAll();
  }

  function openMacroDay(date, existingLog) {
    setSelectedDate(date);
    if (existingLog) {
      setMacroInput({
        protein: String(existingLog.protein_g),
        carbs: String(existingLog.carbs_g),
        fats: String(existingLog.fats_g),
        notes: existingLog.notes || '',
      });
    } else {
      setMacroInput({ protein: '', carbs: '', fats: '', notes: '' });
    }
    setShowMacroModal(true);
  }

  const chartConfig = {
    backgroundColor: COLORS.darkCard,
    backgroundGradientFrom: COLORS.darkCard,
    backgroundGradientTo: COLORS.darkCard2,
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(183,110,121,${opacity})`,
    labelColor: () => COLORS.textMuted,
    propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.roseGold },
  };

  const weightChange = getWeightChange();
  const recentChange = getRecentWeightChange();
  const weightChartData = getWeightChartData();
  const calendarCells = getCalendarData();
  const weekSummary = getWeeklyMacroSummary();
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Health & Nutrition</Text>
        <Text style={styles.headerSub}>{profile?.name}</Text>
      </View>

      {/* Tab row */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'weight' && styles.tabBtnActive]}
          onPress={() => setTab('weight')}>
          <Text style={[styles.tabText, tab === 'weight' && styles.tabTextActive]}>⚖️ Weight</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'macros' && styles.tabBtnActive]}
          onPress={() => setTab('macros')}>
          <Text style={[styles.tabText, tab === 'macros' && styles.tabTextActive]}>🥗 Macros</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── WEIGHT TAB ── */}
        {tab === 'weight' && (
          <View>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0 ? `${weightLogs[weightLogs.length-1].weight_kg}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Current Weight</Text>
              </View>
              <View style={[styles.statCard,
                { borderColor: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.darkBorder }]}>
                <Text style={[styles.statValue,
                  { color: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.textMuted }]}>
                  {weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Total Change</Text>
              </View>
              <View style={[styles.statCard,
                { borderColor: recentChange > 0 ? COLORS.error : recentChange < 0 ? COLORS.success : COLORS.darkBorder }]}>
                <Text style={[styles.statValue,
                  { color: recentChange > 0 ? COLORS.error : recentChange < 0 ? COLORS.success : COLORS.textMuted }]}>
                  {recentChange !== null ? `${recentChange > 0 ? '+' : ''}${recentChange}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Last Change</Text>
              </View>
            </View>

            {/* Chart */}
            {weightChartData ? (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Weight Trend</Text>
                <LineChart
                  data={weightChartData}
                  width={W - 48}
                  height={180}
                  chartConfig={chartConfig}
                  bezier
                  style={{ borderRadius: 8 }}
                />
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>⚖️</Text>
                <Text style={styles.emptyText}>No weight logs yet</Text>
                <Text style={styles.emptySub}>Log your first weigh-in below</Text>
              </View>
            )}

            {/* Log button */}
            <TouchableOpacity style={styles.logBtn} onPress={() => setShowWeightModal(true)}>
              <Text style={styles.logBtnText}>+ Log Weight</Text>
            </TouchableOpacity>

            {/* History */}
            {weightLogs.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>History</Text>
                {[...weightLogs].reverse().slice(0, 10).map((log, i) => {
                  const prev = weightLogs[weightLogs.length - 2 - i];
                  const diff = prev ? (log.weight_kg - prev.weight_kg).toFixed(1) : null;
                  return (
                    <View key={log.id} style={styles.logRow}>
                      <View>
                        <Text style={styles.logDate}>
                          {new Date(log.logged_at).toLocaleDateString('en-US',
                            { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                      </View>
                      <View style={styles.logRight}>
                        <Text style={styles.logWeight}>{log.weight_kg}kg</Text>
                        {diff !== null && (
                          <Text style={[styles.logDiff,
                            { color: diff > 0 ? COLORS.error : diff < 0 ? COLORS.success : COLORS.textMuted }]}>
                            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)}kg
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── MACROS TAB ── */}
        {tab === 'macros' && (
          <View>
            {/* Targets */}
            {macroTargets ? (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Daily Targets (set by coach)</Text>
                <View style={styles.macroRow}>
                  <View style={[styles.macroPill, { backgroundColor: '#FF6B6B22', borderColor: '#FF6B6B' }]}>
                    <Text style={[styles.macroPillValue, { color: '#FF6B6B' }]}>{macroTargets.protein_g}g</Text>
                    <Text style={styles.macroPillLabel}>Protein</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: '#4ECDC422', borderColor: '#4ECDC4' }]}>
                    <Text style={[styles.macroPillValue, { color: '#4ECDC4' }]}>{macroTargets.carbs_g}g</Text>
                    <Text style={styles.macroPillLabel}>Carbs</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: '#FFE66D22', borderColor: '#FFE66D' }]}>
                    <Text style={[styles.macroPillValue, { color: '#FFE66D' }]}>{macroTargets.fats_g}g</Text>
                    <Text style={styles.macroPillLabel}>Fats</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: COLORS.roseGoldFaint, borderColor: COLORS.roseGold }]}>
                    <Text style={[styles.macroPillValue, { color: COLORS.roseGold }]}>{macroTargets.calories}</Text>
                    <Text style={styles.macroPillLabel}>kcal</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.noTargetsCard}>
                <Text style={styles.noTargetsText}>⚠️ No macro targets set yet</Text>
                <Text style={styles.noTargetsSub}>Ask your coach to set your targets</Text>
              </View>
            )}

            {/* Color legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#00C896' }]} />
                <Text style={styles.legendText}>On target (85-115%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFB347' }]} />
                <Text style={styles.legendText}>Under (60-84%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF4B4B' }]} />
                <Text style={styles.legendText}>Way under (&lt;60%)</Text>
              </View>
            </View>

            {/* Calendar */}
            <View style={styles.calendarCard}>
              <View style={styles.calendarNav}>
                <TouchableOpacity onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}>
                  <Text style={styles.calNavBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonthText}>{monthName}</Text>
                <TouchableOpacity onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}>
                  <Text style={styles.calNavBtn}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day headers */}
              <View style={styles.calDayHeaders}>
                {DAYS_OF_WEEK.map(d => (
                  <Text key={d} style={styles.calDayHeader}>{d}</Text>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.calGrid}>
                {calendarCells.map((cell, i) => {
                  if (!cell) return <View key={`empty-${i}`} style={styles.calCell} />;
                  const bgColor = cell.log ? getMacroColor(cell.log) : 'transparent';
                  const borderColor = cell.log ? getMacroBorderColor(cell.log) : COLORS.darkBorder;
                  const isToday = cell.date === new Date().toISOString().split('T')[0];
                  return (
                    <TouchableOpacity key={cell.date} style={styles.calCell}
                      onPress={() => openMacroDay(cell.date, cell.log)}>
                      <View style={[styles.calCellInner,
                        { backgroundColor: bgColor, borderColor: isToday ? COLORS.roseGold : borderColor },
                        isToday && { borderWidth: 2 }]}>
                        <Text style={[styles.calCellDay,
                          { color: isToday ? COLORS.roseGold : COLORS.white }]}>
                          {cell.day}
                        </Text>
                        {cell.log && <View style={[styles.calDot, { backgroundColor: borderColor }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Weekly summary */}
            {weekSummary && (
              <View style={styles.weeklySummaryCard}>
                <Text style={styles.weeklySummaryTitle}>
                  📅 Weekly Average ({weekSummary.days} days logged)
                </Text>
                <View style={styles.weeklyRow}>
                  <View style={styles.weeklyItem}>
                    <Text style={[styles.weeklyValue, { color: '#FF6B6B' }]}>{weekSummary.protein}g</Text>
                    <Text style={styles.weeklyLabel}>Protein</Text>
                    {macroTargets && (
                      <Text style={styles.weeklyPercent}>
                        {Math.round((weekSummary.protein / macroTargets.protein_g) * 100)}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.weeklyItem}>
                    <Text style={[styles.weeklyValue, { color: '#4ECDC4' }]}>{weekSummary.carbs}g</Text>
                    <Text style={styles.weeklyLabel}>Carbs</Text>
                    {macroTargets && (
                      <Text style={styles.weeklyPercent}>
                        {Math.round((weekSummary.carbs / macroTargets.carbs_g) * 100)}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.weeklyItem}>
                    <Text style={[styles.weeklyValue, { color: '#FFE66D' }]}>{weekSummary.fats}g</Text>
                    <Text style={styles.weeklyLabel}>Fats</Text>
                    {macroTargets && (
                      <Text style={styles.weeklyPercent}>
                        {Math.round((weekSummary.fats / macroTargets.fats_g) * 100)}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.weeklyItem}>
                    <Text style={[styles.weeklyValue, { color: COLORS.roseGold }]}>{weekSummary.calories}</Text>
                    <Text style={styles.weeklyLabel}>kcal</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Log today button */}
            <TouchableOpacity style={styles.logBtn}
              onPress={() => openMacroDay(new Date().toISOString().split('T')[0],
                macroLogs.find(l => l.date === new Date().toISOString().split('T')[0]))}>
              <Text style={styles.logBtnText}>+ Log Today's Macros</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Weight Modal */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚖️ Log Weight</Text>
            <Text style={styles.modalLabel}>Weight (kg)</Text>
            <RNTextInput
              value={weightInput}
              onChangeText={setWeightInput}
              style={styles.modalInput}
              placeholder="e.g. 78.5"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
            />
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <RNTextInput
              value={weightNotes}
              onChangeText={setWeightNotes}
              style={styles.modalInput}
              placeholder="e.g. Morning, after workout..."
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowWeightModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveWeight} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Macro Modal */}
      <Modal visible={showMacroModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🥗 Log Macros</Text>
            <Text style={styles.modalDate}>{selectedDate}</Text>
            {macroTargets && (
              <Text style={styles.modalTargetHint}>
                Targets: P {macroTargets.protein_g}g · C {macroTargets.carbs_g}g · F {macroTargets.fats_g}g
              </Text>
            )}
            <View style={styles.macroInputRow}>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#FF6B6B' }]}>Protein (g)</Text>
                <RNTextInput value={macroInput.protein}
                  onChangeText={v => setMacroInput(m => ({ ...m, protein: v }))}
                  style={styles.modalInput} placeholder="0"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#4ECDC4' }]}>Carbs (g)</Text>
                <RNTextInput value={macroInput.carbs}
                  onChangeText={v => setMacroInput(m => ({ ...m, carbs: v }))}
                  style={styles.modalInput} placeholder="0"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#FFE66D' }]}>Fats (g)</Text>
                <RNTextInput value={macroInput.fats}
                  onChangeText={v => setMacroInput(m => ({ ...m, fats: v }))}
                  style={styles.modalInput} placeholder="0"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <Text style={styles.autoCalories}>
              Auto calories: {(
                (parseFloat(macroInput.protein) || 0) * 4 +
                (parseFloat(macroInput.carbs) || 0) * 4 +
                (parseFloat(macroInput.fats) || 0) * 9
              ).toFixed(0)} kcal
            </Text>
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <RNTextInput value={macroInput.notes}
              onChangeText={v => setMacroInput(m => ({ ...m, notes: v }))}
              style={styles.modalInput} placeholder="e.g. Cheat meal day"
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowMacroModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveMacros} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? 'Saving...' : 'Save'}</Text>
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
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white },
  headerSub: { fontSize: SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  tabTextActive: { color: COLORS.white },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  statValue: { fontSize: SIZES.lg, ...FONTS.bold, color: COLORS.roseGold },
  statLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  chartCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  chartTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  logBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 20, shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  logBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  logDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  logNotes: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  logRight: { alignItems: 'flex-end' },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.lg },
  logDiff: { fontSize: SIZES.sm, ...FONTS.medium, marginTop: 2 },
  targetsCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  targetsTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroPill: { flex: 1, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1 },
  macroPillValue: { fontSize: SIZES.lg, ...FONTS.bold },
  macroPillLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  noTargetsCard: { backgroundColor: '#FFB34722', borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FFB347', alignItems: 'center' },
  noTargetsText: { color: '#FFB347', ...FONTS.semibold, fontSize: SIZES.md },
  noTargetsSub: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  calendarCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  calendarNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calNavBtn: { color: COLORS.roseGold, fontSize: 24, ...FONTS.bold, paddingHorizontal: 8 },
  calMonthText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  calDayHeaders: { flexDirection: 'row', marginBottom: 6 },
  calDayHeader: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 10, ...FONTS.semibold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100/7}%`, aspectRatio: 1, padding: 2 },
  calCellInner: { flex: 1, borderRadius: 6, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  calCellDay: { fontSize: 11, ...FONTS.medium },
  calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  weeklySummaryCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  weeklySummaryTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 14 },
  weeklyRow: { flexDirection: 'row', justifyContent: 'space-around' },
  weeklyItem: { alignItems: 'center' },
  weeklyValue: { fontSize: SIZES.xl, ...FONTS.bold },
  weeklyLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  weeklyPercent: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 16 },
  modalDate: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md, marginBottom: 4 },
  modalTargetHint: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 12 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder2, marginBottom: 8 },
  macroInputRow: { flexDirection: 'row', gap: 8 },
  macroInputGroup: { flex: 1 },
  autoCalories: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold, marginBottom: 12, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});