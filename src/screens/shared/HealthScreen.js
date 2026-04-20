import { showAlert, showConfirm } from '../../utils/webAlert';
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput,
  Dimensions, FlatList, Platform
} from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { CYCLE_PHASES, getCurrentPhase, getPhaseForDate } from '../../data/cycleData';

const W = Dimensions.get('window').width;
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MEAL_TYPES = ['Breakfast','Lunch','Dinner','Snack','Pre-workout','Post-workout','Other'];

export default function HealthScreen() {
  const { profile } = useAuth();
  const isFemale = profile?.gender === 'Female';

  const [mainTab, setMainTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [foodEntries, setFoodEntries] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [editingWeight, setEditingWeight] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPhase, setSelectedPhase] = useState(null);

  // Inputs
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [cycleInput, setCycleInput] = useState({ start_date: '', cycle_length: '28', period_length: '5' });
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [foodGrams, setFoodGrams] = useState('');
  const [foodMeal, setFoodMeal] = useState('Breakfast');
  const [customFood, setCustomFood] = useState({ name: '', protein: '', carbs: '', fats: '' });
  const [foodInputMode, setFoodInputMode] = useState('search'); // 'search' | 'custom'

  useEffect(() => { if (profile) fetchAll(); }, [profile]);

  async function fetchAll() {
    if (!profile) return;
    const [wRes, mRes, tRes, fRes, flRes, cRes] = await Promise.all([
      supabase.from('weight_logs').select('*').eq('client_id', profile.id).order('logged_at', { ascending: true }),
      supabase.from('macro_logs').select('*').eq('client_id', profile.id).order('date', { ascending: false }),
      supabase.from('macro_targets').select('*').eq('client_id', profile.id).single(),
      supabase.from('food_entries').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('food_library').select('*').order('name'),
      supabase.from('menstrual_cycles').select('*').eq('client_id', profile.id).order('cycle_start_date', { ascending: false }),
    ]);
    setWeightLogs(wRes.data || []);
    setMacroLogs(mRes.data || []);
    setMacroTargets(tRes.data || null);
    setFoodEntries(fRes.data || []);
    setFoodLibrary(flRes.data || []);
    setCycles(cRes.data || []);
  }

  // ── WEIGHT ─────────────────────────────────────────────

  async function saveWeight() {
    if (!weightInput.trim()) { showAlert('Error', 'Enter your weight'); return; }
    setLoading(true);
    if (editingWeight) {
      await supabase.from('weight_logs').update({
        weight_kg: parseFloat(weightInput),
        notes: weightNotes.trim() || null,
      }).eq('id', editingWeight.id);
    } else {
      await supabase.from('weight_logs').insert({
        client_id: profile.id,
        logged_by: profile.id,
        weight_kg: parseFloat(weightInput),
        notes: weightNotes.trim() || null,
      });
    }
    setLoading(false);
    setWeightInput(''); setWeightNotes(''); setEditingWeight(null);
    setShowWeightModal(false);
    fetchAll();
  }

  function openEditWeight(log) {
    setEditingWeight(log);
    setWeightInput(String(log.weight_kg));
    setWeightNotes(log.notes || '');
    setShowWeightModal(true);
  }

  async function deleteWeight(id) {
    showAlert('Delete', 'Remove this weigh-in?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('weight_logs').delete().eq('id', id);
        fetchAll();
      }}
    ]);
  }

  function getWeightChartData() {
    const recent = weightLogs.slice(-10);
    if (recent.length < 2) return null;
    return {
      labels: recent.map(w => w.logged_at.split('T')[0].slice(5)),
      datasets: [{ data: recent.map(w => w.weight_kg), color: () => COLORS.roseGold, strokeWidth: 2 }],
    };
  }

  function getWeightChange() {
    if (weightLogs.length < 2) return null;
    return (weightLogs[weightLogs.length-1].weight_kg - weightLogs[0].weight_kg).toFixed(1);
  }

  // ── FOOD & MACROS ──────────────────────────────────────

  const filteredFoods = foodLibrary.filter(f =>
    f.name.toLowerCase().includes(foodSearch.toLowerCase())
  );

  function calcFoodMacros(food, grams) {
    const g = parseFloat(grams) || 0;
    return {
      protein: ((food.protein_per_100g * g) / 100).toFixed(1),
      carbs: ((food.carbs_per_100g * g) / 100).toFixed(1),
      fats: ((food.fats_per_100g * g) / 100).toFixed(1),
      calories: ((food.calories_per_100g * g) / 100).toFixed(0),
    };
  }

  async function saveFoodEntry() {
    if (!selectedDate) return;
    setLoading(true);

    let entryData = null;
    if (foodInputMode === 'search' && selectedFood) {
      const macros = calcFoodMacros(selectedFood, foodGrams);
      entryData = {
        client_id: profile.id,
        date: selectedDate,
        food_name: selectedFood.name,
        grams: parseFloat(foodGrams),
        protein_g: parseFloat(macros.protein),
        carbs_g: parseFloat(macros.carbs),
        fats_g: parseFloat(macros.fats),
        calories: parseFloat(macros.calories),
        meal_type: foodMeal,
      };
    } else if (foodInputMode === 'custom' && customFood.name) {
      const cals = (
        (parseFloat(customFood.protein)||0)*4 +
        (parseFloat(customFood.carbs)||0)*4 +
        (parseFloat(customFood.fats)||0)*9
      );
      entryData = {
        client_id: profile.id,
        date: selectedDate,
        food_name: customFood.name,
        grams: 100,
        protein_g: parseFloat(customFood.protein)||0,
        carbs_g: parseFloat(customFood.carbs)||0,
        fats_g: parseFloat(customFood.fats)||0,
        calories: cals,
        meal_type: foodMeal,
      };
    }

    if (!entryData) { setLoading(false); return; }

    await supabase.from('food_entries').insert(entryData);

    // Recalculate and update macro_logs for this date
    const dayEntries = [...foodEntries.filter(e => e.date === selectedDate), entryData];
    const totals = dayEntries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein_g||0),
      carbs: acc.carbs + (e.carbs_g||0),
      fats: acc.fats + (e.fats_g||0),
      calories: acc.calories + (e.calories||0),
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });

    await supabase.from('macro_logs').upsert({
      client_id: profile.id,
      logged_by: profile.id,
      date: selectedDate,
      protein_g: parseFloat(totals.protein.toFixed(1)),
      carbs_g: parseFloat(totals.carbs.toFixed(1)),
      fats_g: parseFloat(totals.fats.toFixed(1)),
      calories: parseFloat(totals.calories.toFixed(0)),
    }, { onConflict: 'client_id,date' });

    setLoading(false);
    setShowFoodModal(false);
    setSelectedFood(null); setFoodGrams(''); setFoodSearch('');
    setCustomFood({ name: '', protein: '', carbs: '', fats: '' });
    fetchAll();
  }

  async function deleteFoodEntry(id, date) {
    showAlert('Delete', 'Remove this food entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('food_entries').delete().eq('id', id);
        // Recalculate day totals
        const remaining = foodEntries.filter(e => e.id !== id && e.date === date);
        const totals = remaining.reduce((acc, e) => ({
          protein: acc.protein + (e.protein_g||0),
          carbs: acc.carbs + (e.carbs_g||0),
          fats: acc.fats + (e.fats_g||0),
          calories: acc.calories + (e.calories||0),
        }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
        if (remaining.length === 0) {
          await supabase.from('macro_logs').delete()
            .eq('client_id', profile.id).eq('date', date);
        } else {
          await supabase.from('macro_logs').upsert({
            client_id: profile.id, date,
            protein_g: totals.protein, carbs_g: totals.carbs,
            fats_g: totals.fats, calories: totals.calories,
          }, { onConflict: 'client_id,date' });
        }
        fetchAll();
      }}
    ]);
  }

  function getMacroColor(log) {
    if (!macroTargets) return COLORS.darkCard;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B22';    // over — red
    if (ratio >= 0.85) return '#00C89622';  // on target — green
    if (ratio >= 0.6) return '#FFB34722';   // under — yellow
    return '#FF6B6B11';                      // way under — faint red
  }

  function getMacroBorderColor(log) {
    if (!macroTargets) return COLORS.darkBorder;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B';
    if (ratio >= 0.85) return '#00C896';
    if (ratio >= 0.6) return '#FFB347';
    return '#FF6B6B';
  }

  function getMacroStatus(log) {
    if (!macroTargets) return null;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return { label: 'Over', color: '#FF4B4B', emoji: '🔴' };
    if (ratio >= 0.85) return { label: 'On target', color: '#00C896', emoji: '🟢' };
    if (ratio >= 0.6) return { label: 'Under', color: '#FFB347', emoji: '🟡' };
    return { label: 'Way under', color: '#FF6B6B', emoji: '🔴' };
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
      const log = macroLogs.find(l => l.date === dateStr);
      const phase = isFemale && cycles.length > 0
        ? getPhaseForDate(dateStr, cycles[0].cycle_start_date, cycles[0].cycle_length)
        : null;
      cells.push({ day: d, date: dateStr, log, phase });
    }
    return cells;
  }

  function getWeeklyAvg() {
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
    const weekLogs = macroLogs.filter(l => new Date(l.date) >= weekAgo);
    if (!weekLogs.length) return null;
    const avg = (key) => (weekLogs.reduce((s,l) => s+(l[key]||0), 0) / weekLogs.length).toFixed(0);
    return {
      days: weekLogs.length,
      protein: avg('protein_g'), carbs: avg('carbs_g'),
      fats: avg('fats_g'), calories: avg('calories'),
    };
  }

  // ── CYCLE ──────────────────────────────────────────────

  async function saveCycle() {
    if (!cycleInput.start_date) { showAlert('Error', 'Enter the start date'); return; }
    setLoading(true);
    await supabase.from('menstrual_cycles').insert({
      client_id: profile.id,
      cycle_start_date: cycleInput.start_date,
      cycle_length: parseInt(cycleInput.cycle_length) || 28,
      period_length: parseInt(cycleInput.period_length) || 5,
    });
    setLoading(false);
    setShowCycleModal(false);
    setCycleInput({ start_date: '', cycle_length: '28', period_length: '5' });
    fetchAll();
  }

  const currentCycle = cycles.length > 0 ? cycles[0] : null;
  const currentPhaseData = currentCycle
    ? getCurrentPhase(currentCycle.cycle_start_date, currentCycle.cycle_length)
    : null;

  const weightChange = getWeightChange();
  const weightChartData = getWeightChartData();
  const calendarCells = getCalendarCells();
  const weekSummary = getWeeklyAvg();
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEntries = foodEntries.filter(e => e.date === todayStr);

  const chartConfig = {
    backgroundColor: COLORS.darkCard,
    backgroundGradientFrom: COLORS.darkCard,
    backgroundGradientTo: COLORS.darkCard2,
    decimalPlaces: 1,
    color: (o=1) => `rgba(183,110,121,${o})`,
    labelColor: () => COLORS.textMuted,
    propsForDots: { r:'4', strokeWidth:'2', stroke: COLORS.roseGold },
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Health & Nutrition</Text>
        <Text style={styles.headerSub}>{profile?.name}</Text>
      </View>

      {/* Main tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {[
          { key:'weight', label:'⚖️ Weight' },
          { key:'macros', label:'🥗 Macros' },
          { key:'food', label:'🍽️ Food Log' },
          ...(isFemale ? [{ key:'cycle', label:'🌸 Cycle' }] : []),
        ].map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.tabBtn, mainTab===t.key && styles.tabBtnActive]}
            onPress={() => setMainTab(t.key)}>
            <Text style={[styles.tabText, mainTab===t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ══ WEIGHT TAB ══ */}
        {mainTab === 'weight' && (
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0 ? `${weightLogs[weightLogs.length-1].weight_kg}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Current</Text>
              </View>
              <View style={[styles.statCard, {
                borderColor: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.darkBorder
              }]}>
                <Text style={[styles.statValue, {
                  color: weightChange > 0 ? COLORS.error : weightChange < 0 ? COLORS.success : COLORS.textMuted
                }]}>
                  {weightChange !== null ? `${weightChange>0?'+':''}${weightChange}kg` : '—'}
                </Text>
                <Text style={styles.statLabel}>Total Change</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{weightLogs.length}</Text>
                <Text style={styles.statLabel}>Check-ins</Text>
              </View>
            </View>

            {weightChartData ? (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Weight Trend</Text>
                <LineChart data={weightChartData} width={W-48} height={180}
                  chartConfig={chartConfig} bezier style={{ borderRadius:8 }} />
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>⚖️</Text>
                <Text style={styles.emptyText}>No weight logs yet</Text>
              </View>
            )}

            <TouchableOpacity style={styles.logBtn}
              onPress={() => { setEditingWeight(null); setWeightInput(''); setWeightNotes(''); setShowWeightModal(true); }}>
              <Text style={styles.logBtnText}>+ Log Weight</Text>
            </TouchableOpacity>

            {weightLogs.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>History</Text>
                {[...weightLogs].reverse().map((log, i) => {
                  const idx = weightLogs.length - 1 - i;
                  const prev = weightLogs[idx - 1];
                  const diff = prev ? (log.weight_kg - prev.weight_kg).toFixed(1) : null;
                  return (
                    <View key={log.id} style={styles.logRow}>
                      <View style={{ flex:1 }}>
                        <Text style={styles.logDate}>
                          {new Date(log.logged_at).toLocaleDateString('en-US',
                            { month:'short', day:'numeric', year:'numeric' })}
                        </Text>
                        {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                      </View>
                      <View style={styles.logRight}>
                        <Text style={styles.logWeight}>{log.weight_kg}kg</Text>
                        {diff !== null && (
                          <Text style={[styles.logDiff, {
                            color: diff>0 ? COLORS.error : diff<0 ? COLORS.success : COLORS.textMuted
                          }]}>
                            {diff>0?'▲':diff<0?'▼':'='} {Math.abs(diff)}kg
                          </Text>
                        )}
                      </View>
                      <View style={styles.logActions}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEditWeight(log)}>
                          <Text style={styles.editBtnText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteWeight(log.id)}>
                          <Text style={styles.deleteBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ══ MACROS TAB ══ */}
        {mainTab === 'macros' && (
          <View>
            {macroTargets ? (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>Daily Targets</Text>
                <View style={styles.macroRow}>
                  {[
                    { label:'Protein', val: macroTargets.protein_g, unit:'g', color:'#FF6B6B' },
                    { label:'Carbs', val: macroTargets.carbs_g, unit:'g', color:'#4ECDC4' },
                    { label:'Fats', val: macroTargets.fats_g, unit:'g', color:'#FFE66D' },
                    { label:'kcal', val: macroTargets.calories, unit:'', color: COLORS.roseGold },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill, { backgroundColor: m.color+'22', borderColor: m.color }]}>
                      <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}{m.unit}</Text>
                      <Text style={styles.macroPillLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.noTargetsCard}>
                <Text style={styles.noTargetsText}>⚠️ No macro targets set — ask your coach</Text>
              </View>
            )}

            {/* Legend */}
            <View style={styles.legendRow}>
              {[
                { color:'#00C896', label:'On target (85-110%)' },
                { color:'#FFB347', label:'Under (60-84%)' },
                { color:'#FF4B4B', label:'Way under / Over' },
              ].map(l => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              ))}
            </View>

            {/* Calendar */}
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
                  const phaseColor = cell.phase?.color;
                  return (
                    <TouchableOpacity key={cell.date} style={styles.calCell}
                      onPress={() => {
                        setSelectedDate(cell.date);
                        setShowFoodModal(true);
                      }}>
                      <View style={[styles.calCellInner,
                        { backgroundColor: bg, borderColor: isToday ? COLORS.roseGold : border },
                        isToday && { borderWidth:2 }]}>
                        {phaseColor && <View style={[styles.phaseStripe, { backgroundColor: phaseColor+'60' }]} />}
                        <Text style={[styles.calCellDay, { color: isToday ? COLORS.roseGold : COLORS.white }]}>
                          {cell.day}
                        </Text>
                        {cell.log && (
                          <Text style={{ fontSize:7, color: border }}>
                            {getMacroStatus(cell.log)?.emoji}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Weekly summary */}
            {weekSummary && (
              <View style={styles.weeklySummaryCard}>
                <Text style={styles.weeklySummaryTitle}>📅 Weekly Avg ({weekSummary.days} days)</Text>
                <View style={styles.weeklyRow}>
                  {[
                    { label:'Protein', val: weekSummary.protein, color:'#FF6B6B', target: macroTargets?.protein_g },
                    { label:'Carbs', val: weekSummary.carbs, color:'#4ECDC4', target: macroTargets?.carbs_g },
                    { label:'Fats', val: weekSummary.fats, color:'#FFE66D', target: macroTargets?.fats_g },
                    { label:'kcal', val: weekSummary.calories, color: COLORS.roseGold, target: macroTargets?.calories },
                  ].map(m => (
                    <View key={m.label} style={styles.weeklyItem}>
                      <Text style={[styles.weeklyValue, { color: m.color }]}>{m.val}</Text>
                      <Text style={styles.weeklyLabel}>{m.label}</Text>
                      {m.target && (
                        <Text style={[styles.weeklyPct, {
                          color: Math.round((m.val/m.target)*100) > 110 ? COLORS.error
                            : Math.round((m.val/m.target)*100) >= 85 ? COLORS.success : COLORS.warning
                        }]}>
                          {Math.round((m.val/m.target)*100)}%
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.logBtn}
              onPress={() => { setSelectedDate(todayStr); setShowFoodModal(true); }}>
              <Text style={styles.logBtnText}>+ Log Today's Food</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ══ FOOD LOG TAB ══ */}
        {mainTab === 'food' && (
          <View>
            <View style={styles.todaySummary}>
              <Text style={styles.todaySummaryTitle}>Today's Intake</Text>
              {todayEntries.length > 0 ? (
                <View>
                  <View style={styles.macroRow}>
                    {[
                      { label:'P', val: todayEntries.reduce((s,e)=>s+e.protein_g,0).toFixed(0), color:'#FF6B6B' },
                      { label:'C', val: todayEntries.reduce((s,e)=>s+e.carbs_g,0).toFixed(0), color:'#4ECDC4' },
                      { label:'F', val: todayEntries.reduce((s,e)=>s+e.fats_g,0).toFixed(0), color:'#FFE66D' },
                      { label:'kcal', val: todayEntries.reduce((s,e)=>s+e.calories,0).toFixed(0), color: COLORS.roseGold },
                    ].map(m => (
                      <View key={m.label} style={[styles.macroPill, { backgroundColor: m.color+'22', borderColor: m.color, flex:1 }]}>
                        <Text style={[styles.macroPillValue, { color: m.color, fontSize: SIZES.md }]}>{m.val}{m.label!=='kcal'?'g':''}</Text>
                        <Text style={styles.macroPillLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                  {macroTargets && (() => {
                    const totalCal = todayEntries.reduce((s,e)=>s+e.calories,0);
                    const status = getMacroStatus({ calories: totalCal });
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: status.color+'22', borderColor: status.color }]}>
                        <Text style={[styles.statusText, { color: status.color }]}>
                          {status.emoji} {status.label} — {totalCal.toFixed(0)} / {macroTargets.calories} kcal
                          {totalCal > macroTargets.calories ? ` (+${(totalCal-macroTargets.calories).toFixed(0)} over)` : ''}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              ) : (
                <Text style={styles.noFoodText}>Nothing logged yet today</Text>
              )}
            </View>

            <TouchableOpacity style={styles.logBtn}
              onPress={() => { setSelectedDate(todayStr); setShowFoodModal(true); }}>
              <Text style={styles.logBtnText}>+ Add Food</Text>
            </TouchableOpacity>

            {/* Food entries grouped by meal */}
            {MEAL_TYPES.filter(mt => todayEntries.some(e => e.meal_type === mt)).map(mt => (
              <View key={mt}>
                <Text style={styles.mealTypeLabel}>{mt}</Text>
                {todayEntries.filter(e => e.meal_type === mt).map(entry => (
                  <View key={entry.id} style={styles.foodEntryRow}>
                    <View style={{ flex:1 }}>
                      <Text style={styles.foodEntryName}>{entry.food_name}</Text>
                      <Text style={styles.foodEntryMacros}>
                        {entry.grams}g · P:{entry.protein_g}g C:{entry.carbs_g}g F:{entry.fats_g}g · {entry.calories}kcal
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteFoodEntry(entry.id, entry.date)}>
                      <Text style={{ fontSize:16 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}

            {/* Past days summary */}
            <Text style={styles.sectionTitle}>Past Days</Text>
            {macroLogs.slice(0, 14).map(log => {
              const status = getMacroStatus(log);
              return (
                <TouchableOpacity key={log.date}
                  style={[styles.pastDayRow, { borderLeftColor: status?.color || COLORS.darkBorder, borderLeftWidth: 3 }]}
                  onPress={() => { setSelectedDate(log.date); setShowFoodModal(true); }}>
                  <View style={{ flex:1 }}>
                    <Text style={styles.pastDayDate}>{log.date}</Text>
                    <Text style={styles.pastDayMacros}>
                      P:{log.protein_g}g C:{log.carbs_g}g F:{log.fats_g}g
                    </Text>
                  </View>
                  <View style={styles.pastDayRight}>
                    <Text style={[styles.pastDayCal, { color: status?.color || COLORS.textMuted }]}>
                      {log.calories} kcal
                    </Text>
                    {status && <Text style={{ fontSize:12 }}>{status.emoji} {status.label}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ══ CYCLE TAB ══ */}
        {mainTab === 'cycle' && isFemale && (
          <View>
            {/* Current phase */}
            {currentPhaseData ? (
              <TouchableOpacity
                style={[styles.phaseCard, { borderColor: currentPhaseData.phase.color }]}
                onPress={() => { setSelectedPhase(currentPhaseData.phase); setShowPhaseModal(true); }}>
                <View style={styles.phaseCardTop}>
                  <Text style={styles.phaseEmoji}>{currentPhaseData.phase.emoji}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={[styles.phaseName, { color: currentPhaseData.phase.color }]}>
                      {currentPhaseData.phase.name}
                    </Text>
                    <Text style={styles.phaseDay}>Day {currentPhaseData.day} of cycle</Text>
                    <Text style={styles.phaseDesc}>{currentPhaseData.phase.description}</Text>
                  </View>
                  <Text style={styles.phaseChevron}>›</Text>
                </View>
                <View style={[styles.phaseBadge, { backgroundColor: currentPhaseData.phase.color+'22' }]}>
                  <Text style={[styles.phaseBadgeText, { color: currentPhaseData.phase.color }]}>
                    Tap for workout & nutrition tips
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noCycleCard}>
                <Text style={styles.noCycleEmoji}>🌸</Text>
                <Text style={styles.noCycleText}>No cycle tracked yet</Text>
                <Text style={styles.noCycleSub}>Log your last period start date below</Text>
              </View>
            )}

            <TouchableOpacity style={styles.logBtn} onPress={() => setShowCycleModal(true)}>
              <Text style={styles.logBtnText}>
                {currentCycle ? '+ Log New Period Start' : '+ Start Tracking'}
              </Text>
            </TouchableOpacity>

            {/* Cycle calendar */}
            {currentCycle && (
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

                {/* Phase legend */}
                <View style={styles.phaseLegendRow}>
                  {Object.values(CYCLE_PHASES).map(ph => (
                    <View key={ph.name} style={styles.phaseLegendItem}>
                      <View style={[styles.legendDot, { backgroundColor: ph.color }]} />
                      <Text style={styles.legendText}>{ph.emoji} {ph.name.split(' ')[0]}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.calDayHeaders}>
                  {DAYS_OF_WEEK.map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
                </View>
                <View style={styles.calGrid}>
                  {calendarCells.map((cell, i) => {
                    if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                    const phase = getPhaseForDate(cell.date, currentCycle.cycle_start_date, currentCycle.cycle_length);
                    const isToday = cell.date === todayStr;
                    return (
                      <TouchableOpacity key={cell.date} style={styles.calCell}
                        onPress={() => { if (phase) { setSelectedPhase(phase); setShowPhaseModal(true); } }}>
                        <View style={[styles.calCellInner, {
                          backgroundColor: phase ? phase.color+'30' : 'transparent',
                          borderColor: isToday ? COLORS.roseGold : phase ? phase.color : COLORS.darkBorder,
                          borderWidth: isToday ? 2 : 1,
                        }]}>
                          <Text style={[styles.calCellDay, { color: isToday ? COLORS.roseGold : COLORS.white }]}>
                            {cell.day}
                          </Text>
                          {phase && <Text style={{ fontSize:7 }}>{phase.emoji}</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Cycle history */}
            {cycles.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>Cycle History</Text>
                {cycles.map(c => (
                  <View key={c.id} style={styles.cycleHistoryRow}>
                    <Text style={styles.cycleHistoryDate}>
                      Period started: {c.cycle_start_date}
                    </Text>
                    <Text style={styles.cycleHistoryMeta}>
                      {c.cycle_length}-day cycle · {c.period_length}-day period
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* ── WEIGHT MODAL ── */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingWeight ? '✏️ Edit Weight' : '⚖️ Log Weight'}</Text>
            <Text style={styles.modalLabel}>Weight (kg)</Text>
            <RNTextInput value={weightInput} onChangeText={setWeightInput}
              style={styles.modalInput} placeholder="e.g. 78.5"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <RNTextInput value={weightNotes} onChangeText={setWeightNotes}
              style={styles.modalInput} placeholder="Morning weight, after workout..."
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => { setShowWeightModal(false); setEditingWeight(null); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveWeight} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FOOD MODAL ── */}
      <Modal visible={showFoodModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>🍽️ Add Food</Text>
            <Text style={styles.modalDate}>{selectedDate}</Text>

            {/* Meal type */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
              {MEAL_TYPES.map(mt => (
                <TouchableOpacity key={mt}
                  style={[styles.mealChip, foodMeal===mt && styles.mealChipActive]}
                  onPress={() => setFoodMeal(mt)}>
                  <Text style={[styles.mealChipText, foodMeal===mt && styles.mealChipTextActive]}>{mt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, foodInputMode==='search' && styles.modeBtnActive]}
                onPress={() => setFoodInputMode('search')}>
                <Text style={[styles.modeBtnText, foodInputMode==='search' && styles.modeBtnTextActive]}>
                  🔍 Search Food
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, foodInputMode==='custom' && styles.modeBtnActive]}
                onPress={() => setFoodInputMode('custom')}>
                <Text style={[styles.modeBtnText, foodInputMode==='custom' && styles.modeBtnTextActive]}>
                  ✏️ Custom
                </Text>
              </TouchableOpacity>
            </View>

            {foodInputMode === 'search' ? (
              <View>
                <RNTextInput value={foodSearch} onChangeText={setFoodSearch}
                  style={styles.modalInput} placeholder="Search food..."
                  placeholderTextColor={COLORS.textMuted} />
                <FlatList
                  data={filteredFoods.slice(0,8)}
                  keyExtractor={item => item.id}
                  style={{ maxHeight: 180 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.foodItem, selectedFood?.id===item.id && styles.foodItemSelected]}
                      onPress={() => setSelectedFood(item)}>
                      <View style={{ flex:1 }}>
                        <Text style={styles.foodItemName}>{item.name}</Text>
                        <Text style={styles.foodItemMacros}>
                          P:{item.protein_per_100g}g C:{item.carbs_per_100g}g F:{item.fats_per_100g}g per 100g
                        </Text>
                      </View>
                      <Text style={styles.foodItemCat}>{item.category}</Text>
                    </TouchableOpacity>
                  )}
                />
                {selectedFood && (
                  <View style={styles.gramsRow}>
                    <View style={{ flex:1 }}>
                      <Text style={styles.modalLabel}>Grams eaten</Text>
                      <RNTextInput value={foodGrams} onChangeText={setFoodGrams}
                        style={styles.modalInput} placeholder="100"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    </View>
                    {foodGrams && (
                      <View style={styles.gramsPreview}>
                        {(() => {
                          const m = calcFoodMacros(selectedFood, foodGrams);
                          return (
                            <View>
                              <Text style={[styles.gramsPreviewVal, { color:'#FF6B6B' }]}>P:{m.protein}g</Text>
                              <Text style={[styles.gramsPreviewVal, { color:'#4ECDC4' }]}>C:{m.carbs}g</Text>
                              <Text style={[styles.gramsPreviewVal, { color:'#FFE66D' }]}>F:{m.fats}g</Text>
                              <Text style={[styles.gramsPreviewVal, { color:COLORS.roseGold }]}>{m.calories}kcal</Text>
                            </View>
                          );
                        })()}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={styles.modalLabel}>Food Name</Text>
                <RNTextInput value={customFood.name}
                  onChangeText={v => setCustomFood(f=>({...f, name:v}))}
                  style={styles.modalInput} placeholder="e.g. Home-cooked adobo"
                  placeholderTextColor={COLORS.textMuted} />
                <View style={styles.macroInputRow}>
                  {[
                    { key:'protein', label:'Protein (g)', color:'#FF6B6B' },
                    { key:'carbs', label:'Carbs (g)', color:'#4ECDC4' },
                    { key:'fats', label:'Fats (g)', color:'#FFE66D' },
                  ].map(m => (
                    <View key={m.key} style={styles.macroInputGroup}>
                      <Text style={[styles.modalLabel, { color: m.color }]}>{m.label}</Text>
                      <RNTextInput value={customFood[m.key]}
                        onChangeText={v => setCustomFood(f=>({...f, [m.key]:v}))}
                        style={styles.modalInput} placeholder="0"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    </View>
                  ))}
                </View>
                <Text style={styles.autoCalories}>
                  Auto calories: {(
                    (parseFloat(customFood.protein)||0)*4 +
                    (parseFloat(customFood.carbs)||0)*4 +
                    (parseFloat(customFood.fats)||0)*9
                  ).toFixed(0)} kcal
                </Text>
              </View>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => { setShowFoodModal(false); setSelectedFood(null); setFoodSearch(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveFoodEntry} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Add Food'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CYCLE MODAL ── */}
      <Modal visible={showCycleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🌸 Log Period Start</Text>
            <Text style={styles.modalLabel}>Period Start Date (YYYY-MM-DD)</Text>
            <RNTextInput value={cycleInput.start_date}
              onChangeText={v => setCycleInput(c=>({...c, start_date:v}))}
              style={styles.modalInput} placeholder="e.g. 2025-04-01"
              placeholderTextColor={COLORS.textMuted} />
            <View style={styles.macroInputRow}>
              <View style={styles.macroInputGroup}>
                <Text style={styles.modalLabel}>Cycle Length (days)</Text>
                <RNTextInput value={cycleInput.cycle_length}
                  onChangeText={v => setCycleInput(c=>({...c, cycle_length:v}))}
                  style={styles.modalInput} placeholder="28"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={styles.macroInputGroup}>
                <Text style={styles.modalLabel}>Period Length (days)</Text>
                <RNTextInput value={cycleInput.period_length}
                  onChangeText={v => setCycleInput(c=>({...c, period_length:v}))}
                  style={styles.modalInput} placeholder="5"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCycleModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveCycle} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PHASE DETAIL MODAL ── */}
      <Modal visible={showPhaseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={[styles.modalCard, { marginTop: 60 }]}>
              {selectedPhase && (
                <View>
                  <Text style={styles.modalTitle}>
                    {selectedPhase.emoji} {selectedPhase.name}
                  </Text>
                  <Text style={[styles.phaseDesc, { marginBottom:16 }]}>{selectedPhase.description}</Text>
                  <View style={[styles.phaseNoteBox, { borderColor: selectedPhase.color }]}>
                    <Text style={styles.phaseNoteTitle}>⚖️ Weight Note</Text>
                    <Text style={styles.phaseNoteText}>{selectedPhase.weightNote}</Text>
                  </View>

                  <Text style={styles.phaseSectionTitle}>💪 Workout Recommendations</Text>
                  {selectedPhase.workoutRecommendations.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <Text style={[styles.tipDot, { color: selectedPhase.color }]}>•</Text>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}

                  <Text style={styles.phaseSectionTitle}>🥗 Nutrition Tips</Text>
                  {selectedPhase.nutritionTips.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <Text style={[styles.tipDot, { color: selectedPhase.color }]}>•</Text>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}

                  <TouchableOpacity style={[styles.modalSaveBtn, { marginTop:20 }]}
                    onPress={() => setShowPhaseModal(false)}>
                    <Text style={styles.modalSaveText}>Got it!</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  header: { paddingTop:60, paddingHorizontal:20, paddingBottom:12 },
  headerTitle: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white },
  headerSub: { fontSize: SIZES.sm, color: COLORS.textSecondary, marginTop:2 },
  tabScroll: { maxHeight:52 },
  tabContent: { paddingHorizontal:16, gap:8, alignItems:'center', paddingVertical:8 },
  tabBtn: { paddingHorizontal:16, paddingVertical:8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth:1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  tabTextActive: { color: COLORS.white },
  scroll: { flex:1 },
  scrollContent: { padding:16, paddingBottom:40 },
  statsRow: { flexDirection:'row', gap:8, marginBottom:16 },
  statCard: { flex:1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  statValue: { fontSize: SIZES.lg, ...FONTS.bold, color: COLORS.roseGold },
  statLabel: { fontSize:9, color: COLORS.textMuted, marginTop:2, textAlign:'center' },
  chartCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  chartTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom:12 },
  logBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginBottom:20, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  logBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:10, marginTop:8 },
  logRow: { flexDirection:'row', alignItems:'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, marginBottom:8, borderWidth:1, borderColor: COLORS.darkBorder },
  logDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  logNotes: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  logRight: { alignItems:'flex-end', marginRight:8 },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.lg },
  logDiff: { fontSize: SIZES.sm, ...FONTS.medium, marginTop:2 },
  logActions: { flexDirection:'row', gap:4 },
  editBtn: { padding:6, backgroundColor: COLORS.darkCard2, borderRadius:8 },
  editBtnText: { fontSize:14 },
  deleteBtn: { padding:6, backgroundColor: COLORS.darkCard2, borderRadius:8 },
  deleteBtnText: { fontSize:14 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:32, alignItems:'center', marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  emptyEmoji: { fontSize:48, marginBottom:8 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  targetsCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  targetsTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 },
  macroRow: { flexDirection:'row', gap:8 },
  macroPill: { flex:1, borderRadius: RADIUS.md, padding:10, alignItems:'center', borderWidth:1 },
  macroPillValue: { fontSize: SIZES.lg, ...FONTS.bold },
  macroPillLabel: { fontSize:9, color: COLORS.textMuted, marginTop:2 },
  noTargetsCard: { backgroundColor:'#FFB34722', borderRadius: RADIUS.md, padding:14, marginBottom:12, borderWidth:1, borderColor:'#FFB347', alignItems:'center' },
  noTargetsText: { color:'#FFB347', ...FONTS.semibold },
  legendRow: { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:12 },
  legendItem: { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot: { width:8, height:8, borderRadius:4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  calendarCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:14, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  calNav: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  calNavBtn: { color: COLORS.roseGold, fontSize:24, ...FONTS.bold, paddingHorizontal:8 },
  calMonthText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  calDayHeaders: { flexDirection:'row', marginBottom:6 },
  calDayHeader: { flex:1, textAlign:'center', color: COLORS.textMuted, fontSize:10, ...FONTS.semibold },
  calGrid: { flexDirection:'row', flexWrap:'wrap' },
  calCell: { width:`${100/7}%`, aspectRatio:1, padding:2 },
  calCellInner: { flex:1, borderRadius:6, borderWidth:1, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  calCellDay: { fontSize:11, ...FONTS.medium },
  phaseStripe: { position:'absolute', top:0, left:0, right:0, height:3 },
  weeklySummaryCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  weeklySummaryTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom:14 },
  weeklyRow: { flexDirection:'row', justifyContent:'space-around' },
  weeklyItem: { alignItems:'center' },
  weeklyValue: { fontSize: SIZES.xl, ...FONTS.bold },
  weeklyLabel: { color: COLORS.textMuted, fontSize:10, marginTop:2 },
  weeklyPct: { fontSize:10, marginTop:2 },
  todaySummary: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  todaySummaryTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom:12 },
  noFoodText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  statusBadge: { borderRadius: RADIUS.md, padding:10, marginTop:10, borderWidth:1, alignItems:'center' },
  statusText: { fontSize: SIZES.sm, ...FONTS.semibold },
  mealTypeLabel: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginTop:12, marginBottom:6 },
  foodEntryRow: { flexDirection:'row', alignItems:'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:6, borderWidth:1, borderColor: COLORS.darkBorder },
  foodEntryName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  foodEntryMacros: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  pastDayRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:6, borderWidth:1, borderColor: COLORS.darkBorder, flexDirection:'row', alignItems:'center' },
  pastDayDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  pastDayMacros: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  pastDayRight: { alignItems:'flex-end' },
  pastDayCal: { ...FONTS.bold, fontSize: SIZES.md },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:2 },
  phaseCardTop: { flexDirection:'row', alignItems:'flex-start', gap:12, marginBottom:10 },
  phaseEmoji: { fontSize:36 },
  phaseName: { fontSize: SIZES.xl, ...FONTS.bold },
  phaseDay: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginTop:2 },
  phaseDesc: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginTop:4 },
  phaseChevron: { color: COLORS.textMuted, fontSize:24 },
  phaseBadge: { borderRadius: RADIUS.md, padding:8, alignItems:'center' },
  phaseBadgeText: { fontSize: SIZES.xs, ...FONTS.semibold },
  noCycleCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:32, alignItems:'center', marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  noCycleEmoji: { fontSize:48, marginBottom:8 },
  noCycleText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  noCycleSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop:4 },
  phaseLegendRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:10 },
  phaseLegendItem: { flexDirection:'row', alignItems:'center', gap:4 },
  cycleHistoryRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:12, marginBottom:8, borderWidth:1, borderColor: COLORS.darkBorder },
  cycleHistoryDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  cycleHistoryMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  phaseNoteBox: { borderRadius: RADIUS.md, padding:12, borderWidth:1, marginBottom:16, backgroundColor: COLORS.darkCard2 },
  phaseNoteTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom:4 },
  phaseNoteText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  phaseSectionTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginTop:16, marginBottom:10 },
  tipRow: { flexDirection:'row', gap:8, marginBottom:6 },
  tipDot: { fontSize: SIZES.lg, lineHeight:22 },
  tipText: { color: COLORS.textSecondary, fontSize: SIZES.sm, flex:1, lineHeight:20 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:4 },
  modalDate: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md, marginBottom:12 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  macroInputRow: { flexDirection:'row', gap:8 },
  macroInputGroup: { flex:1 },
  autoCalories: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold, marginBottom:12, textAlign:'center' },
  modalBtns: { flexDirection:'row', gap:12, marginTop:8 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  mealChip: { paddingHorizontal:12, paddingVertical:6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight:6, borderWidth:1, borderColor: COLORS.darkBorder },
  mealChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  mealChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.medium },
  mealChipTextActive: { color: COLORS.white },
  modeToggle: { flexDirection:'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding:3, marginBottom:12 },
  modeBtn: { flex:1, paddingVertical:8, borderRadius: RADIUS.full, alignItems:'center' },
  modeBtnActive: { backgroundColor: COLORS.roseGold },
  modeBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  modeBtnTextActive: { color: COLORS.white },
  foodItem: { padding:10, borderRadius: RADIUS.md, borderWidth:1, borderColor: COLORS.darkBorder, marginBottom:4, flexDirection:'row', alignItems:'center', backgroundColor: COLORS.darkCard2 },
  foodItemSelected: { borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  foodItemName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  foodItemMacros: { color: COLORS.textMuted, fontSize:10, marginTop:2 },
  foodItemCat: { color: COLORS.roseGold, fontSize:10, ...FONTS.medium },
  gramsRow: { flexDirection:'row', gap:12, alignItems:'flex-start' },
  gramsPreview: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:10, minWidth:80, marginTop:22 },
  gramsPreviewVal: { fontSize:11, ...FONTS.semibold, marginBottom:2 },
});