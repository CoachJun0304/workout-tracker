import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput, Dimensions
} from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';

const W = Dimensions.get('window').width;

const MUSCLE_ORDER = ['Chest','Back','Quads','Hamstrings','Glutes',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Calves','Core','Full Body'];

const MUSCLE_COLORS = {
  'Chest':'#C0392B','Back':'#2980B9','Quads':'#27AE60','Hamstrings':'#16A085',
  'Glutes':'#8E44AD','Calves':'#2C3E50','Front Delts':'#E67E22','Side Delts':'#D35400',
  'Rear Delts':'#CA6F1E','Biceps':'#1ABC9C','Triceps':'#2ECC71','Core':'#F39C12',
  'Full Body':'#7F77DD',
};

export default function ProgressScreen({ route }) {
  const clientParam = route?.params?.client;
  const { profile, unit } = useAuth();
  const clientId = clientParam?.id || profile?.id;
  const ul = unitLabel(unit);

  const [logs, setLogs] = useState([]);
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [editForm, setEditForm] = useState({ weight:'', reps:'' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchLogs(); }, [clientId]);

  async function fetchLogs() {
    const { data } = await supabase
      .from('workout_logs').select('*')
      .eq('client_id', clientId)
      .eq('set_type', 'working')
      .order('logged_at', { ascending: true });
    setLogs(data || []);
  }

  // Group by muscle then by exercise
  const grouped = () => {
    const g = {};
    logs.forEach(log => {
      const muscle = log.muscle_group || 'Other';
      if (!g[muscle]) g[muscle] = {};
      if (!g[muscle][log.exercise_name]) g[muscle][log.exercise_name] = [];
      g[muscle][log.exercise_name].push(log);
    });
    return g;
  };

  const muscleGroups = Object.keys(grouped()).sort((a,b) => {
    const ai = MUSCLE_ORDER.indexOf(a);
    const bi = MUSCLE_ORDER.indexOf(b);
    return (ai===-1?99:ai) - (bi===-1?99:bi);
  });

  function getExercises(muscle) {
    return Object.keys(grouped()[muscle] || {});
  }

  function getChartData(muscle, exercise) {
    const exLogs = (grouped()[muscle]?.[exercise] || []).filter(l => l.weight_kg);
    if (exLogs.length < 2) return null;

    const byDate = {};
    exLogs.forEach(l => {
      const date = l.logged_at.split('T')[0];
      if (!byDate[date] || l.weight_kg > byDate[date].weight) {
        byDate[date] = {
          weight: l.weight_kg,
          e1rm: estimated1RM(l.weight_kg, l.reps),
        };
      }
    });

    const dates = Object.keys(byDate).slice(-10);
    const weights = dates.map(d => toDisplay(byDate[d].weight, unit));
    const e1rms = dates.map(d => toDisplay(byDate[d].e1rm || byDate[d].weight, unit));
    const allTimeBest = Math.max(...weights);

    return {
      labels: dates.map(d => d.slice(5)),
      datasets: [
        { data: weights, color: () => COLORS.roseGold, strokeWidth: 2 },
        { data: e1rms, color: () => '#4ECDC4', strokeWidth: 1 },
        { data: dates.map(() => allTimeBest), color: () => '#FFE66D44', strokeWidth: 1 },
      ],
      legend: [`Max Weight (${ul})`, 'Est. 1RM', 'All-Time Best'],
    };
  }

  function getPR(muscle, exercise) {
    const exLogs = (grouped()[muscle]?.[exercise] || []).filter(l => l.weight_kg);
    if (!exLogs.length) return null;
    const best = exLogs.reduce((max, l) =>
      l.weight_kg > (max?.weight_kg||0) ? l : max, null);
    return best;
  }

  async function handleEditLog() {
    if (!editingLog) return;
    setLoading(true);
    const { error } = await supabase.from('workout_logs').update({
      weight_kg: parseFloat(editForm.weight) || editingLog.weight_kg,
      reps: parseInt(editForm.reps) || editingLog.reps,
    }).eq('id', editingLog.id);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowEditModal(false);
    fetchLogs();
  }

  async function handleDeleteLog(id) {
    Alert.alert('Delete Entry', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('workout_logs').delete().eq('id', id);
        fetchLogs();
      }}
    ]);
  }

  const chartConfig = {
    backgroundColor: COLORS.darkCard,
    backgroundGradientFrom: COLORS.darkCard,
    backgroundGradientTo: COLORS.darkCard2,
    decimalPlaces: 1,
    color: (o=1) => `rgba(183,110,121,${o})`,
    labelColor: () => COLORS.textMuted,
    propsForDots: { r:'4', strokeWidth:'2', stroke: COLORS.roseGold },
    propsForBackgroundLines: { stroke: COLORS.darkBorder, strokeDasharray: '' },
  };

  const muscleGrouped = grouped();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {clientParam ? `${clientParam.name}'s Progress` : 'My Progress'}
      </Text>

      {logs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyText}>No workout data yet</Text>
          <Text style={styles.emptySub}>Start logging workouts to see progress</Text>
        </View>
      ) : (
        <View>
          {/* Muscle group selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.muscleRow} contentContainerStyle={{ gap:8 }}>
            <TouchableOpacity
              style={[styles.muscleChip, !selectedMuscle && styles.muscleChipActive]}
              onPress={() => { setSelectedMuscle(null); setSelectedExercise(null); }}>
              <Text style={[styles.muscleChipText, !selectedMuscle && styles.muscleChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {muscleGroups.map(m => (
              <TouchableOpacity key={m}
                style={[styles.muscleChip,
                  selectedMuscle===m && { backgroundColor: MUSCLE_COLORS[m]+'33', borderColor: MUSCLE_COLORS[m] }]}
                onPress={() => { setSelectedMuscle(m); setSelectedExercise(null); }}>
                <Text style={[styles.muscleChipText,
                  selectedMuscle===m && { color: MUSCLE_COLORS[m] }]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Content */}
          {(selectedMuscle ? [selectedMuscle] : muscleGroups).map(muscle => (
            <View key={muscle}>
              <View style={[styles.muscleHeader,
                { borderLeftColor: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
                <Text style={[styles.muscleTitle,
                  { color: MUSCLE_COLORS[muscle] || COLORS.roseGold }]}>
                  {muscle.toUpperCase()}
                </Text>
              </View>

              {/* Exercise chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={styles.exRow} contentContainerStyle={{ gap:8 }}>
                {getExercises(muscle).map(ex => (
                  <TouchableOpacity key={ex}
                    style={[styles.exChip, selectedExercise===ex && styles.exChipActive]}
                    onPress={() => setSelectedExercise(selectedExercise===ex ? null : ex)}>
                    <Text style={[styles.exChipText, selectedExercise===ex && styles.exChipTextActive]}>
                      {ex}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Per exercise detail */}
              {getExercises(muscle)
                .filter(ex => !selectedExercise || selectedExercise===ex)
                .map(exercise => {
                  const chartData = getChartData(muscle, exercise);
                  const pr = getPR(muscle, exercise);
                  const exLogs = (muscleGrouped[muscle]?.[exercise] || []);

                  return (
                    <View key={exercise} style={styles.exerciseSection}>
                      <View style={styles.exerciseSectionHeader}>
                        <Text style={styles.exerciseSectionName}>{exercise}</Text>
                        {pr && (
                          <View style={styles.prBadge}>
                            <Text style={styles.prBadgeText}>
                              🏆 PR: {toDisplay(pr.weight_kg, unit)}{ul} × {pr.reps}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Chart */}
                      {chartData ? (
                        <View style={styles.chartCard}>
                          <View style={styles.chartLegend}>
                            <View style={styles.legendItem}>
                              <View style={[styles.legendDot, { backgroundColor: COLORS.roseGold }]} />
                              <Text style={styles.legendText}>Weight</Text>
                            </View>
                            <View style={styles.legendItem}>
                              <View style={[styles.legendDot, { backgroundColor:'#4ECDC4' }]} />
                              <Text style={styles.legendText}>Est. 1RM</Text>
                            </View>
                            <View style={styles.legendItem}>
                              <View style={[styles.legendDot, { backgroundColor:'#FFE66D' }]} />
                              <Text style={styles.legendText}>Best</Text>
                            </View>
                          </View>
                          <LineChart
                            data={chartData}
                            width={W - 64}
                            height={180}
                            chartConfig={chartConfig}
                            bezier
                            style={{ borderRadius:8 }}
                            withShadow={false}
                          />
                        </View>
                      ) : (
                        <View style={styles.noChartCard}>
                          <Text style={styles.noChartText}>
                            Need at least 2 sessions to show trend
                          </Text>
                        </View>
                      )}

                      {/* Log entries */}
                      {[...exLogs].reverse().slice(0,10).map((log, i) => (
                        <View key={log.id || i} style={styles.logRow}>
                          <View style={{ flex:1 }}>
                            <Text style={styles.logSet}>Set {log.set_number}</Text>
                            <Text style={styles.logDate}>
                              {new Date(log.logged_at).toLocaleDateString('en-US',
                                { month:'short', day:'numeric', year:'numeric' })}
                              {' · '}{log.day}
                            </Text>
                          </View>
                          <View style={styles.logStats}>
                            <Text style={styles.logWeight}>
                              {toDisplay(log.weight_kg, unit)}{ul}
                            </Text>
                            <Text style={styles.logReps}>× {log.reps}</Text>
                            {log.is_personal_best && <Text>🏆</Text>}
                          </View>
                          <View style={styles.logActions}>
                            <TouchableOpacity style={styles.editBtn}
                              onPress={() => {
                                setEditingLog(log);
                                setEditForm({
                                  weight: String(toDisplay(log.weight_kg, unit)),
                                  reps: String(log.reps)
                                });
                                setShowEditModal(true);
                              }}>
                              <Text style={{ fontSize:14 }}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.delBtn}
                              onPress={() => handleDeleteLog(log.id)}>
                              <Text style={{ fontSize:14 }}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              }
            </View>
          ))}
        </View>
      )}

      {/* Edit modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✏️ Edit Log Entry</Text>
            <Text style={styles.modalSub}>{editingLog?.exercise_name}</Text>
            <Text style={styles.modalLabel}>Weight ({ul})</Text>
            <RNTextInput value={editForm.weight}
              onChangeText={v => setEditForm(f=>({...f, weight:v}))}
              style={styles.modalInput} placeholder="0"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Reps</Text>
            <RNTextInput value={editForm.reps}
              onChangeText={v => setEditForm(f=>({...f, reps:v}))}
              style={styles.modalInput} placeholder="0"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={handleEditLog} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading?'...':'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  content: { padding:16, paddingBottom:40, paddingTop:20 },
  title: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom:16 },
  empty: { alignItems:'center', paddingVertical:60 },
  emptyEmoji: { fontSize:48, marginBottom:12 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop:4 },
  muscleRow: { marginBottom:16 },
  muscleChip: { paddingHorizontal:14, paddingVertical:8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth:1, borderColor: COLORS.darkBorder },
  muscleChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  muscleChipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  muscleChipTextActive: { color: COLORS.white },
  muscleHeader: { borderLeftWidth:3, paddingLeft:12, marginTop:20, marginBottom:10 },
  muscleTitle: { fontSize: SIZES.sm, ...FONTS.bold, letterSpacing:1 },
  exRow: { marginBottom:10 },
  exChip: { paddingHorizontal:12, paddingVertical:6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, borderWidth:1, borderColor: COLORS.darkBorder },
  exChipActive: { backgroundColor: COLORS.roseGoldFaint, borderColor: COLORS.roseGold },
  exChipText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  exChipTextActive: { color: COLORS.roseGold, ...FONTS.semibold },
  exerciseSection: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:14, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  exerciseSectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 },
  exerciseSectionName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, flex:1 },
  prBadge: { backgroundColor: '#FFE66D22', borderRadius: RADIUS.full, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:'#FFE66D' },
  prBadgeText: { color:'#FFE66D', fontSize: SIZES.xs, ...FONTS.semibold },
  chartCard: { marginBottom:10 },
  chartLegend: { flexDirection:'row', gap:12, marginBottom:8 },
  legendItem: { flexDirection:'row', alignItems:'center', gap:4 },
  legendDot: { width:8, height:8, borderRadius:4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  noChartCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, alignItems:'center', marginBottom:10 },
  noChartText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  logRow: { flexDirection:'row', alignItems:'center', paddingVertical:8, borderTopWidth:0.5, borderTopColor: COLORS.darkBorder, gap:8 },
  logSet: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  logDate: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:1 },
  logStats: { flexDirection:'row', alignItems:'center', gap:6 },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md },
  logReps: { color: COLORS.textMuted, fontSize: SIZES.sm },
  logActions: { flexDirection:'row', gap:4 },
  editBtn: { padding:6, backgroundColor: COLORS.darkCard2, borderRadius:6 },
  delBtn: { padding:6, backgroundColor:'#FF4B4B22', borderRadius:6 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:4 },
  modalSub: { color: COLORS.roseGold, ...FONTS.medium, fontSize: SIZES.md, marginBottom:16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:8 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  modalBtns: { flexDirection:'row', gap:12, marginTop:8 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});