import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, Dimensions, Platform, Svg
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { CYCLE_PHASES, getCurrentPhase, getPhaseForDate } from '../../data/cycleData';
import { showAlert, showConfirm } from '../../utils/webAlert';

const W = Dimensions.get('window').width;
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MEAL_TYPES = ['Breakfast','Lunch','Dinner','Snack','Pre-workout','Post-workout','Other'];
const FOOD_CATEGORIES = ['Meat & Poultry','Fish & Seafood','Dairy','Eggs','Grains & Cereals',
  'Fruits','Vegetables','Legumes','Nuts & Seeds','Oils & Fats','Sweets','Beverages','Fast Food',
  'Supplements','Other'];

export default function HealthScreen() {
  const { profile } = useAuth();
  const isFemale = profile?.gender === 'Female';
  const todayStr = new Date().toISOString().split('T')[0];

  // Main state
  const [mainTab, setMainTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [foodEntries, setFoodEntries] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState(todayStr);

  // Weight modals
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [editingWeight, setEditingWeight] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [weightDate, setWeightDate] = useState(todayStr);

  // Food modals
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [showAddFoodLibModal, setShowAddFoodLibModal] = useState(false);
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [foodGrams, setFoodGrams] = useState('');
  const [foodMeal, setFoodMeal] = useState('Breakfast');
  const [foodDate, setFoodDate] = useState(todayStr);
  const [foodInputMode, setFoodInputMode] = useState('search');
  const [newFoodLib, setNewFoodLib] = useState({
    name: '', brand: '', category: 'Other',
    serving_size_g: '100',
    protein_per_100g: '', carbs_per_100g: '',
    fats_per_100g: '', calories_per_100g: '',
    fiber_g: '', sugar_g: '',
  });
  const [customFood, setCustomFood] = useState({
    name: '', brand: '', protein: '', carbs: '', fats: '', grams: '100'
  });

  // Cycle modals
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [cycleInput, setCycleInput] = useState({
    start_date: '', cycle_length: '28', period_length: '5'
  });

  useEffect(() => { if (profile) fetchAll(); }, [profile]);

  async function fetchAll() {
    if (!profile) return;
    const [wRes, mRes, tRes, fRes, flRes, cRes] = await Promise.all([
      supabase.from('weight_logs').select('*')
        .eq('client_id', profile.id).order('logged_at', { ascending: true }),
      supabase.from('macro_logs').select('*')
        .eq('client_id', profile.id).order('date', { ascending: false }),
      supabase.from('macro_targets').select('*')
        .eq('client_id', profile.id).single(),
      supabase.from('food_entries').select('*')
        .eq('client_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('food_library').select('*').order('name'),
      supabase.from('menstrual_cycles').select('*')
        .eq('client_id', profile.id)
        .order('cycle_start_date', { ascending: false }),
    ]);
    setWeightLogs(wRes.data || []);
    setMacroLogs(mRes.data || []);
    setMacroTargets(tRes.data || null);
    setFoodEntries(fRes.data || []);
    setFoodLibrary(flRes.data || []);
    setCycles(cRes.data || []);
  }

  // ── WEIGHT ────────────────────────────────────────────

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
        logged_at: new Date(weightDate + 'T12:00:00').toISOString(),
      });
    }
    setLoading(false);
    setWeightInput(''); setWeightNotes('');
    setEditingWeight(null); setShowWeightModal(false);
    fetchAll();
  }

  async function deleteWeight(id) {
    showConfirm('Delete', 'Remove this weigh-in?', async () => {
      await supabase.from('weight_logs').delete().eq('id', id);
      fetchAll();
    }, null, 'Delete', true);
  }

  // ── FOOD & MACROS ────────────────────────────────────

  const filteredFoods = foodLibrary.filter(f =>
    f.name.toLowerCase().includes(foodSearch.toLowerCase()) ||
    (f.brand || '').toLowerCase().includes(foodSearch.toLowerCase())
  );

  function calcFoodMacros(food, grams) {
    const g = parseFloat(grams) || 0;
    return {
      protein: +((food.protein_per_100g * g) / 100).toFixed(1),
      carbs: +((food.carbs_per_100g * g) / 100).toFixed(1),
      fats: +((food.fats_per_100g * g) / 100).toFixed(1),
      calories: +((food.calories_per_100g * g) / 100).toFixed(0),
    };
  }

  async function saveFoodToLibrary() {
    if (!newFoodLib.name.trim()) { showAlert('Error', 'Food name required'); return; }
    setLoading(true);
    const { data, error } = await supabase.from('food_library').insert({
      name: newFoodLib.name.trim(),
      brand: newFoodLib.brand.trim() || null,
      category: newFoodLib.category,
      serving_size_g: parseFloat(newFoodLib.serving_size_g) || 100,
      protein_per_100g: parseFloat(newFoodLib.protein_per_100g) || 0,
      carbs_per_100g: parseFloat(newFoodLib.carbs_per_100g) || 0,
      fats_per_100g: parseFloat(newFoodLib.fats_per_100g) || 0,
      calories_per_100g: parseFloat(newFoodLib.calories_per_100g) || 0,
      fiber_g: parseFloat(newFoodLib.fiber_g) || 0,
      sugar_g: parseFloat(newFoodLib.sugar_g) || 0,
      is_custom: true,
      created_by: profile.id,
    }).select().single();
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }
    showAlert('✅ Food Added!', `${newFoodLib.name} saved to the food database`);
    setNewFoodLib({
      name: '', brand: '', category: 'Other', serving_size_g: '100',
      protein_per_100g: '', carbs_per_100g: '', fats_per_100g: '',
      calories_per_100g: '', fiber_g: '', sugar_g: '',
    });
    setShowAddFoodLibModal(false);
    fetchAll();
    // Auto-select newly added food
    if (data) { setSelectedFood(data); setFoodInputMode('search'); }
  }

  async function saveFoodEntry() {
    setLoading(true);
    let entryData = null;

    if (foodInputMode === 'search' && selectedFood) {
      const macros = calcFoodMacros(selectedFood, foodGrams);
      entryData = {
        client_id: profile.id,
        date: foodDate,
        food_name: selectedFood.name,
        brand: selectedFood.brand || null,
        grams: parseFloat(foodGrams),
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fats_g: macros.fats,
        calories: macros.calories,
        meal_type: foodMeal,
        food_library_id: selectedFood.id,
        serving_size_g: selectedFood.serving_size_g || 100,
      };
    } else if (foodInputMode === 'custom' && customFood.name) {
      const g = parseFloat(customFood.grams) || 100;
      const protein = parseFloat(customFood.protein) || 0;
      const carbs = parseFloat(customFood.carbs) || 0;
      const fats = parseFloat(customFood.fats) || 0;
      const cals = +(protein * 4 + carbs * 4 + fats * 9).toFixed(0);
      entryData = {
        client_id: profile.id,
        date: foodDate,
        food_name: customFood.name.trim(),
        brand: customFood.brand.trim() || null,
        grams: g,
        protein_g: protein,
        carbs_g: carbs,
        fats_g: fats,
        calories: cals,
        meal_type: foodMeal,
        serving_size_g: g,
      };
    }

    if (!entryData) { setLoading(false); return; }
    await supabase.from('food_entries').insert(entryData);

    // Recalculate macro_logs for this date
    const dayEntries = [...foodEntries.filter(e => e.date === foodDate), entryData];
    const totals = dayEntries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein_g || 0),
      carbs: acc.carbs + (e.carbs_g || 0),
      fats: acc.fats + (e.fats_g || 0),
      calories: acc.calories + (e.calories || 0),
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });

    await supabase.from('macro_logs').upsert({
      client_id: profile.id,
      logged_by: profile.id,
      date: foodDate,
      protein_g: +totals.protein.toFixed(1),
      carbs_g: +totals.carbs.toFixed(1),
      fats_g: +totals.fats.toFixed(1),
      calories: +totals.calories.toFixed(0),
    }, { onConflict: 'client_id,date' });

    setLoading(false);
    setShowFoodModal(false);
    setSelectedFood(null); setFoodGrams(''); setFoodSearch('');
    setCustomFood({ name: '', brand: '', protein: '', carbs: '', fats: '', grams: '100' });
    fetchAll();
  }

  async function deleteFoodEntry(id, date) {
    showConfirm('Delete', 'Remove this food entry?', async () => {
      await supabase.from('food_entries').delete().eq('id', id);
      const remaining = foodEntries.filter(e => e.id !== id && e.date === date);
      const totals = remaining.reduce((acc, e) => ({
        protein: acc.protein + (e.protein_g || 0),
        carbs: acc.carbs + (e.carbs_g || 0),
        fats: acc.fats + (e.fats_g || 0),
        calories: acc.calories + (e.calories || 0),
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
    }, null, 'Delete', true);
  }

  // ── CYCLE ────────────────────────────────────────────

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

  // ── CHART HELPERS ────────────────────────────────────

  function getWeightChartData() {
    return weightLogs.slice(-30);
  }

  function getMacroCalendarCells() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = macroLogs.find(l => l.date === dateStr);
      const phase = isFemale && cycles.length > 0
        ? getPhaseForDate(dateStr, cycles[0].cycle_start_date, cycles[0].cycle_length)
        : null;
      cells.push({ day: d, date: dateStr, log, phase });
    }
    return cells;
  }

  function getWeightCalendarCells() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = weightLogs.find(l => l.logged_at?.split('T')[0] === dateStr);
      cells.push({ day: d, date: dateStr, log });
    }
    return cells;
  }

  function getMacroColor(log) {
    if (!macroTargets || !log) return COLORS.darkCard;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B22';
    if (ratio >= 0.85) return '#00C89622';
    if (ratio >= 0.6) return '#FFB34722';
    return '#FF6B6B11';
  }

  function getMacroBorderColor(log) {
    if (!macroTargets || !log) return COLORS.darkBorder;
    const ratio = log.calories / macroTargets.calories;
    if (ratio > 1.1) return '#FF4B4B';
    if (ratio >= 0.85) return '#00C896';
    if (ratio >= 0.6) return '#FFB347';
    return '#FF6B6B';
  }

  function getWeeklyAvg() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekLogs = macroLogs.filter(l => new Date(l.date) >= weekAgo);
    if (!weekLogs.length) return null;
    const avg = (key) => (weekLogs.reduce((s, l) => s + (l[key] || 0), 0) / weekLogs.length).toFixed(0);
    return {
      days: weekLogs.length,
      protein: avg('protein_g'), carbs: avg('carbs_g'),
      fats: avg('fats_g'), calories: avg('calories'),
    };
  }

  // ── SVG CHARTS ────────────────────────────────────────

  function WeightLineChart() {
    const data = getWeightChartData();
    if (data.length < 2) return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>Log at least 2 weigh-ins to see chart</Text>
      </View>
    );
    const chartW = Math.min(W - 32, 500);
    const chartH = 160;
    const padL = 40, padR = 16, padT = 16, padB = 32;
    const values = data.map(d => d.weight_kg);
    const minV = Math.min(...values) - 1;
    const maxV = Math.max(...values) + 1;
    const scaleX = (i) => padL + (i / (data.length - 1)) * (chartW - padL - padR);
    const scaleY = (v) => padT + ((maxV - v) / (maxV - minV)) * (chartH - padT - padB);
    const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.weight_kg)}`).join(' ');
    const areaPoints = `${padL},${chartH - padB} ` + data.map((d, i) => `${scaleX(i)},${scaleY(d.weight_kg)}`).join(' ') + ` ${scaleX(data.length - 1)},${chartH - padB}`;

    return (
      <View style={{ alignItems: 'center' }}>
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = padT + t * (chartH - padT - padB);
            const val = (maxV - t * (maxV - minV)).toFixed(1);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y}
                  stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
                <text x={padL - 4} y={y + 4} fontSize="9" fill="#888" textAnchor="end">{val}</text>
              </g>
            );
          })}
          {/* Area fill */}
          <polygon points={areaPoints} fill={COLORS.roseGold} fillOpacity="0.1" />
          {/* Line */}
          <polyline points={points} fill="none" stroke={COLORS.roseGold} strokeWidth="2" strokeLinejoin="round" />
          {/* Dots */}
          {data.map((d, i) => (
            <circle key={i} cx={scaleX(i)} cy={scaleY(d.weight_kg)} r="3"
              fill={COLORS.roseGold} stroke={COLORS.darkCard} strokeWidth="1.5" />
          ))}
          {/* X labels */}
          {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map((d, i, arr) => {
            const origIdx = data.indexOf(d);
            return (
              <text key={i} x={scaleX(origIdx)} y={chartH - 4}
                fontSize="8" fill="#888" textAnchor="middle">
                {d.logged_at.split('T')[0].slice(5)}
              </text>
            );
          })}
        </svg>
      </View>
    );
  }

  function MacroBarChart() {
    const last7 = macroLogs.slice(0, 7).reverse();
    if (last7.length === 0) return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No macro data yet</Text>
      </View>
    );
    const chartW = Math.min(W - 32, 500);
    const chartH = 140;
    const padL = 36, padR = 8, padT = 8, padB = 28;
    const barW = ((chartW - padL - padR) / last7.length) * 0.22;
    const gap = ((chartW - padL - padR) / last7.length) * 0.04;
    const maxCal = Math.max(...last7.map(l => l.calories || 0), macroTargets?.calories || 1);
    const scaleY = (v) => padT + ((maxCal - v) / maxCal) * (chartH - padT - padB);
    const barColors = { protein_g: '#FF6B6B', carbs_g: '#4ECDC4', fats_g: '#FFE66D' };

    return (
      <View style={{ alignItems: 'center' }}>
        <svg width={chartW} height={chartH}>
          {/* Target line */}
          {macroTargets && (
            <line x1={padL} y1={scaleY(macroTargets.calories)}
              x2={chartW - padR} y2={scaleY(macroTargets.calories)}
              stroke={COLORS.roseGold} strokeWidth="1" strokeDasharray="4,3" />
          )}
          {last7.map((log, i) => {
            const x = padL + i * ((chartW - padL - padR) / last7.length);
            const macroKeys = ['protein_g', 'carbs_g', 'fats_g'];
            let stackY = chartH - padB;
            return (
              <g key={i}>
                {macroKeys.map((key, ki) => {
                  const val = log[key] || 0;
                  const calVal = key === 'protein_g' ? val * 4 : key === 'carbs_g' ? val * 4 : val * 9;
                  const h = (calVal / maxCal) * (chartH - padT - padB);
                  stackY -= h;
                  return (
                    <rect key={ki}
                      x={x + gap} y={stackY}
                      width={barW * 3} height={h}
                      fill={barColors[key]} rx="2" />
                  );
                })}
                <text x={x + barW * 1.5 + gap} y={chartH - 4}
                  fontSize="8" fill="#888" textAnchor="middle">
                  {log.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
        {/* Legend */}
        <View style={styles.chartLegend}>
          {[['#FF6B6B', 'Protein'], ['#4ECDC4', 'Carbs'], ['#FFE66D', 'Fats'],
            [COLORS.roseGold, 'Target']].map(([c, l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function MacroPieChart({ log }) {
    if (!log) return null;
    const protein_cal = (log.protein_g || 0) * 4;
    const carbs_cal = (log.carbs_g || 0) * 4;
    const fats_cal = (log.fats_g || 0) * 9;
    const total = protein_cal + carbs_cal + fats_cal;
    if (total === 0) return null;
    const cx = 60, cy = 60, r = 50;
    let startAngle = -Math.PI / 2;
    const slices = [
      { val: protein_cal, color: '#FF6B6B', label: 'P' },
      { val: carbs_cal, color: '#4ECDC4', label: 'C' },
      { val: fats_cal, color: '#FFE66D', label: 'F' },
    ];
    const paths = slices.map(slice => {
      const angle = (slice.val / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(startAngle + angle);
      const y2 = cy + r * Math.sin(startAngle + angle);
      const large = angle > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      const midAngle = startAngle + angle / 2;
      const lx = cx + (r * 0.65) * Math.cos(midAngle);
      const ly = cy + (r * 0.65) * Math.sin(midAngle);
      const pct = Math.round((slice.val / total) * 100);
      startAngle += angle;
      return { ...slice, path, lx, ly, pct };
    });

    return (
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <svg width={120} height={120}>
          {paths.map((p, i) => (
            <g key={i}>
              <path d={p.path} fill={p.color} />
              {p.pct > 5 && (
                <text x={p.lx} y={p.ly + 4} fontSize="9" fill="white"
                  textAnchor="middle" fontWeight="bold">{p.pct}%</text>
              )}
            </g>
          ))}
        </svg>
        <View style={styles.chartLegend}>
          {[['#FF6B6B', `P: ${log.protein_g}g`],
            ['#4ECDC4', `C: ${log.carbs_g}g`],
            ['#FFE66D', `F: ${log.fats_g}g`]].map(([c, l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── DERIVED DATA ─────────────────────────────────────

  const currentCycle = cycles.length > 0 ? cycles[0] : null;
  const currentPhaseData = currentCycle
    ? getCurrentPhase(currentCycle.cycle_start_date, currentCycle.cycle_length)
    : null;
  const weeklyAvg = getWeeklyAvg();
  const todayMacroLog = macroLogs.find(l => l.date === todayStr);
  const selectedMacroLog = macroLogs.find(l => l.date === selectedCalDate);
  const selectedFoodEntries = foodEntries.filter(e => e.date === selectedCalDate);
  const weightChange = weightLogs.length >= 2
    ? (weightLogs[weightLogs.length - 1].weight_kg - weightLogs[0].weight_kg).toFixed(1)
    : null;

  const mainTabs = ['weight', 'macros', ...(isFemale ? ['cycle'] : [])];
  const mainTabLabels = ['⚖️ Weight', '🥗 Macros', ...(isFemale ? ['🌸 Cycle'] : [])];

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
        {mainTabLabels.map((label, i) => (
          <TouchableOpacity key={i}
            style={[styles.tabBtn, mainTab === mainTabs[i] && styles.tabBtnActive]}
            onPress={() => setMainTab(mainTabs[i])}>
            <Text style={[styles.tabText, mainTab === mainTabs[i] && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ═══════════════════════════════════════════
            WEIGHT TAB
        ═══════════════════════════════════════════ */}
        {mainTab === 'weight' && (
          <View>
            {/* Summary cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {weightLogs.length > 0
                    ? `${weightLogs[weightLogs.length - 1].weight_kg}kg`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Current</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, {
                  color: weightChange > 0 ? COLORS.error
                    : weightChange < 0 ? COLORS.success : COLORS.white
                }]}>
                  {weightChange !== null
                    ? `${weightChange > 0 ? '+' : ''}${weightChange}kg`
                    : '—'}
                </Text>
                <Text style={styles.statLabel}>Total Change</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{weightLogs.length}</Text>
                <Text style={styles.statLabel}>Weigh-ins</Text>
              </View>
            </View>

            {/* Line chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>📈 Weight Trend</Text>
              <WeightLineChart />
            </View>

            {/* Log button */}
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => {
                setEditingWeight(null);
                setWeightInput('');
                setWeightNotes('');
                setWeightDate(todayStr);
                setShowWeightModal(true);
              }}>
              <Text style={styles.actionBtnText}>+ Log Weigh-in</Text>
            </TouchableOpacity>

            {/* Weight calendar */}
            <View style={styles.calendarCard}>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={() => setCalendarMonth(m =>
                  new Date(m.getFullYear(), m.getMonth() - 1))}>
                  <Text style={styles.calNavBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonthText}>
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
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
                {getWeightCalendarCells().map((cell, i) => {
                  if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                  const isToday = cell.date === todayStr;
                  const isSelected = cell.date === selectedCalDate;
                  const hasLog = !!cell.log;
                  return (
                    <TouchableOpacity key={cell.date} style={styles.calCell}
                      onPress={() => setSelectedCalDate(cell.date)}>
                      <View style={[styles.calCellInner, {
                        backgroundColor: hasLog ? COLORS.roseGold + '40'
                          : isSelected ? COLORS.darkCard2 : 'transparent',
                        borderColor: isSelected ? COLORS.roseGold
                          : isToday ? '#60A5FA' : COLORS.darkBorder,
                        borderWidth: isSelected || isToday ? 2 : 1,
                      }]}>
                        <Text style={[styles.calCellDay, {
                          color: isSelected ? COLORS.roseGold
                            : isToday ? '#60A5FA' : COLORS.white
                        }]}>{cell.day}</Text>
                        {hasLog && <View style={styles.calDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected date weight */}
            {selectedCalDate && (() => {
              const log = weightLogs.find(l => l.logged_at?.split('T')[0] === selectedCalDate);
              return (
                <View style={styles.selectedDateCard}>
                  <Text style={styles.selectedDateTitle}>
                    {new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('en-US',
                      { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                  {log ? (
                    <View style={styles.selectedWeightRow}>
                      <Text style={styles.selectedWeight}>{log.weight_kg} kg</Text>
                      {log.notes && <Text style={styles.selectedNote}>{log.notes}</Text>}
                      <View style={styles.selectedActions}>
                        <TouchableOpacity style={styles.editBtn}
                          onPress={() => {
                            setEditingWeight(log);
                            setWeightInput(String(log.weight_kg));
                            setWeightNotes(log.notes || '');
                            setWeightDate(selectedCalDate);
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
                  ) : (
                    <TouchableOpacity style={styles.logForDateBtn}
                      onPress={() => {
                        setEditingWeight(null);
                        setWeightInput('');
                        setWeightNotes('');
                        setWeightDate(selectedCalDate);
                        setShowWeightModal(true);
                      }}>
                      <Text style={styles.logForDateBtnText}>+ Log weight for this day</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            {/* Recent logs */}
            <Text style={styles.sectionTitle}>Recent Weigh-ins</Text>
            {weightLogs.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No weigh-ins yet</Text>
                </View>
              : [...weightLogs].reverse().slice(0, 10).map((log, i, arr) => {
                  const prev = arr[i + 1];
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
                        <Text style={styles.logWeight}>{log.weight_kg}kg</Text>
                        {diff !== null && (
                          <Text style={[styles.logDiff, {
                            color: diff > 0 ? COLORS.error : diff < 0 ? COLORS.success : COLORS.textMuted
                          }]}>
                            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)}kg
                          </Text>
                        )}
                      </View>
                      <View style={styles.logActions}>
                        <TouchableOpacity style={styles.editBtn}
                          onPress={() => {
                            setEditingWeight(log);
                            setWeightInput(String(log.weight_kg));
                            setWeightNotes(log.notes || '');
                            setWeightDate(log.logged_at?.split('T')[0] || todayStr);
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

        {/* ═══════════════════════════════════════════
            MACROS TAB
        ═══════════════════════════════════════════ */}
        {mainTab === 'macros' && (
          <View>
            {/* Targets */}
            {macroTargets && (
              <View style={styles.targetsCard}>
                <Text style={styles.targetsTitle}>🎯 Daily Targets</Text>
                <View style={styles.macroRow}>
                  {[
                    { label: 'Protein', val: macroTargets.protein_g, color: '#FF6B6B', unit: 'g' },
                    { label: 'Carbs', val: macroTargets.carbs_g, color: '#4ECDC4', unit: 'g' },
                    { label: 'Fats', val: macroTargets.fats_g, color: '#FFE66D', unit: 'g' },
                    { label: 'Calories', val: macroTargets.calories, color: COLORS.roseGold, unit: 'kcal' },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill,
                      { backgroundColor: m.color + '22', borderColor: m.color }]}>
                      <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}</Text>
                      <Text style={styles.macroPillLabel}>{m.unit}</Text>
                      <Text style={styles.macroPillName}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Weekly summary */}
            {weeklyAvg && (
              <View style={styles.weeklyCard}>
                <Text style={styles.weeklyTitle}>📅 7-Day Average ({weeklyAvg.days} days logged)</Text>
                <View style={styles.macroRow}>
                  {[
                    { label: 'P', val: weeklyAvg.protein, color: '#FF6B6B' },
                    { label: 'C', val: weeklyAvg.carbs, color: '#4ECDC4' },
                    { label: 'F', val: weeklyAvg.fats, color: '#FFE66D' },
                    { label: 'kcal', val: weeklyAvg.calories, color: COLORS.roseGold },
                  ].map(m => (
                    <View key={m.label} style={styles.weeklyPill}>
                      <Text style={[styles.weeklyVal, { color: m.color }]}>{m.val}</Text>
                      <Text style={styles.weeklyLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Bar chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>📊 7-Day Macro Breakdown</Text>
              <MacroBarChart />
            </View>

            {/* Calendar */}
            <View style={styles.calendarCard}>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={() => setCalendarMonth(m =>
                  new Date(m.getFullYear(), m.getMonth() - 1))}>
                  <Text style={styles.calNavBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonthText}>
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={() => setCalendarMonth(m =>
                  new Date(m.getFullYear(), m.getMonth() + 1))}>
                  <Text style={styles.calNavBtn}>›</Text>
                </TouchableOpacity>
              </View>
              {/* Color legend */}
              <View style={styles.macroLegendRow}>
                {[['#00C896', 'On target'], ['#FFB347', 'Under'], ['#FF4B4B', 'Over'], ['#555', 'No log']].map(([c, l]) => (
                  <View key={l} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c }]} />
                    <Text style={styles.legendText}>{l}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.calDayHeaders}>
                {DAYS_OF_WEEK.map(d => (
                  <Text key={d} style={styles.calDayHeader}>{d}</Text>
                ))}
              </View>
              <View style={styles.calGrid}>
                {getMacroCalendarCells().map((cell, i) => {
                  if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                  const isToday = cell.date === todayStr;
                  const isSelected = cell.date === selectedCalDate;
                  const bgColor = cell.log ? getMacroColor(cell.log) : 'transparent';
                  const borderColor = isSelected ? COLORS.roseGold
                    : isToday ? '#60A5FA'
                    : cell.log ? getMacroBorderColor(cell.log) : COLORS.darkBorder;
                  return (
                    <TouchableOpacity key={cell.date} style={styles.calCell}
                      onPress={() => setSelectedCalDate(cell.date)}>
                      <View style={[styles.calCellInner, {
                        backgroundColor: bgColor,
                        borderColor,
                        borderWidth: isSelected || isToday ? 2 : 1,
                      }]}>
                        <Text style={[styles.calCellDay, {
                          color: isSelected ? COLORS.roseGold
                            : isToday ? '#60A5FA' : COLORS.white
                        }]}>{cell.day}</Text>
                        {cell.phase && (
                          <Text style={{ fontSize: 5 }}>{cell.phase.emoji}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected date macros */}
            <View style={styles.selectedDateCard}>
              <Text style={styles.selectedDateTitle}>
                {new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('en-US',
                  { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>

              {selectedMacroLog ? (
                <View>
                  <MacroPieChart log={selectedMacroLog} />
                  <View style={styles.macroTotalsRow}>
                    {[
                      { label: 'Protein', val: selectedMacroLog.protein_g, color: '#FF6B6B', target: macroTargets?.protein_g },
                      { label: 'Carbs', val: selectedMacroLog.carbs_g, color: '#4ECDC4', target: macroTargets?.carbs_g },
                      { label: 'Fats', val: selectedMacroLog.fats_g, color: '#FFE66D', target: macroTargets?.fats_g },
                      { label: 'Calories', val: selectedMacroLog.calories, color: COLORS.roseGold, target: macroTargets?.calories },
                    ].map(m => (
                      <View key={m.label} style={styles.macroTotalCard}>
                        <Text style={[styles.macroTotalVal, { color: m.color }]}>{m.val}</Text>
                        {m.target && (
                          <Text style={styles.macroTotalTarget}>/ {m.target}</Text>
                        )}
                        <Text style={styles.macroTotalLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={styles.noDataText}>No food logged this day</Text>
              )}

              <TouchableOpacity style={styles.actionBtn}
                onPress={() => {
                  setFoodDate(selectedCalDate);
                  setFoodInputMode('search');
                  setSelectedFood(null);
                  setFoodSearch('');
                  setFoodGrams('');
                  setShowFoodModal(true);
                }}>
                <Text style={styles.actionBtnText}>+ Log Food for this Day</Text>
              </TouchableOpacity>

              {/* Food entries for selected date grouped by meal */}
              {selectedFoodEntries.length > 0 && (() => {
                const byMeal = {};
                selectedFoodEntries.forEach(e => {
                  if (!byMeal[e.meal_type]) byMeal[e.meal_type] = [];
                  byMeal[e.meal_type].push(e);
                });
                return Object.entries(byMeal).map(([meal, entries]) => (
                  <View key={meal} style={styles.mealGroup}>
                    <Text style={styles.mealGroupTitle}>{meal}</Text>
                    {entries.map(entry => (
                      <View key={entry.id} style={styles.foodEntryRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.foodEntryName}>
                            {entry.food_name}
                            {entry.brand ? ` · ${entry.brand}` : ''}
                          </Text>
                          <Text style={styles.foodEntryMacros}>
                            {entry.grams}g · P:{entry.protein_g}g C:{entry.carbs_g}g F:{entry.fats_g}g · {entry.calories}kcal
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.delBtn}
                          onPress={() => deleteFoodEntry(entry.id, entry.date)}>
                          <Text>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <Text style={styles.mealTotal}>
                      Total: {entries.reduce((s, e) => s + (e.calories || 0), 0).toFixed(0)} kcal
                    </Text>
                  </View>
                ));
              })()}
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════
            CYCLE TAB
        ═══════════════════════════════════════════ */}
        {mainTab === 'cycle' && isFemale && (
          <View>
            {currentPhaseData && (
              <View style={[styles.phaseCard, { borderColor: currentPhaseData.color }]}>
                <Text style={styles.phaseEmoji}>{currentPhaseData.emoji}</Text>
                <Text style={[styles.phaseName, { color: currentPhaseData.color }]}>
                  {currentPhaseData.name}
                </Text>
                <Text style={styles.phaseDays}>Day {currentPhaseData.dayInPhase} of phase</Text>
                <Text style={styles.phaseDesc}>{currentPhaseData.description}</Text>
                <TouchableOpacity style={styles.phaseMoreBtn}
                  onPress={() => { setSelectedPhase(currentPhaseData); setShowPhaseModal(true); }}>
                  <Text style={styles.phaseMoreBtnText}>View Recommendations →</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.actionBtn}
              onPress={() => setShowCycleModal(true)}>
              <Text style={styles.actionBtnText}>+ Log Period Start</Text>
            </TouchableOpacity>

            {/* Phase legend */}
            <View style={styles.phaseLegendRow}>
              {Object.values(CYCLE_PHASES).map(ph => (
                <TouchableOpacity key={ph.name} style={styles.phaseLegendItem}
                  onPress={() => { setSelectedPhase(ph); setShowPhaseModal(true); }}>
                  <View style={[styles.legendDot, { backgroundColor: ph.color }]} />
                  <Text style={styles.legendText}>{ph.emoji} {ph.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cycle calendar */}
            <View style={styles.calendarCard}>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={() => setCalendarMonth(m =>
                  new Date(m.getFullYear(), m.getMonth() - 1))}>
                  <Text style={styles.calNavBtn}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonthText}>
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
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
                {getMacroCalendarCells().map((cell, i) => {
                  if (!cell) return <View key={`e${i}`} style={styles.calCell} />;
                  const isToday = cell.date === todayStr;
                  return (
                    <TouchableOpacity key={cell.date} style={styles.calCell}
                      onPress={() => {
                        if (cell.phase) {
                          setSelectedPhase(cell.phase);
                          setShowPhaseModal(true);
                        }
                      }}>
                      <View style={[styles.calCellInner, {
                        backgroundColor: cell.phase ? cell.phase.color + '40' : 'transparent',
                        borderColor: isToday ? COLORS.roseGold
                          : cell.phase ? cell.phase.color : COLORS.darkBorder,
                        borderWidth: isToday ? 2 : 1,
                      }]}>
                        <Text style={[styles.calCellDay, {
                          color: isToday ? COLORS.roseGold : COLORS.white
                        }]}>{cell.day}</Text>
                        {cell.phase && <Text style={{ fontSize: 5 }}>{cell.phase.emoji}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Phase recommendation cards */}
            {Object.values(CYCLE_PHASES).map(phase => (
              <TouchableOpacity key={phase.name}
                style={[styles.phaseRecCard, { borderColor: phase.color }]}
                onPress={() => { setSelectedPhase(phase); setShowPhaseModal(true); }}>
                <Text style={[styles.phaseRecTitle, { color: phase.color }]}>
                  {phase.emoji} {phase.name}
                </Text>
                <Text style={styles.phaseRecSub}>Days {phase.days}</Text>
                <Text style={styles.phaseRecPreview}>
                  💪 {phase.workoutRecommendations[0]}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Cycle history */}
            {cycles.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>Cycle History</Text>
                {cycles.map((c, i) => (
                  <View key={i} style={styles.cycleHistoryRow}>
                    <Text style={styles.cycleHistoryDate}>
                      🔴 {c.cycle_start_date}
                    </Text>
                    <Text style={styles.cycleHistoryDetail}>
                      {c.cycle_length} day cycle · {c.period_length} day period
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* ═══ WEIGHT MODAL ═══ */}
      <Modal visible={showWeightModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingWeight ? '✏️ Edit Weigh-in' : '⚖️ Log Weigh-in'}
            </Text>
            <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
            <RNTextInput value={weightDate} onChangeText={setWeightDate}
              style={styles.modalInput} placeholder="2026-04-22"
              placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Weight (kg)</Text>
            <RNTextInput value={weightInput} onChangeText={setWeightInput}
              style={styles.modalInput} placeholder="0.0"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <RNTextInput value={weightNotes} onChangeText={setWeightNotes}
              style={styles.modalInput} placeholder="e.g. After morning workout"
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

      {/* ═══ FOOD MODAL ═══ */}
      <Modal visible={showFoodModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>🥗 Log Food</Text>
              <Text style={styles.modalSubtitle}>📅 {foodDate}</Text>

              {/* Meal type */}
              <Text style={styles.modalLabel}>Meal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}>
                {MEAL_TYPES.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.chip, foodMeal === m && styles.chipActive]}
                    onPress={() => setFoodMeal(m)}>
                    <Text style={[styles.chipText, foodMeal === m && styles.chipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, foodInputMode === 'search' && styles.modeBtnActive]}
                  onPress={() => setFoodInputMode('search')}>
                  <Text style={[styles.modeBtnText, foodInputMode === 'search' && styles.modeBtnTextActive]}>
                    🔍 Search Database
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, foodInputMode === 'custom' && styles.modeBtnActive]}
                  onPress={() => setFoodInputMode('custom')}>
                  <Text style={[styles.modeBtnText, foodInputMode === 'custom' && styles.modeBtnTextActive]}>
                    ✏️ Manual Entry
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Search mode */}
              {foodInputMode === 'search' && (
                <View>
                  <RNTextInput value={foodSearch} onChangeText={setFoodSearch}
                    style={styles.searchInput}
                    placeholder="Search food or brand..."
                    placeholderTextColor={COLORS.textMuted} />

                  {/* Add to database button */}
                  <TouchableOpacity style={styles.addToDatabaseBtn}
                    onPress={() => setShowAddFoodLibModal(true)}>
                    <Text style={styles.addToDatabaseBtnText}>
                      + Add new food to database
                    </Text>
                  </TouchableOpacity>

                  {/* Search results */}
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {filteredFoods.map(food => (
                      <TouchableOpacity key={food.id}
                        style={[styles.foodResultItem,
                          selectedFood?.id === food.id && styles.foodResultItemActive]}
                        onPress={() => {
                          setSelectedFood(food);
                          setFoodGrams(String(food.serving_size_g || 100));
                        }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.foodResultName}>{food.name}</Text>
                          {food.brand && (
                            <Text style={styles.foodResultBrand}>{food.brand}</Text>
                          )}
                          <Text style={styles.foodResultMacros}>
                            {food.category} · P:{food.protein_per_100g}g C:{food.carbs_per_100g}g F:{food.fats_per_100g}g per 100g
                          </Text>
                        </View>
                        {food.is_custom && (
                          <View style={styles.customBadge}>
                            <Text style={styles.customBadgeText}>Custom</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                    {filteredFoods.length === 0 && foodSearch.length > 0 && (
                      <View style={styles.noResults}>
                        <Text style={styles.noResultsText}>
                          No results for "{foodSearch}"
                        </Text>
                        <TouchableOpacity onPress={() => setShowAddFoodLibModal(true)}>
                          <Text style={styles.noResultsAdd}>
                            + Add "{foodSearch}" to database
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>

                  {/* Selected food details */}
                  {selectedFood && (
                    <View style={styles.selectedFoodCard}>
                      <Text style={styles.selectedFoodName}>{selectedFood.name}</Text>
                      {selectedFood.brand && (
                        <Text style={styles.selectedFoodBrand}>{selectedFood.brand}</Text>
                      )}
                      <Text style={styles.modalLabel}>Grams</Text>
                      <RNTextInput value={foodGrams} onChangeText={setFoodGrams}
                        style={styles.modalInput} placeholder="100"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                      {foodGrams && (
                        <View style={styles.calcMacrosRow}>
                          {(() => {
                            const m = calcFoodMacros(selectedFood, foodGrams);
                            return [
                              { label: 'P', val: m.protein, color: '#FF6B6B' },
                              { label: 'C', val: m.carbs, color: '#4ECDC4' },
                              { label: 'F', val: m.fats, color: '#FFE66D' },
                              { label: 'kcal', val: m.calories, color: COLORS.roseGold },
                            ].map(x => (
                              <View key={x.label} style={styles.calcMacroPill}>
                                <Text style={[styles.calcMacroVal, { color: x.color }]}>
                                  {x.val}
                                </Text>
                                <Text style={styles.calcMacroLabel}>{x.label}</Text>
                              </View>
                            ));
                          })()}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Custom/manual mode */}
              {foodInputMode === 'custom' && (
                <View>
                  <Text style={styles.modalLabel}>Food Name *</Text>
                  <RNTextInput value={customFood.name}
                    onChangeText={v => setCustomFood(f => ({ ...f, name: v }))}
                    style={styles.modalInput} placeholder="e.g. Chicken Adobo"
                    placeholderTextColor={COLORS.textMuted} />
                  <Text style={styles.modalLabel}>Brand (optional)</Text>
                  <RNTextInput value={customFood.brand}
                    onChangeText={v => setCustomFood(f => ({ ...f, brand: v }))}
                    style={styles.modalInput} placeholder="e.g. Jollibee"
                    placeholderTextColor={COLORS.textMuted} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { label: 'Grams', field: 'grams', placeholder: '100' },
                      { label: 'Protein (g)', field: 'protein', placeholder: '0' },
                      { label: 'Carbs (g)', field: 'carbs', placeholder: '0' },
                      { label: 'Fats (g)', field: 'fats', placeholder: '0' },
                    ].map(f => (
                      <View key={f.field} style={{ flex: 1 }}>
                        <Text style={styles.modalLabel}>{f.label}</Text>
                        <RNTextInput value={customFood[f.field]}
                          onChangeText={v => setCustomFood(cf => ({ ...cf, [f.field]: v }))}
                          style={styles.modalInput} placeholder={f.placeholder}
                          placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                      </View>
                    ))}
                  </View>
                  {customFood.protein || customFood.carbs || customFood.fats ? (
                    <Text style={{ color: COLORS.roseGold, textAlign: 'center', marginBottom: 8 }}>
                      Total: {(
                        (parseFloat(customFood.protein) || 0) * 4 +
                        (parseFloat(customFood.carbs) || 0) * 4 +
                        (parseFloat(customFood.fats) || 0) * 9
                      ).toFixed(0)} kcal
                    </Text>
                  ) : null}
                  <TouchableOpacity style={styles.saveToDbBtn}
                    onPress={() => {
                      setNewFoodLib({
                        name: customFood.name,
                        brand: customFood.brand,
                        category: 'Other',
                        serving_size_g: customFood.grams || '100',
                        protein_per_100g: customFood.grams
                          ? String((parseFloat(customFood.protein || 0) / parseFloat(customFood.grams || 100) * 100).toFixed(1))
                          : customFood.protein,
                        carbs_per_100g: customFood.grams
                          ? String((parseFloat(customFood.carbs || 0) / parseFloat(customFood.grams || 100) * 100).toFixed(1))
                          : customFood.carbs,
                        fats_per_100g: customFood.grams
                          ? String((parseFloat(customFood.fats || 0) / parseFloat(customFood.grams || 100) * 100).toFixed(1))
                          : customFood.fats,
                        calories_per_100g: customFood.grams
                          ? String(((parseFloat(customFood.protein || 0) * 4 + parseFloat(customFood.carbs || 0) * 4 + parseFloat(customFood.fats || 0) * 9) / parseFloat(customFood.grams || 100) * 100).toFixed(0))
                          : '0',
                        fiber_g: '0', sugar_g: '0',
                      });
                      setShowAddFoodLibModal(true);
                    }}>
                    <Text style={styles.saveToDbBtnText}>
                      💾 Save to food database for future use
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowFoodModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveFoodEntry} disabled={loading}>
                  <Text style={styles.modalSaveText}>{loading ? '...' : 'Log Food'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ ADD TO FOOD LIBRARY MODAL ═══ */}
      <Modal visible={showAddFoodLibModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>➕ Add Food to Database</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 16 }}>
                This food will be available for all users to search and use
              </Text>

              {[
                { label: 'Food Name *', field: 'name', placeholder: 'e.g. Chicken Breast', type: 'default' },
                { label: 'Brand (optional)', field: 'brand', placeholder: 'e.g. Monterey', type: 'default' },
                { label: 'Serving Size (g)', field: 'serving_size_g', placeholder: '100', type: 'numeric' },
                { label: 'Protein per 100g', field: 'protein_per_100g', placeholder: '0', type: 'numeric' },
                { label: 'Carbs per 100g', field: 'carbs_per_100g', placeholder: '0', type: 'numeric' },
                { label: 'Fats per 100g', field: 'fats_per_100g', placeholder: '0', type: 'numeric' },
                { label: 'Calories per 100g', field: 'calories_per_100g', placeholder: '0', type: 'numeric' },
                { label: 'Fiber per 100g (optional)', field: 'fiber_g', placeholder: '0', type: 'numeric' },
                { label: 'Sugar per 100g (optional)', field: 'sugar_g', placeholder: '0', type: 'numeric' },
              ].map(f => (
                <View key={f.field}>
                  <Text style={styles.modalLabel}>{f.label}</Text>
                  <RNTextInput value={newFoodLib[f.field]}
                    onChangeText={v => setNewFoodLib(n => ({ ...n, [f.field]: v }))}
                    style={styles.modalInput}
                    placeholder={f.placeholder}
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType={f.type} />
                </View>
              ))}

              <Text style={styles.modalLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}>
                {FOOD_CATEGORIES.map(c => (
                  <TouchableOpacity key={c}
                    style={[styles.chip, newFoodLib.category === c && styles.chipActive]}
                    onPress={() => setNewFoodLib(n => ({ ...n, category: c }))}>
                    <Text style={[styles.chipText, newFoodLib.category === c && styles.chipTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowAddFoodLibModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveFoodToLibrary} disabled={loading}>
                  <Text style={styles.modalSaveText}>{loading ? '...' : 'Add to Database'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ CYCLE MODAL ═══ */}
      <Modal visible={showCycleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🌸 Log Period</Text>
            <Text style={styles.modalLabel}>Period Start Date (YYYY-MM-DD)</Text>
            <RNTextInput value={cycleInput.start_date}
              onChangeText={v => setCycleInput(c => ({ ...c, start_date: v }))}
              style={styles.modalInput} placeholder="e.g. 2026-04-22"
              placeholderTextColor={COLORS.textMuted} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Cycle Length (days)</Text>
                <RNTextInput value={cycleInput.cycle_length}
                  onChangeText={v => setCycleInput(c => ({ ...c, cycle_length: v }))}
                  style={styles.modalInput} placeholder="28"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Period Length (days)</Text>
                <RNTextInput value={cycleInput.period_length}
                  onChangeText={v => setCycleInput(c => ({ ...c, period_length: v }))}
                  style={styles.modalInput} placeholder="5"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowCycleModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveCycle} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ PHASE DETAIL MODAL ═══ */}
      <Modal visible={showPhaseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ScrollView>
              {selectedPhase && (
                <View>
                  <Text style={[styles.modalTitle, { color: selectedPhase.color }]}>
                    {selectedPhase.emoji} {selectedPhase.name}
                  </Text>
                  <Text style={styles.phaseDays}>Days {selectedPhase.days}</Text>
                  <Text style={styles.phaseDesc}>{selectedPhase.description}</Text>

                  <Text style={styles.phaseSection}>💪 Workout Recommendations</Text>
                  {selectedPhase.workoutRecommendations?.map((r, i) => (
                    <Text key={i} style={styles.phaseItem}>• {r}</Text>
                  ))}

                  <Text style={styles.phaseSection}>🥗 Nutrition Tips</Text>
                  {selectedPhase.nutritionTips?.map((r, i) => (
                    <Text key={i} style={styles.phaseItem}>• {r}</Text>
                  ))}

                  <Text style={styles.phaseSection}>⚖️ Weight Note</Text>
                  <Text style={styles.phaseItem}>{selectedPhase.weightNote}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowPhaseModal(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  tabScroll: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  tabBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tabText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.xs },
  tabTextActive: { color: COLORS.white },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  actionBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  actionBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  statValue: { fontSize: SIZES.lg, ...FONTS.bold, color: COLORS.white },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  chartCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder, overflow: 'hidden' },
  chartTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  chartEmpty: { alignItems: 'center', padding: 24 },
  chartEmptyText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  logDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  logNotes: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  logRight: { alignItems: 'flex-end', marginRight: 8 },
  logWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.lg },
  logDiff: { fontSize: SIZES.sm, ...FONTS.medium },
  logActions: { flexDirection: 'row', gap: 4 },
  editBtn: { padding: 6, backgroundColor: COLORS.darkCard2, borderRadius: 6 },
  delBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: 6 },
  calendarCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder, maxWidth: 420, alignSelf: 'center', width: '100%' },
  calNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calNavBtn: { color: COLORS.roseGold, fontSize: 24, ...FONTS.bold, paddingHorizontal: 8 },
  calMonthText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  calDayHeaders: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 9, ...FONTS.semibold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 1.5 },
  calCellInner: { flex: 1, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  calCellDay: { fontSize: 10, ...FONTS.medium },
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.roseGold, marginTop: 1 },
  macroLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, justifyContent: 'center' },
  selectedDateCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  selectedDateTitle: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  selectedWeightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedWeight: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xxl },
  selectedNote: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.sm },
  selectedActions: { flexDirection: 'row', gap: 6 },
  logForDateBtn: { padding: 12, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md, alignItems: 'center' },
  logForDateBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  noDataText: { color: COLORS.textMuted, fontSize: SIZES.sm, textAlign: 'center', marginBottom: 12 },
  targetsCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  targetsTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroPill: { flex: 1, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1 },
  macroPillValue: { fontSize: SIZES.md, ...FONTS.bold },
  macroPillLabel: { fontSize: 9, color: COLORS.textMuted },
  macroPillName: { fontSize: 9, color: COLORS.textMuted },
  weeklyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  weeklyTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom: 8 },
  weeklyPill: { flex: 1, alignItems: 'center' },
  weeklyVal: { fontSize: SIZES.lg, ...FONTS.bold },
  weeklyLabel: { fontSize: 9, color: COLORS.textMuted },
  macroTotalsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  macroTotalCard: { flex: 1, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 8, alignItems: 'center' },
  macroTotalVal: { fontSize: SIZES.md, ...FONTS.bold },
  macroTotalTarget: { fontSize: 9, color: COLORS.textMuted },
  macroTotalLabel: { fontSize: 9, color: COLORS.textMuted },
  mealGroup: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  mealGroupTitle: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 8 },
  foodEntryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  foodEntryName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  foodEntryMacros: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  mealTotal: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, marginTop: 8, textAlign: 'right' },
  phaseCard: { borderRadius: RADIUS.lg, padding: 20, marginBottom: 16, borderWidth: 2, backgroundColor: COLORS.darkCard, alignItems: 'center' },
  phaseEmoji: { fontSize: 40, marginBottom: 8 },
  phaseName: { fontSize: SIZES.xl, ...FONTS.bold, marginBottom: 4 },
  phaseDays: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8 },
  phaseDesc: { color: COLORS.textSecondary, fontSize: SIZES.sm, textAlign: 'center', lineHeight: 20, marginBottom: 12 },
  phaseMoreBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.darkBorder },
  phaseMoreBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  phaseLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, justifyContent: 'center' },
  phaseLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phaseRecCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderLeftWidth: 4 },
  phaseRecTitle: { ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 2 },
  phaseRecSub: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 4 },
  phaseRecPreview: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  cycleHistoryRow: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 6 },
  cycleHistoryDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  cycleHistoryDetail: { color: COLORS.textMuted, fontSize: SIZES.xs },
  phaseSection: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginTop: 16, marginBottom: 8 },
  phaseItem: { color: COLORS.textSecondary, fontSize: SIZES.sm, lineHeight: 22, marginBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 4 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  modeToggle: { flexDirection: 'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding: 3, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.full, alignItems: 'center' },
  modeBtnActive: { backgroundColor: COLORS.roseGold },
  modeBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  modeBtnTextActive: { color: COLORS.white },
  searchInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  addToDatabaseBtn: { alignItems: 'center', marginBottom: 8, padding: 8 },
  addToDatabaseBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  foodResultItem: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: COLORS.darkBorder, flexDirection: 'row', alignItems: 'center' },
  foodResultItemActive: { borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  foodResultName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  foodResultBrand: { color: COLORS.roseGold, fontSize: SIZES.xs },
  foodResultMacros: { color: COLORS.textMuted, fontSize: SIZES.xs },
  customBadge: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  customBadgeText: { color: COLORS.roseGold, fontSize: 9 },
  noResults: { padding: 16, alignItems: 'center' },
  noResultsText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  noResultsAdd: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold, marginTop: 8 },
  selectedFoodCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginTop: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  selectedFoodName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  selectedFoodBrand: { color: COLORS.roseGold, fontSize: SIZES.xs, marginBottom: 8 },
  calcMacrosRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  calcMacroPill: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  calcMacroVal: { fontSize: SIZES.md, ...FONTS.bold },
  calcMacroLabel: { fontSize: 9, color: COLORS.textMuted },
  saveToDbBtn: { borderWidth: 1, borderColor: COLORS.roseGoldMid, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', marginBottom: 12 },
  saveToDbBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipTextActive: { color: COLORS.white },
  empty: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.textMuted, fontSize: SIZES.sm },
});