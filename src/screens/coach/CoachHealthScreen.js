import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function CoachHealthScreen({ route }) {
  const { client } = route.params;
  const { profile } = useAuth();
  const [tab, setTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [targetInput, setTargetInput] = useState({ protein: '', carbs: '', fats: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [wRes, mRes, tRes] = await Promise.all([
      supabase.from('weight_logs').select('*').eq('client_id', client.id).order('logged_at', { ascending: true }),
      supabase.from('macro_logs').select('*').eq('client_id', client.id).order('date', { ascending: false }).limit(14),
      supabase.from('macro_targets').select('*').eq('client_id', client.id).single(),
    ]);
    setWeightLogs(wRes.data || []);
    setMacroLogs(mRes.data || []);
    setMacroTargets(tRes.data || null);
    if (tRes.data) {
      setTargetInput({
        protein: String(tRes.data.protein_g),
        carbs: String(tRes.data.carbs_g),
        fats: String(tRes.data.fats_g),
      });
    }
  }

  async function saveWeight() {
    if (!weightInput.trim()) { Alert.alert('Error', 'Enter weight'); return; }
    setLoading(true);
    await supabase.from('weight_logs').insert({
      client_id: client.id,
      logged_by: profile.id,
      weight_kg: parseFloat(weightInput),
      notes: weightNotes.trim() || null,
    });
    setLoading(false);
    setWeightInput(''); setWeightNotes('');
    setShowWeightModal(false);
    fetchAll();
  }

  async function saveMacroTargets() {
    if (!targetInput.protein || !targetInput.carbs || !targetInput.fats) {
      Alert.alert('Error', 'Fill in all macro targets'); return;
    }
    setLoading(true);
    const calories = (
      parseFloat(targetInput.protein) * 4 +
      parseFloat(targetInput.carbs) * 4 +
      parseFloat(targetInput.fats) * 9
    ).toFixed(0);

    await supabase.from('macro_targets').upsert({
      client_id: client.id,
      protein_g: parseFloat(targetInput.protein),
      carbs_g: parseFloat(targetInput.carbs),
      fats_g: parseFloat(targetInput.fats),
      calories: parseFloat(calories),
      set_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });

    setLoading(false);
    setShowTargetModal(false);
    Alert.alert('✅ Targets Set!',
      `Macro targets updated for ${client.name}.\nThey will see these in their Health tab.`);
    fetchAll();
  }

  function getWeightChange() {
    if (weightLogs.length < 2) return null;
    const first = weightLogs[0].weight_kg;
    const last = weightLogs[weightLogs.length - 1].weight_kg;
    return (last - first).toFixed(1);
  }

  const weightChange = getWeightChange();

  return (
    <View style={styles.container}>
      {/* Client banner */}
      <View style={styles.clientBanner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Health & Nutrition Overview</Text>
        </View>
      </View>

      {/* Tabs */}
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
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0
                    ? `${weightLogs[weightLogs.length - 1].weight_kg}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Current</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0 ? `${weightLogs[0].weight_kg}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Starting</Text>
              </View>
              <View style={[styles.statCard, {
                borderColor: weightChange > 0 ? COLORS.error
                  : weightChange < 0 ? COLORS.success : COLORS.darkBorder
              }]}>
                <Text style={[styles.statValue, {
                  color: weightChange > 0 ? COLORS.error
                    : weightChange < 0 ? COLORS.success : COLORS.textMuted
                }]}>
                  {weightChange !== null
                    ? `${weightChange > 0 ? '+' : ''}${weightChange}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Total Change</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowWeightModal(true)}>
              <Text style={styles.actionBtnText}>+ Log Weigh-in for {client.name}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Weigh-in History</Text>
            {weightLogs.length === 0
              ? <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No weigh-ins yet</Text>
                </View>
              : [...weightLogs].reverse().map((log, i) => {
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
                          <Text style={[styles.logDiff, {
                            color: diff > 0 ? COLORS.error
                              : diff < 0 ? COLORS.success : COLORS.textMuted
                          }]}>
                            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)}kg
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
            }
          </View>
        )}

        {/* ── MACROS TAB ── */}
        {tab === 'macros' && (
          <View>
            {/* Current targets */}
            {macroTargets ? (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Current Macro Targets</Text>
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
                <Text style={styles.noTargetsText}>No targets set yet</Text>
              </View>
            )}

            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTargetModal(true)}>
              <Text style={styles.actionBtnText}>
                {macroTargets ? '✏️ Edit Macro Targets' : '+ Set Macro Targets'}
              </Text>
            </TouchableOpacity>

            {/* Recent macro logs */}
            <Text style={styles.sectionTitle}>Recent Macro Logs</Text>
            {macroLogs.length === 0
              ? <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No macro logs yet</Text>
                  <Text style={styles.emptySub}>Client hasn't logged any macros</Text>
                </View>
              : macroLogs.map((log, i) => {
                  const ptPct = macroTargets?.protein_g > 0
                    ? Math.round((log.protein_g / macroTargets.protein_g) * 100) : null;
                  return (
                    <View key={log.id} style={styles.macroLogRow}>
                      <Text style={styles.macroLogDate}>{log.date}</Text>
                      <View style={styles.macroLogValues}>
                        <Text style={[styles.macroLogVal, { color: '#FF6B6B' }]}>P {log.protein_g}g</Text>
                        <Text style={[styles.macroLogVal, { color: '#4ECDC4' }]}>C {log.carbs_g}g</Text>
                        <Text style={[styles.macroLogVal, { color: '#FFE66D' }]}>F {log.fats_g}g</Text>
                        <Text style={[styles.macroLogVal, { color: COLORS.roseGold }]}>{log.calories} kcal</Text>
                      </View>
                      {ptPct !== null && (
                        <Text style={[styles.macroCompliance, {
                          color: ptPct >= 85 ? COLORS.success
                            : ptPct >= 60 ? COLORS.warning : COLORS.error
                        }]}>
                          {ptPct >= 85 ? '✅' : ptPct >= 60 ? '⚠️' : '❌'} {ptPct}% of target
                        </Text>
                      )}
                    </View>
                  );
                })
            }
          </View>
        )}

      </ScrollView>

      {/* Weight Modal */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚖️ Log Weigh-in</Text>
            <Text style={styles.modalSubtitle}>for {client.name}</Text>
            <Text style={styles.modalLabel}>Weight (kg)</Text>
            <RNTextInput value={weightInput} onChangeText={setWeightInput}
              style={styles.modalInput} placeholder="e.g. 78.5"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Notes</Text>
            <RNTextInput value={weightNotes} onChangeText={setWeightNotes}
              style={styles.modalInput} placeholder="e.g. Check-in week 4"
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowWeightModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveWeight} disabled={loading}>
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
            <Text style={styles.modalSubtitle}>for {client.name}</Text>
            <View style={styles.macroInputRow}>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#FF6B6B' }]}>Protein (g)</Text>
                <RNTextInput value={targetInput.protein}
                  onChangeText={v => setTargetInput(t => ({ ...t, protein: v }))}
                  style={styles.modalInput} placeholder="150"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#4ECDC4' }]}>Carbs (g)</Text>
                <RNTextInput value={targetInput.carbs}
                  onChangeText={v => setTargetInput(t => ({ ...t, carbs: v }))}
                  style={styles.modalInput} placeholder="200"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.macroInputGroup}>
                <Text style={[styles.modalLabel, { color: '#FFE66D' }]}>Fats (g)</Text>
                <RNTextInput value={targetInput.fats}
                  onChangeText={v => setTargetInput(t => ({ ...t, fats: v }))}
                  style={styles.modalInput} placeholder="60"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <Text style={styles.autoCalories}>
              Total calories: {(
                (parseFloat(targetInput.protein) || 0) * 4 +
                (parseFloat(targetInput.carbs) || 0) * 4 +
                (parseFloat(targetInput.fats) || 0) * 9
              ).toFixed(0)} kcal
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTargetModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveMacroTargets} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save Targets'}</Text>
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
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingTop: 20, backgroundColor: COLORS.darkCard, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8 },
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
  actionBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 20, shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  actionBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
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
  noTargetsCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, alignItems: 'center' },
  noTargetsText: { color: COLORS.textSecondary, ...FONTS.semibold },
  macroLogRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  macroLogDate: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom: 6 },
  macroLogValues: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  macroLogVal: { fontSize: SIZES.sm, ...FONTS.semibold },
  macroCompliance: { fontSize: SIZES.xs, marginTop: 6 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md, marginBottom: 16 },
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