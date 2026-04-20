import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput, Dimensions
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, toKg, unitLabel } from '../../utils/unitUtils';
import { getPhaseForDate, CYCLE_PHASES } from '../../data/cycleData';

const W = Dimensions.get('window').width;
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function LogWorkoutScreen({ route, navigation }) {
  const { client } = route.params || {};
  const { user, unit } = useAuth();
  const [selectedDay, setSelectedDay] = useState(
    DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  );
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [sessionNote, setSessionNote] = useState('');
  const [sets, setSets] = useState([
    { exercise_name: '', muscle_group: 'Chest', entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }
  ]);
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [program, setProgram] = useState(null);

  useEffect(() => { if (client) fetchClientProgram(); }, []);

  if (!client) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white' }}>No client selected. Go back and select a client.</Text>
      </View>
    );
  }
  const [tab, setTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingWeight, setEditingWeight] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [targetInput, setTargetInput] = useState({ protein:'', carbs:'', fats:'' });
  const [feedbackText, setFeedbackText] = useState('');
  const [clientUnit, setClientUnit] = useState(client?.unit_preference || 'kg');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [wRes, mRes, tRes, cRes, wlRes, fRes] = await Promise.all([
      supabase.from('weight_logs').select('*').eq('client_id', client.id)
        .order('logged_at', { ascending: true }),
      supabase.from('macro_logs').select('*').eq('client_id', client.id)
        .order('date', { ascending: false }).limit(30),
      supabase.from('macro_targets').select('*').eq('client_id', client.id).single(),
      supabase.from('menstrual_cycles').select('*').eq('client_id', client.id)
        .order('cycle_start_date', { ascending: false }),
      supabase.from('workout_logs').select('logged_at')
        .eq('client_id', client.id).order('logged_at', { ascending: false }).limit(50),
      supabase.from('workout_feedback').select('*').eq('client_id', client.id)
        .order('created_at', { ascending: false }),
    ]);
    setWeightLogs(wRes.data || []);
    setMacroLogs(mRes.data || []);
    setMacroTargets(tRes.data || null);
    setCycles(cRes.data || []);
    setWorkoutLogs(wlRes.data || []);
    setFeedbacks(fRes.data || []);
    if (tRes.data) {
      setTargetInput({
        protein: String(tRes.data.protein_g),
        carbs: String(tRes.data.carbs_g),
        fats: String(tRes.data.fats_g),
      });
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
    Alert.alert('Delete', 'Remove this weigh-in?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('weight_logs').delete().eq('id', id);
        fetchAll();
      }}
    ]);
  }

  async function saveMacroTargets() {
    setLoading(true);
    const calories = (
      parseFloat(targetInput.protein)*4 +
      parseFloat(targetInput.carbs)*4 +
      parseFloat(targetInput.fats)*9
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
    Alert.alert('✅ Targets Set!', `Macro targets updated for ${client.name}.`);
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

  async function updateClientUnit(unit) {
    await supabase.from('profiles').update({ unit_preference: unit }).eq('id', client.id);
    setClientUnit(unit);
    setShowUnitModal(false);
    Alert.alert('✅ Updated', `${client.name}'s unit set to ${unit}.`);
  }

  function getMacroColor(log) {
    if (!macroTargets) return COLORS.darkCard;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B22';
    if (ratio >= 0.85) return '#00C89622';
    if (ratio >= 0.6) return '#FFB34722';
    return '#FF6B6B11';
  }

  function getMacroBorderColor(log) {
    if (!macroTargets) return COLORS.darkBorder;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B';
    if (ratio >= 0.85) return '#00C896';
    if (ratio >= 0.6) return '#FFB347';
    return '#FF6B6B';
  }

  function getCalendarCells() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const log = macroLogs.find(l => l.date === dateStr);
      const phase = client.gender === 'Female' && cycles.length > 0
        ? getPhaseForDate(dateStr, cycles[0].cycle_start_date, cycles[0].cycle_length)
        : null;
      cells.push({ day:d, date:dateStr, log, phase });
    }
    return cells;
  }

  function getComplianceStats() {
    const last30Days = Array.from({ length:30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    });
    const loggedDays = new Set(workoutLogs.map(l => l.logged_at.split('T')[0]));
    const trained = last30Days.filter(d => loggedDays.has(d)).length;
    return { trained, total: 30, pct: Math.round((trained/30)*100) };
  }

  const weightChange = weightLogs.length >= 2
    ? (weightLogs[weightLogs.length-1].weight_kg - weightLogs[0].weight_kg).toFixed(1)
    : null;
  const ul = unitLabel(clientUnit);
  const calendarCells = getCalendarCells();
  const compliance = getComplianceStats();
  const monthName = calendarMonth.toLocaleString('default', { month:'long', year:'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];
  const currentCycle = cycles[0] || null;
  const isFemale = client.gender === 'Female';

  const tabs = [
    { key:'weight', label:'⚖️ Weight' },
    { key:'macros', label:'🥗 Macros' },
    { key:'compliance', label:'📊 Activity' },
    { key:'feedback', label:'💬 Feedback' },
    ...(isFemale ? [{ key:'cycle', label:'🌸 Cycle' }] : []),
  ];
if (!client) return null;
  return (
    <View style={styles.container}>
      <View style={styles.clientBanner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View style={{ flex:1 }}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Health & Nutrition</Text>
        </View>
        <TouchableOpacity style={styles.unitOverrideBtn}
          onPress={() => setShowUnitModal(true)}>
          <Text style={styles.unitOverrideBtnText}>{ul} ↕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll} contentContainerStyle={{ paddingHorizontal:12, gap:8, alignItems:'center', paddingVertical:8 }}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.tabBtn, tab===t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab===t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── WEIGHT ── */}
        {tab === 'weight' && (
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0
                    ? `${toDisplay(weightLogs[weightLogs.length-1].weight_kg, clientUnit)}${ul}`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Current</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0
                    ? `${toDisplay(weightLogs[0].weight_kg, clientUnit)}${ul}`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Starting</Text>
              </View>
              <View style={[styles.statCard, {
                borderColor: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.darkBorder
              }]}>
                <Text style={[styles.statValue, {
                  color: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.textMuted
                }]}>
                  {weightChange !== null
                    ? `${weightChange>0?'+':''}${toDisplay(parseFloat(weightChange), clientUnit)}${ul}`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Change</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.actionBtn}
              onPress={() => { setEditingWeight(null); setWeightInput(''); setWeightNotes(''); setShowWeightModal(true); }}>
              <Text style={styles.actionBtnText}>+ Log Weigh-in for {client.name}</Text>
            </TouchableOpacity>

            {weightLogs.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>History</Text>
                {[...weightLogs].reverse().map((log, i) => {
                  const idx = weightLogs.length - 1 - i;
                  const prev = weightLogs[idx-1];
                  const diff = prev
                    ? (log.weight_kg - prev.weight_kg).toFixed(1)
                    : null;
                    if (!client) return null;
                  return (
                    <View key={log.id} style={styles.logRow}>
                      <View style={{ flex:1 }}>
                        <Text style={styles.logDate}>
                          {new Date(log.logged_at).toLocaleDateString('en-US',
                            { month:'short', day:'numeric', year:'numeric' })}
                        </Text>
                        {log.notes && <Text style={styles.logNotes}>{log.notes}</Text>}
                      </View>
                      <View style={styles.logRight}>
                        <Text style={styles.logWeight}>
                          {toDisplay(log.weight_kg, clientUnit)}{ul}
                        </Text>
                        {diff !== null && (
                          <Text style={[styles.logDiff, {
                            color: diff>0?COLORS.error:diff<0?COLORS.success:COLORS.textMuted
                          }]}>
                            {diff>0?'▲':diff<0?'▼':'='} {Math.abs(toDisplay(Math.abs(parseFloat(diff)), clientUnit))}{ul}
                          </Text>
                        )}
                      </View>
                      <View style={styles.logActions}>
                        <TouchableOpacity style={styles.editBtn}
                          onPress={() => {
                            setEditingWeight(log);
                            setWeightInput(String(toDisplay(log.weight_kg, clientUnit)));
                            setWeightNotes(log.notes||'');
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
                })}
              </View>
            )}
          </View>
        )}

        {/* ── MACROS ── */}
        {tab === 'macros' && (
          <View>
            {macroTargets ? (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Current Macro Targets</Text>
                <View style={styles.macroRow}>
                  {[
                    { label:'Protein', val:macroTargets.protein_g, color:'#FF6B6B' },
                    { label:'Carbs', val:macroTargets.carbs_g, color:'#4ECDC4' },
                    { label:'Fats', val:macroTargets.fats_g, color:'#FFE66D' },
                    { label:'kcal', val:macroTargets.calories, color:COLORS.roseGold },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill, { backgroundColor:m.color+'22', borderColor:m.color }]}>
                      <Text style={[styles.macroPillValue, { color:m.color }]}>{m.val}g</Text>
                      <Text style={styles.macroPillLabel}>{m.label}</Text>
                    </View>
                  ))}
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

            {/* Macro calendar */}
            <View style={styles.calendarCard}>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth()-1))}>
                  <Text style={styles.calNavBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonthText}>{monthName}</Text>
                <TouchableOpacity onPress={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth()+1))}>
                  <Text style={styles.calNavBtn}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calDayHeaders}>
                {DAYS_OF_WEEK.map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
              </View>
              <View style={styles.calGrid}>
                {calendarCells.map((cell, i) => {
                  if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                  const bg = cell.log ? getMacroColor(cell.log) : 'transparent';
                  const border = cell.log ? getMacroBorderColor(cell.log) : COLORS.darkBorder;
                  const isToday = cell.date === todayStr;
                  if (!client) return null;
                  return (
                    <View key={cell.date} style={styles.calCell}>
                      <View style={[styles.calCellInner, {
                        backgroundColor:bg,
                        borderColor: isToday?COLORS.roseGold:border,
                        borderWidth: isToday?2:1,
                      }]}>
                        <Text style={[styles.calCellDay,{ color:isToday?COLORS.roseGold:COLORS.white }]}>
                          {cell.day}
                        </Text>
                        {cell.log && <View style={[styles.calDot,{ backgroundColor:border }]} />}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
              {[
                { color:'#00C896', label:'On target' },
                { color:'#FFB347', label:'Under' },
                { color:'#FF4B4B', label:'Over / Way under' },
              ].map(l => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor:l.color }]} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              ))}
            </View>

            {/* Recent macro logs */}
            <Text style={styles.sectionTitle}>Recent Logs</Text>
            {macroLogs.slice(0,14).map(log => (
              <View key={log.date} style={styles.macroLogRow}>
                <Text style={styles.macroLogDate}>{log.date}</Text>
                <View style={styles.macroLogValues}>
                  <Text style={[styles.macroLogVal,{ color:'#FF6B6B' }]}>P:{log.protein_g}g</Text>
                  <Text style={[styles.macroLogVal,{ color:'#4ECDC4' }]}>C:{log.carbs_g}g</Text>
                  <Text style={[styles.macroLogVal,{ color:'#FFE66D' }]}>F:{log.fats_g}g</Text>
                  <Text style={[styles.macroLogVal,{ color:COLORS.roseGold }]}>{log.calories}kcal</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── COMPLIANCE ── */}
        {tab === 'compliance' && (
          <View>
            <View style={styles.complianceCard}>
              <Text style={styles.complianceTitle}>Workout Compliance (Last 30 days)</Text>
              <Text style={styles.compliancePct}>{compliance.pct}%</Text>
              <Text style={styles.complianceSub}>
                {compliance.trained} days trained out of 30
              </Text>
              <View style={styles.complianceBar}>
                <View style={[styles.complianceFill, {
                  width: `${compliance.pct}%`,
                  backgroundColor: compliance.pct >= 70 ? COLORS.success
                    : compliance.pct >= 40 ? COLORS.warning : COLORS.error
                }]} />
              </View>
              <Text style={[styles.complianceStatus, {
                color: compliance.pct >= 70 ? COLORS.success
                  : compliance.pct >= 40 ? COLORS.warning : COLORS.error
              }]}>
                {compliance.pct >= 70 ? '✅ Excellent consistency!'
                  : compliance.pct >= 40 ? '⚠️ Room for improvement'
                  : '❌ Low activity — check in with client'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {workoutLogs.slice(0,10).map((log, i) => (
              <View key={i} style={styles.activityRow}>
                <Text style={styles.activityDate}>
                  {new Date(log.logged_at).toLocaleDateString('en-US',
                    { weekday:'short', month:'short', day:'numeric' })}
                </Text>
                <View style={styles.activityDot} />
              </View>
            ))}
          </View>
        )}

        {/* ── FEEDBACK ── */}
        {tab === 'feedback' && (
          <View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => setShowFeedbackModal(true)}>
              <Text style={styles.actionBtnText}>+ Leave Feedback for {client.name}</Text>
            </TouchableOpacity>

            {feedbacks.length === 0
              ? <View style={styles.emptyCard}>
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

        {/* ── CYCLE (female only) ── */}
        {tab === 'cycle' && isFemale && (
  <View>
    {currentCycle ? (
      <View>
        <View style={styles.cycleInfoCard}>
          <Text style={styles.cycleInfoTitle}>🌸 Cycle Info</Text>
          <Text style={styles.cycleInfoText}>
            Last period: {currentCycle.cycle_start_date}
          </Text>
          <Text style={styles.cycleInfoText}>
            Cycle: {currentCycle.cycle_length} days · Period: {currentCycle.period_length} days
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

        {/* Small cycle calendar */}
        <View style={styles.smallCalendarCard}>
          <View style={styles.calNav}>
            <TouchableOpacity
              onPress={() => setCalendarMonth(m =>
                new Date(m.getFullYear(), m.getMonth() - 1))}>
              <Text style={styles.calNavBtn}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calMonthText}>{monthName}</Text>
            <TouchableOpacity
              onPress={() => setCalendarMonth(m =>
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
            {calendarCells.map((cell, i) => {
              if (!cell) return <View key={`e${i}`} style={styles.smallCalCell} />;
              const phase = getPhaseForDate(
                cell.date,
                currentCycle.cycle_start_date,
                currentCycle.cycle_length
              );
              const isToday = cell.date === todayStr;
              if (!client) return null;
              return (
                <TouchableOpacity key={cell.date} style={styles.smallCalCell}
                  onPress={() => {
                    if (phase) {
                      showAlert(
                        `${phase.emoji} ${phase.name}`,
                        `Day ${cell.day}\n\n💪 ${phase.workoutRecommendations[0]}\n\n🥗 ${phase.nutritionTips[0]}\n\n⚖️ ${phase.weightNote}`
                      );
                    }
                  }}>
                  <View style={[styles.smallCalCellInner, {
                    backgroundColor: phase ? phase.color + '40' : 'transparent',
                    borderColor: isToday ? COLORS.roseGold : phase ? phase.color : COLORS.darkBorder,
                    borderWidth: isToday ? 2 : 1,
                  }]}>
                    <Text style={[styles.smallCalCellDay, {
                      color: isToday ? COLORS.roseGold : COLORS.white
                    }]}>
                      {cell.day}
                    </Text>
                    {phase && (
                      <Text style={{ fontSize: 6 }}>{phase.emoji}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Phase cards */}
        {Object.values(CYCLE_PHASES).map(phase => (
          <View key={phase.name}
            style={[styles.phaseCard, { borderColor: phase.color }]}>
            <Text style={[styles.phaseTitle, { color: phase.color }]}>
              {phase.emoji} {phase.name} (Days {phase.days})
            </Text>
            <Text style={styles.phaseWeightNote}>⚖️ {phase.weightNote}</Text>
            <Text style={styles.phaseRec}>
              💪 {phase.workoutRecommendations[0]}
            </Text>
            <Text style={styles.phaseRec}>
              🥗 {phase.nutritionTips[0]}
            </Text>
          </View>
        ))}
      </View>
    ) : (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>No cycle data logged</Text>
        <Text style={styles.emptySub}>
          Client needs to log their period in their Health tab
        </Text>
      </View>
    )}
  </View>
)}

      </ScrollView>

      {/* Weight modal */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingWeight ? '✏️ Edit Weigh-in' : '⚖️ Log Weigh-in'}
            </Text>
            <Text style={styles.modalSub}>for {client.name} · entering in {ul}</Text>
            <Text style={styles.modalLabel}>Weight ({ul})</Text>
            <RNTextInput value={weightInput} onChangeText={setWeightInput}
              style={styles.modalInput} placeholder="0"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Notes</Text>
            <RNTextInput value={weightNotes} onChangeText={setWeightNotes}
              style={styles.modalInput} placeholder="e.g. Check-in week 4"
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => { setShowWeightModal(false); setEditingWeight(null); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveWeight} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading?'...':'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Macro target modal */}
      <Modal visible={showTargetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🎯 Set Macro Targets</Text>
            <Text style={styles.modalSub}>for {client.name}</Text>
            <View style={styles.macroInputRow}>
              {[
                { key:'protein', label:'Protein (g)', color:'#FF6B6B' },
                { key:'carbs', label:'Carbs (g)', color:'#4ECDC4' },
                { key:'fats', label:'Fats (g)', color:'#FFE66D' },
              ].map(m => (
                <View key={m.key} style={{ flex:1 }}>
                  <Text style={[styles.modalLabel, { color:m.color }]}>{m.label}</Text>
                  <RNTextInput value={targetInput[m.key]}
                    onChangeText={v => setTargetInput(t=>({...t,[m.key]:v}))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
              ))}
            </View>
            <Text style={styles.autoCalories}>
              Total: {(
                (parseFloat(targetInput.protein)||0)*4 +
                (parseFloat(targetInput.carbs)||0)*4 +
                (parseFloat(targetInput.fats)||0)*9
              ).toFixed(0)} kcal
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowTargetModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveMacroTargets} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading?'...':'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback modal */}
      <Modal visible={showFeedbackModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💬 Workout Feedback</Text>
            <Text style={styles.modalSub}>for {client.name}</Text>
            <Text style={styles.modalLabel}>Feedback</Text>
            <RNTextInput value={feedbackText} onChangeText={setFeedbackText}
              style={[styles.modalInput, { minHeight:100, textAlignVertical:'top' }]}
              placeholder="e.g. Great session! Increase bench by 2.5kg next week..."
              placeholderTextColor={COLORS.textMuted}
              multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowFeedbackModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveFeedback} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading?'...':'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unit override modal */}
      <Modal visible={showUnitModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚖️ Set Unit for {client.name}</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, clientUnit==='kg' && styles.modalSaveBtn]}
                onPress={() => updateClientUnit('kg')}>
                <Text style={[styles.modalCancelText, clientUnit==='kg' && styles.modalSaveText]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalCancelBtn, clientUnit==='lbs' && styles.modalSaveBtn]}
                onPress={() => updateClientUnit('lbs')}>
                <Text style={[styles.modalCancelText, clientUnit==='lbs' && styles.modalSaveText]}>lbs</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  clientBanner: { flexDirection:'row', alignItems:'center', gap:12, padding:16, paddingTop:20, backgroundColor: COLORS.darkCard, borderBottomWidth:1, borderBottomColor: COLORS.darkBorder },
  avatar: { width:44, height:44, borderRadius:22, backgroundColor: COLORS.roseGoldMid, justifyContent:'center', alignItems:'center' },
  avatarText: { color: COLORS.roseGold, fontSize:20, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop:2 },
  unitOverrideBtn: { paddingHorizontal:12, paddingVertical:6, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  unitOverrideBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
  tabScroll: { maxHeight:52 },
  tabBtn: { paddingHorizontal:14, paddingVertical:8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth:1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.xs },
  tabTextActive: { color: COLORS.white },
  scroll: { flex:1 },
  scrollContent: { padding:16, paddingBottom:40 },
  statsRow: { flexDirection:'row', gap:8, marginBottom:16 },
  statCard: { flex:1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  statValue: { fontSize: SIZES.md, ...FONTS.bold, color: COLORS.roseGold },
  statLabel: { fontSize:9, color: COLORS.textMuted, marginTop:2, textAlign:'center' },
  actionBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginBottom:16, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  actionBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:10, marginTop:8 },
  logRow: { flexDirection:'row', alignItems:'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:8, borderWidth:1, borderColor: COLORS.darkBorder },
  logDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  logNotes: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  logRight: { alignItems:'flex-end', marginRight:8 },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.lg },
  logDiff: { fontSize: SIZES.sm, ...FONTS.medium, marginTop:2 },
  logActions: { flexDirection:'row', gap:4 },
  editBtn: { padding:6, backgroundColor: COLORS.darkCard2, borderRadius:6 },
  delBtn: { padding:6, backgroundColor:'#FF4B4B22', borderRadius:6 },
  targetsCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  targetsTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 },
  macroRow: { flexDirection:'row', gap:8 },
  macroPill: { flex:1, borderRadius: RADIUS.md, padding:10, alignItems:'center', borderWidth:1 },
  macroPillValue: { fontSize: SIZES.md, ...FONTS.bold },
  macroPillLabel: { fontSize:9, color: COLORS.textMuted, marginTop:2 },
  noTargetsCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:14, marginBottom:12, alignItems:'center' },
  noTargetsText: { color: COLORS.textSecondary, ...FONTS.semibold },
  calendarCard: {
  backgroundColor: COLORS.darkCard,
  borderRadius: RADIUS.lg,
  padding: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: COLORS.darkBorder,
  maxWidth: 400,
  alignSelf: 'center',
  width: '100%',
},
  calNav: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  calNavBtn: { color: COLORS.roseGold, fontSize:24, ...FONTS.bold, paddingHorizontal:8 },
  calMonthText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  calDayHeaders: { flexDirection:'row', marginBottom:6 },
  calDayHeader: { flex:1, textAlign:'center', color: COLORS.textMuted, fontSize:10, ...FONTS.semibold },
  calGrid: { flexDirection:'row', flexWrap:'wrap' },
  calCell: {
  width: `${100/7}%`,
  aspectRatio: 1,
  padding: 1,
},
  calCellInner: {
  flex: 1,
  borderRadius: 4,
  justifyContent: 'center',
  alignItems: 'center',
  overflow: 'hidden',
},
  calCellDay: { fontSize:11, ...FONTS.medium },
  calDot: { width:4, height:4, borderRadius:2, marginTop:1 },
  legendRow: { flexDirection:'row', gap:10, marginBottom:12, flexWrap:'wrap' },
  legendItem: { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot: { width:8, height:8, borderRadius:4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  macroLogRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:6, borderWidth:1, borderColor: COLORS.darkBorder },
  macroLogDate: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom:6 },
  macroLogValues: { flexDirection:'row', gap:10, flexWrap:'wrap' },
  macroLogVal: { fontSize: SIZES.sm, ...FONTS.semibold },
  complianceCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:20, marginBottom:16, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  complianceTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  compliancePct: { fontSize:64, ...FONTS.heavy, color: COLORS.white },
  complianceSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom:16 },
  complianceBar: { width:'100%', height:8, backgroundColor: COLORS.darkCard2, borderRadius:4, marginBottom:10, overflow:'hidden' },
  complianceFill: { height:8, borderRadius:4 },
  complianceStatus: { fontSize: SIZES.sm, ...FONTS.semibold, textAlign:'center' },
  activityRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:6, borderWidth:1, borderColor: COLORS.darkBorder },
  activityDate: { color: COLORS.white, fontSize: SIZES.sm },
  activityDot: { width:8, height:8, borderRadius:4, backgroundColor: COLORS.success },
  feedbackCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, marginBottom:8, borderWidth:1, borderColor: COLORS.roseGoldMid, borderLeftWidth:3, borderLeftColor: COLORS.roseGold },
  feedbackDate: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom:4 },
  feedbackText: { color: COLORS.white, fontSize: SIZES.sm, lineHeight:20 },
  cycleInfoCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  cycleInfoTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom:8 },
  cycleInfoText: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom:4 },
  phaseLegendRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 },
  phaseLegendItem: { flexDirection:'row', alignItems:'center', gap:4 },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:8, borderWidth:1, borderLeftWidth:3 },
  phaseTitle: { ...FONTS.bold, fontSize: SIZES.sm, marginBottom:6 },
  phaseWeightNote: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom:4 },
  phaseRec: { color: COLORS.textMuted, fontSize: SIZES.xs },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:32, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop:4, textAlign:'center' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:4 },
  modalSub: { color: COLORS.roseGold, ...FONTS.medium, fontSize: SIZES.md, marginBottom:16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  macroInputRow: { flexDirection:'row', gap:8 },
  autoCalories: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold, marginBottom:12, textAlign:'center' },
  modalBtns: { flexDirection:'row', gap:12, marginTop:8 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  smallCalendarCard: {
  backgroundColor: COLORS.darkCard,
  borderRadius: RADIUS.lg,
  padding: 10,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: COLORS.darkBorder,
  maxWidth: 400,
  alignSelf: 'center',
  width: '100%',
},
smallCalCell: {
  width: `${100/7}%`,
  aspectRatio: 1,
  padding: 1,
},
smallCalCellInner: {
  flex: 1,
  borderRadius: 4,
  justifyContent: 'center',
  alignItems: 'center',
},
smallCalCellDay: {
  fontSize: 9,
  ...FONTS.medium,
},
});