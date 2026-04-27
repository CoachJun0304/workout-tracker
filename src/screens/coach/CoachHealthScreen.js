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
const MEAL_TYPES = ['Breakfast','Lunch','Dinner','Snack','Pre-workout','Post-workout','Other'];
const FOOD_CATEGORIES = ['Meat & Poultry','Fish & Seafood','Dairy','Eggs','Grains & Cereals',
  'Fruits','Vegetables','Legumes','Nuts & Seeds','Oils & Fats','Sweets','Beverages',
  'Fast Food','Supplements','Other'];

export default function CoachHealthScreen({ route }) {
  const { client } = route.params || {};
  const { profile } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];

  // Tab state
  const [tab, setTab] = useState('weight');

  // Data
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [macroLogs, setMacroLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [foodEntries, setFoodEntries] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalDate, setSelectedCalDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);

  // Weight modal
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [editingWeight, setEditingWeight] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightNotes, setWeightNotes] = useState('');
  const [weightDate, setWeightDate] = useState(todayStr);

  // Macro target modal
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInput, setTargetInput] = useState({ protein: '', carbs: '', fats: '' });

  // Feedback modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Food modals
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [showAddFoodLibModal, setShowAddFoodLibModal] = useState(false);
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [foodGrams, setFoodGrams] = useState('');
  const [foodMeal, setFoodMeal] = useState('Breakfast');
  const [foodDate, setFoodDate] = useState(todayStr);
  const [foodInputMode, setFoodInputMode] = useState('search');
  const [customFood, setCustomFood] = useState({
    name: '', brand: '', protein: '', carbs: '', fats: '', grams: '100'
  });
  const [newFoodLib, setNewFoodLib] = useState({
    name: '', brand: '', category: 'Other', serving_size_g: '100',
    protein_per_100g: '', carbs_per_100g: '', fats_per_100g: '',
    calories_per_100g: '', fiber_g: '', sugar_g: '',
  });

  const clientUnit = client?.unit_preference || 'kg';
  const ul = unitLabel(clientUnit);
  const isFemale = client?.gender === 'Female';

  useEffect(() => {
    if (client?.id) fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [wRes, mRes, tRes, fRes, cRes, feRes, flRes] = await Promise.all([
        supabase.from('weight_logs').select('*')
          .eq('client_id', client.id)
          .order('logged_at', { ascending: false }),
        supabase.from('macro_logs').select('*')
          .eq('client_id', client.id)
          .order('date', { ascending: false }).limit(30),
        supabase.from('macro_targets').select('*')
          .eq('client_id', client.id).single(),
        supabase.from('workout_feedback').select('*')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false }),
        supabase.from('menstrual_cycles').select('*')
          .eq('client_id', client.id)
          .order('cycle_start_date', { ascending: false }),
        supabase.from('food_entries').select('*')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false }),
        supabase.from('food_library').select('*').order('name'),
      ]);
      setWeightLogs(wRes.data || []);
      setMacroLogs(mRes.data || []);
      setMacroTargets(tRes.data || null);
      setFeedbacks(fRes.data || []);
      setCycles(cRes.data || []);
      setFoodEntries(feRes.data || []);
      setFoodLibrary(flRes.data || []);
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

  // ── WEIGHT ────────────────────────────────────────────

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

  // ── MACRO TARGETS ─────────────────────────────────────

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

  // ── FEEDBACK ─────────────────────────────────────────

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

  // ── FOOD ─────────────────────────────────────────────

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
    if (data) { setSelectedFood(data); setFoodInputMode('search'); }
  }

  async function saveFoodEntry() {
    setLoading(true);
    let entryData = null;

    if (foodInputMode === 'search' && selectedFood) {
      const macros = calcFoodMacros(selectedFood, foodGrams);
      entryData = {
        client_id: client.id,
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
        client_id: client.id,
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
      client_id: client.id,
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
          .eq('client_id', client.id).eq('date', date);
      } else {
        await supabase.from('macro_logs').upsert({
          client_id: client.id, date,
          protein_g: totals.protein, carbs_g: totals.carbs,
          fats_g: totals.fats, calories: totals.calories,
        }, { onConflict: 'client_id,date' });
      }
      fetchAll();
    }, null, 'Delete', true);
  }

  // ── CALENDAR HELPERS ──────────────────────────────────

  function getCalendarCells() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const phase = isFemale && cycles.length > 0
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

  const todayMacroLog = macroLogs.find(l => l.date === selectedCalDate);
  const selectedFoodEntries = foodEntries.filter(e => e.date === selectedCalDate);
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const tabs = ['weight', 'macros', 'food', 'feedback', ...(isFemale ? ['cycle'] : [])];
  const tabLabels = ['⚖️ Weight', '🥗 Macros', '🍽️ Food Log', '💬 Feedback', ...(isFemale ? ['🌸 Cycle'] : [])];

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
        style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ═══ WEIGHT TAB ═══ */}
        {tab === 'weight' && (
          <View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => {
                setEditingWeight(null);
                setWeightInput('');
                setWeightNotes('');
                setWeightDate(todayStr);
                setShowWeightModal(true);
              }}>
              <Text style={styles.actionBtnText}>+ Log Weigh-in for {client.name}</Text>
            </TouchableOpacity>

            {weightLogs.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyText}>No weight logs yet</Text></View>
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

        {/* ═══ MACROS TAB ═══ */}
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

            <Text style={styles.sectionTitle}>Recent Macro Logs</Text>
            {macroLogs.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyText}>No macro logs yet</Text></View>
              : macroLogs.slice(0, 14).map(log => (
                <View key={log.date} style={styles.macroLogRow}>
                  <Text style={styles.macroLogDate}>{log.date}</Text>
                  <View style={styles.macroLogValues}>
                    <Text style={[styles.macroLogVal, { color: '#FF6B6B' }]}>P:{log.protein_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: '#4ECDC4' }]}>C:{log.carbs_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: '#FFE66D' }]}>F:{log.fats_g}g</Text>
                    <Text style={[styles.macroLogVal, { color: COLORS.roseGold }]}>{log.calories}kcal</Text>
                  </View>
                  {macroTargets && (
                    <View style={[styles.macroStatusDot, {
                      backgroundColor:
                        log.calories / macroTargets.calories > 1.1 ? '#FF4B4B'
                        : log.calories / macroTargets.calories >= 0.85 ? '#00C896'
                        : '#FFB347'
                    }]} />
                  )}
                </View>
              ))
            }
          </View>
        )}

        {/* ═══ FOOD LOG TAB ═══ */}
        {tab === 'food' && (
          <View>
            {/* Date selector */}
            <View style={styles.foodDateRow}>
              <Text style={styles.foodDateLabel}>Logging for:</Text>
              <RNTextInput
                value={foodDate}
                onChangeText={setFoodDate}
                style={styles.foodDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted} />
            </View>

            <TouchableOpacity style={styles.actionBtn}
              onPress={() => {
                setFoodInputMode('search');
                setSelectedFood(null);
                setFoodSearch('');
                setFoodGrams('');
                setCustomFood({ name: '', brand: '', protein: '', carbs: '', fats: '', grams: '100' });
                setShowFoodModal(true);
              }}>
              <Text style={styles.actionBtnText}>+ Log Food for {client.name}</Text>
            </TouchableOpacity>

            {/* Today's macro summary */}
            {todayMacroLog && (
              <View style={styles.todayMacroCard}>
                <Text style={styles.todayMacroTitle}>
                  📊 {foodDate === todayStr ? "Today's" : foodDate} Totals
                </Text>
                <View style={styles.macroRow}>
                  {[
                    { label: 'Protein', val: todayMacroLog.protein_g, color: '#FF6B6B', target: macroTargets?.protein_g },
                    { label: 'Carbs', val: todayMacroLog.carbs_g, color: '#4ECDC4', target: macroTargets?.carbs_g },
                    { label: 'Fats', val: todayMacroLog.fats_g, color: '#FFE66D', target: macroTargets?.fats_g },
                    { label: 'kcal', val: todayMacroLog.calories, color: COLORS.roseGold, target: macroTargets?.calories },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill,
                      { backgroundColor: m.color + '22', borderColor: m.color }]}>
                      <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}</Text>
                      {m.target && (
                        <Text style={styles.macroTarget}>/ {m.target}</Text>
                      )}
                      <Text style={styles.macroPillLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Food entries grouped by meal */}
            {selectedFoodEntries.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No food logged for {foodDate}</Text>
                  <Text style={styles.emptySub}>Tap "+ Log Food" to add entries</Text>
                </View>
              : (() => {
                  const byMeal = {};
                  selectedFoodEntries.forEach(e => {
                    if (!byMeal[e.meal_type]) byMeal[e.meal_type] = [];
                    byMeal[e.meal_type].push(e);
                  });
                  return Object.entries(byMeal).map(([meal, entries]) => (
                    <View key={meal} style={styles.mealGroup}>
                      <View style={styles.mealGroupHeader}>
                        <Text style={styles.mealGroupTitle}>{meal}</Text>
                        <Text style={styles.mealGroupTotal}>
                          {entries.reduce((s, e) => s + (e.calories || 0), 0).toFixed(0)} kcal
                        </Text>
                      </View>
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
                    </View>
                  ));
                })()
            }

            {/* Recent food history */}
            <Text style={styles.sectionTitle}>Recent Food History</Text>
            {(() => {
              const byDate = {};
              foodEntries.forEach(e => {
                if (!byDate[e.date]) byDate[e.date] = [];
                byDate[e.date].push(e);
              });
              return Object.entries(byDate).slice(0, 7).map(([date, entries]) => {
                const totalCals = entries.reduce((s, e) => s + (e.calories || 0), 0);
                return (
                  <TouchableOpacity key={date} style={styles.historyDateRow}
                    onPress={() => setFoodDate(date)}>
                    <Text style={styles.historyDate}>{date}</Text>
                    <Text style={styles.historyEntries}>{entries.length} entries</Text>
                    <Text style={styles.historyCals}>{totalCals.toFixed(0)} kcal</Text>
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        )}

        {/* ═══ FEEDBACK TAB ═══ */}
        {tab === 'feedback' && (
          <View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => setShowFeedbackModal(true)}>
              <Text style={styles.actionBtnText}>+ Leave Feedback for {client.name}</Text>
            </TouchableOpacity>
            {feedbacks.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyText}>No feedback yet</Text></View>
              : feedbacks.map((fb, i) => (
                <View key={i} style={styles.feedbackCard}>
                  <Text style={styles.feedbackDate}>{fb.workout_date}</Text>
                  <Text style={styles.feedbackText}>{fb.feedback}</Text>
                </View>
              ))
            }
          </View>
        )}

        {/* ═══ CYCLE TAB ═══ */}
        {tab === 'cycle' && (
          <View>
            {!isFemale ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Not applicable</Text>
                <Text style={styles.emptySub}>Cycle tracking is only for female clients</Text>
              </View>
            ) : cycles.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No cycle data</Text>
                <Text style={styles.emptySub}>Client needs to log their period in their Health tab</Text>
              </View>
            ) : (
              <View>
                <View style={styles.cycleInfoCard}>
                  <Text style={styles.cycleInfoTitle}>🌸 Cycle Info</Text>
                  <Text style={styles.cycleInfoText}>Last period: {cycles[0].cycle_start_date}</Text>
                  <Text style={styles.cycleInfoText}>
                    Cycle: {cycles[0].cycle_length} days · Period: {cycles[0].period_length} days
                  </Text>
                </View>

                <View style={styles.phaseLegendRow}>
                  {Object.values(CYCLE_PHASES).map(ph => (
                    <View key={ph.name} style={styles.phaseLegendItem}>
                      <View style={[styles.legendDot, { backgroundColor: ph.color }]} />
                      <Text style={styles.legendText}>{ph.emoji} {ph.name.split(' ')[0]}</Text>
                    </View>
                  ))}
                </View>

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
                            borderColor: isToday ? COLORS.roseGold
                              : cell.phase ? cell.phase.color : COLORS.darkBorder,
                            borderWidth: isToday ? 2 : 1,
                          }]}>
                            <Text style={[styles.calCellDay, {
                              color: isToday ? COLORS.roseGold : COLORS.white
                            }]}>{cell.day}</Text>
                            {cell.phase && <Text style={{ fontSize: 5 }}>{cell.phase.emoji}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {Object.values(CYCLE_PHASES).map(phase => (
                  <View key={phase.name} style={[styles.phaseCard, { borderColor: phase.color }]}>
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

      {/* ═══ MACRO TARGET MODAL ═══ */}
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

      {/* ═══ FEEDBACK MODAL ═══ */}
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

      {/* ═══ FOOD LOG MODAL ═══ */}
      <Modal visible={showFoodModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>🍽️ Log Food for {client.name}</Text>
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

                  <TouchableOpacity style={styles.addToDatabaseBtn}
                    onPress={() => setShowAddFoodLibModal(true)}>
                    <Text style={styles.addToDatabaseBtnText}>
                      + Add new food to database
                    </Text>
                  </TouchableOpacity>

                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
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
                        <Text style={styles.noResultsText}>No results for "{foodSearch}"</Text>
                        <TouchableOpacity onPress={() => setShowAddFoodLibModal(true)}>
                          <Text style={styles.noResultsAdd}>
                            + Add "{foodSearch}" to database
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>

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
                  {(customFood.protein || customFood.carbs || customFood.fats) && (
                    <Text style={{ color: COLORS.roseGold, textAlign: 'center', marginBottom: 8 }}>
                      Total: {(
                        (parseFloat(customFood.protein) || 0) * 4 +
                        (parseFloat(customFood.carbs) || 0) * 4 +
                        (parseFloat(customFood.fats) || 0) * 9
                      ).toFixed(0)} kcal
                    </Text>
                  )}
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

      {/* ═══ ADD FOOD TO LIBRARY MODAL ═══ */}
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
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
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
  macroTarget: { fontSize: 9, color: COLORS.textMuted },
  macroLogRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder, flexDirection: 'row', alignItems: 'center' },
  macroLogDate: { color: COLORS.textSecondary, fontSize: SIZES.xs, width: 80 },
  macroLogValues: { flex: 1, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  macroLogVal: { fontSize: SIZES.xs, ...FONTS.semibold },
  macroStatusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },
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
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 1 },
  calCellInner: { flex: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  calCellDay: { fontSize: 9, ...FONTS.medium },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderLeftWidth: 3 },
  phaseTitle: { ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 6 },
  phaseRec: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 2 },

  // Food tab
  foodDateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  foodDateLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  foodDateInput: { flex: 1, color: COLORS.white, fontSize: SIZES.md, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  todayMacroCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  todayMacroTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  mealGroup: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  mealGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealGroupTitle: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
  mealGroupTotal: { color: COLORS.textMuted, fontSize: SIZES.xs },
  foodEntryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  foodEntryName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  foodEntryMacros: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  historyDateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 4 },
  historyDate: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold, flex: 1 },
  historyEntries: { color: COLORS.textMuted, fontSize: SIZES.xs, marginRight: 12 },
  historyCals: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.bold },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
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
});