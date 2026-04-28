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
const ACTIVITY_MULTIPLIERS = {
  sedentary: { label: 'Sedentary', desc: 'Little or no exercise', mult: 1.2 },
  light: { label: 'Lightly Active', desc: '1-3 days/week', mult: 1.375 },
  moderate: { label: 'Moderately Active', desc: '3-5 days/week', mult: 1.55 },
  active: { label: 'Very Active', desc: '6-7 days/week', mult: 1.725 },
  extra: { label: 'Extremely Active', desc: 'Physical job + exercise', mult: 1.9 },
};
const GOAL_DEFAULTS = {
  cutting: { proteinPct: 40, carbsPct: 35, fatsPct: 25 },
  maintenance: { proteinPct: 30, carbsPct: 45, fatsPct: 25 },
  bulking: { proteinPct: 30, carbsPct: 50, fatsPct: 20 },
};

export default function CoachHealthScreen({ route }) {
  const { client } = route.params || {};
  const { profile } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];

  const [tab, setTab] = useState('weight');
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);
  const [macroLogs, setMacroLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [foodEntries, setFoodEntries] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [mealPlanTemplates, setMealPlanTemplates] = useState([]);
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

  // Meal plan modals
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [showApplyPlanModal, setShowApplyPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planIsShared, setPlanIsShared] = useState(false);
  const [planItems, setPlanItems] = useState([]);
  const [planItemSearch, setPlanItemSearch] = useState('');
  const [planItemMeal, setPlanItemMeal] = useState('Breakfast');
  const [planItemGrams, setPlanItemGrams] = useState('100');
  const [planItemFood, setPlanItemFood] = useState(null);
  const [planItemStep, setPlanItemStep] = useState('list');
  const [applyPlanTarget, setApplyPlanTarget] = useState(null);
  const [applyPlanDate, setApplyPlanDate] = useState(todayStr);
  const [applyPlanReplace, setApplyPlanReplace] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState(null);

  // TDEE state
  const [tdeeWeight, setTdeeWeight] = useState(client?.weight_kg ? String(client.weight_kg) : '');
  const [tdeeHeight, setTdeeHeight] = useState(client?.height_cm ? String(client.height_cm) : '');
  const [tdeeAge, setTdeeAge] = useState(client?.age ? String(client.age) : '');
  const [tdeeGender, setTdeeGender] = useState(client?.gender || 'Male');
  const [tdeeActivity, setTdeeActivity] = useState('moderate');
  const [tdeeGoal, setTdeeGoal] = useState('maintenance');
  const [tdeeDeficit, setTdeeDeficit] = useState('500');
  const [tdeeSurplus, setTdeeSurplus] = useState('300');
  const [tdeeProteinPct, setTdeeProteinPct] = useState(30);
  const [tdeeCarbsPct, setTdeeCarbsPct] = useState(45);
  const [tdeeFatsPct, setTdeeFatsPct] = useState(25);
  const [tdeeMacroMode, setTdeeMacroMode] = useState('percent');
  const [tdeeProteinG, setTdeeProteinG] = useState('');
  const [tdeeCarbsG, setTdeeCarbsG] = useState('');
  const [tdeeFatsG, setTdeeFatsG] = useState('');
  const [tdeeResult, setTdeeResult] = useState(null);

  const clientUnit = client?.unit_preference || 'kg';
  const ul = unitLabel(clientUnit);
  const isFemale = client?.gender === 'Female';

  useEffect(() => { if (client?.id) fetchAll(); }, []);

  async function fetchAll() {
    try {
      const [wRes, mRes, tRes, fRes, cRes, feRes, flRes, mpRes] = await Promise.all([
        supabase.from('weight_logs').select('*')
          .eq('client_id', client.id).order('logged_at', { ascending: false }),
        supabase.from('macro_logs').select('*')
          .eq('client_id', client.id).order('date', { ascending: false }).limit(30),
        supabase.from('macro_targets').select('*')
          .eq('client_id', client.id).single(),
        supabase.from('workout_feedback').select('*')
          .eq('client_id', client.id).order('created_at', { ascending: false }),
        supabase.from('menstrual_cycles').select('*')
          .eq('client_id', client.id).order('cycle_start_date', { ascending: false }),
        supabase.from('food_entries').select('*')
          .eq('client_id', client.id).order('created_at', { ascending: false }),
        supabase.from('food_library').select('*').order('name'),
        supabase.from('meal_plan_templates')
          .select('*, meal_plan_items(*)')
          .or(`client_id.eq.${client.id},is_shared.eq.true,created_by.eq.${profile.id}`)
          .order('created_at', { ascending: false }),
      ]);
      setWeightLogs(wRes.data || []);
      setMacroLogs(mRes.data || []);
      setMacroTargets(tRes.data || null);
      setFeedbacks(fRes.data || []);
      setCycles(cRes.data || []);
      setFoodEntries(feRes.data || []);
      setFoodLibrary(flRes.data || []);
      setMealPlanTemplates(mpRes.data || []);
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

  const filteredPlanFoods = foodLibrary.filter(f =>
    f.name.toLowerCase().includes(planItemSearch.toLowerCase()) ||
    (f.brand || '').toLowerCase().includes(planItemSearch.toLowerCase())
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
    if (data) setSelectedFood(data);
  }

  async function saveFoodEntry() {
    setLoading(true);
    let entryData = null;
    if (foodInputMode === 'search' && selectedFood) {
      const macros = calcFoodMacros(selectedFood, foodGrams);
      entryData = {
        client_id: client.id, date: foodDate,
        food_name: selectedFood.name, brand: selectedFood.brand || null,
        grams: parseFloat(foodGrams),
        protein_g: macros.protein, carbs_g: macros.carbs,
        fats_g: macros.fats, calories: macros.calories,
        meal_type: foodMeal, food_library_id: selectedFood.id,
        serving_size_g: selectedFood.serving_size_g || 100,
      };
    } else if (foodInputMode === 'custom' && customFood.name) {
      const g = parseFloat(customFood.grams) || 100;
      const protein = parseFloat(customFood.protein) || 0;
      const carbs = parseFloat(customFood.carbs) || 0;
      const fats = parseFloat(customFood.fats) || 0;
      entryData = {
        client_id: client.id, date: foodDate,
        food_name: customFood.name.trim(), brand: customFood.brand.trim() || null,
        grams: g, protein_g: protein, carbs_g: carbs, fats_g: fats,
        calories: +(protein * 4 + carbs * 4 + fats * 9).toFixed(0),
        meal_type: foodMeal, serving_size_g: g,
      };
    }
    if (!entryData) { setLoading(false); return; }
    await supabase.from('food_entries').insert(entryData);
    await recalcMacroLog(foodDate, [...foodEntries.filter(e => e.date === foodDate), entryData]);
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
      await recalcMacroLog(date, remaining);
      fetchAll();
    }, null, 'Delete', true);
  }

  async function recalcMacroLog(date, entries) {
    if (entries.length === 0) {
      await supabase.from('macro_logs').delete()
        .eq('client_id', client.id).eq('date', date);
      return;
    }
    const totals = entries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein_g || 0),
      carbs: acc.carbs + (e.carbs_g || 0),
      fats: acc.fats + (e.fats_g || 0),
      calories: acc.calories + (e.calories || 0),
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
    await supabase.from('macro_logs').upsert({
      client_id: client.id, logged_by: profile.id, date,
      protein_g: +totals.protein.toFixed(1),
      carbs_g: +totals.carbs.toFixed(1),
      fats_g: +totals.fats.toFixed(1),
      calories: +totals.calories.toFixed(0),
    }, { onConflict: 'client_id,date' });
  }

  // ── MEAL PLANS ────────────────────────────────────────

  function openNewPlan() {
    setEditingPlan(null);
    setPlanName('');
    setPlanGoal('');
    setPlanDesc('');
    setPlanIsShared(false);
    setPlanItems([]);
    setPlanItemStep('list');
    setShowMealPlanModal(true);
  }

  function openEditPlan(plan) {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanGoal(plan.goal || '');
    setPlanDesc(plan.description || '');
    setPlanIsShared(plan.is_shared || false);
    setPlanItems(plan.meal_plan_items || []);
    setPlanItemStep('list');
    setShowMealPlanModal(true);
  }

  function addItemToPlan() {
    if (!planItemFood) { showAlert('Error', 'Select a food first'); return; }
    const macros = calcFoodMacros(planItemFood, planItemGrams);
    const newItem = {
      meal_type: planItemMeal,
      food_name: planItemFood.name,
      brand: planItemFood.brand || null,
      food_library_id: planItemFood.id,
      grams: parseFloat(planItemGrams),
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fats_g: macros.fats,
      calories: macros.calories,
      order_index: planItems.length,
    };
    setPlanItems(p => [...p, newItem]);
    setPlanItemFood(null);
    setPlanItemGrams('100');
    setPlanItemSearch('');
    setPlanItemStep('list');
  }

  function removeItemFromPlan(idx) {
    setPlanItems(p => p.filter((_, i) => i !== idx));
  }

  async function saveMealPlan() {
    if (!planName.trim()) { showAlert('Error', 'Plan name required'); return; }
    if (planItems.length === 0) { showAlert('Error', 'Add at least one food item'); return; }
    setLoading(true);

    const totals = planItems.reduce((acc, e) => ({
      protein: acc.protein + (e.protein_g || 0),
      carbs: acc.carbs + (e.carbs_g || 0),
      fats: acc.fats + (e.fats_g || 0),
      calories: acc.calories + (e.calories || 0),
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });

    let planId;
    if (editingPlan) {
      await supabase.from('meal_plan_templates').update({
        name: planName.trim(),
        description: planDesc.trim() || null,
        goal: planGoal || null,
        is_shared: planIsShared,
        total_calories: totals.calories,
        total_protein_g: totals.protein,
        total_carbs_g: totals.carbs,
        total_fats_g: totals.fats,
      }).eq('id', editingPlan.id);
      await supabase.from('meal_plan_items').delete().eq('template_id', editingPlan.id);
      planId = editingPlan.id;
    } else {
      const { data } = await supabase.from('meal_plan_templates').insert({
        name: planName.trim(),
        description: planDesc.trim() || null,
        goal: planGoal || null,
        is_shared: planIsShared,
        client_id: client.id,
        created_by: profile.id,
        total_calories: totals.calories,
        total_protein_g: totals.protein,
        total_carbs_g: totals.carbs,
        total_fats_g: totals.fats,
      }).select().single();
      planId = data?.id;
    }

    if (planId) {
      await supabase.from('meal_plan_items').insert(
        planItems.map((item, i) => ({ ...item, template_id: planId, order_index: i }))
      );
    }

    setLoading(false);
    setShowMealPlanModal(false);
    showAlert('✅ Meal Plan Saved!', `"${planName}" has been saved.`);
    fetchAll();
  }

  async function deleteMealPlan(plan) {
    showConfirm('Delete Meal Plan',
      `Delete "${plan.name}"? This cannot be undone.`,
      async () => {
        await supabase.from('meal_plan_items').delete().eq('template_id', plan.id);
        await supabase.from('meal_plan_templates').delete().eq('id', plan.id);
        fetchAll();
      }, null, 'Delete', true);
  }

  async function applyMealPlan() {
    if (!applyPlanTarget) return;
    setLoading(true);

    const items = applyPlanTarget.meal_plan_items || [];
    if (applyPlanReplace) {
      const existingIds = foodEntries.filter(e => e.date === applyPlanDate).map(e => e.id);
      if (existingIds.length > 0) {
        await supabase.from('food_entries').delete().in('id', existingIds);
      }
    }

    const newEntries = items.map(item => ({
      client_id: client.id,
      date: applyPlanDate,
      food_name: item.food_name,
      brand: item.brand || null,
      food_library_id: item.food_library_id || null,
      grams: item.grams,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fats_g: item.fats_g,
      calories: item.calories,
      meal_type: item.meal_type,
    }));

    await supabase.from('food_entries').insert(newEntries);

    const existing = applyPlanReplace
      ? []
      : foodEntries.filter(e => e.date === applyPlanDate);
    await recalcMacroLog(applyPlanDate, [...existing, ...newEntries]);

    setLoading(false);
    setShowApplyPlanModal(false);
    showAlert('✅ Meal Plan Applied!',
      `"${applyPlanTarget.name}" applied to ${applyPlanDate} for ${client.name}.`);
    fetchAll();
  }

  // ── TDEE ─────────────────────────────────────────────

  function calculateTDEE() {
    const w = parseFloat(tdeeWeight);
    const h = parseFloat(tdeeHeight);
    const a = parseFloat(tdeeAge);
    if (!w || !h || !a) { showAlert('Error', 'Enter weight, height and age'); return; }
    let bmr = tdeeGender === 'Male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161;
    const mult = ACTIVITY_MULTIPLIERS[tdeeActivity]?.mult || 1.55;
    const tdee = bmr * mult;
    let targetCals = tdeeGoal === 'cutting'
      ? tdee - (parseFloat(tdeeDeficit) || 500)
      : tdeeGoal === 'bulking'
      ? tdee + (parseFloat(tdeeSurplus) || 300)
      : tdee;
    const defaults = GOAL_DEFAULTS[tdeeGoal];
    setTdeeProteinPct(defaults.proteinPct);
    setTdeeCarbsPct(defaults.carbsPct);
    setTdeeFatsPct(defaults.fatsPct);
    setTdeeProteinG(((defaults.proteinPct / 100) * targetCals / 4).toFixed(0));
    setTdeeCarbsG(((defaults.carbsPct / 100) * targetCals / 4).toFixed(0));
    setTdeeFatsG(((defaults.fatsPct / 100) * targetCals / 9).toFixed(0));
    setTdeeResult({ bmr: Math.round(bmr), tdee: Math.round(tdee), targetCals: Math.round(targetCals) });
  }

  function getTdeeTargetCals() {
    if (tdeeMacroMode === 'grams') {
      return (parseFloat(tdeeProteinG) || 0) * 4 +
             (parseFloat(tdeeCarbsG) || 0) * 4 +
             (parseFloat(tdeeFatsG) || 0) * 9;
    }
    return tdeeResult?.targetCals || 0;
  }

  function updateMacroPercent(macro, value) {
    const val = Math.min(100, Math.max(0, parseInt(value) || 0));
    if (macro === 'protein') {
      setTdeeProteinPct(val);
      const rem = 100 - val;
      const cRatio = tdeeCarbsPct + tdeeFatsPct > 0
        ? tdeeCarbsPct / (tdeeCarbsPct + tdeeFatsPct) : 0.64;
      setTdeeCarbsPct(Math.round(rem * cRatio));
      setTdeeFatsPct(Math.max(0, rem - Math.round(rem * cRatio)));
    } else if (macro === 'carbs') {
      setTdeeCarbsPct(val);
      setTdeeFatsPct(Math.max(0, 100 - tdeeProteinPct - val));
    } else {
      setTdeeFatsPct(val);
      setTdeeCarbsPct(Math.max(0, 100 - tdeeProteinPct - val));
    }
  }

  function getMacrosFromPercents() {
    if (!tdeeResult) return { p: 0, c: 0, f: 0 };
    const cals = tdeeResult.targetCals;
    return {
      p: Math.round((tdeeProteinPct / 100) * cals / 4),
      c: Math.round((tdeeCarbsPct / 100) * cals / 4),
      f: Math.round((tdeeFatsPct / 100) * cals / 9),
    };
  }

  async function applyTdeeAsTargets() {
    let protein, carbs, fats, calories;
    if (tdeeMacroMode === 'percent') {
      const m = getMacrosFromPercents();
      protein = m.p; carbs = m.c; fats = m.f;
      calories = tdeeResult?.targetCals || 0;
    } else {
      protein = parseFloat(tdeeProteinG) || 0;
      carbs = parseFloat(tdeeCarbsG) || 0;
      fats = parseFloat(tdeeFatsG) || 0;
      calories = Math.round(protein * 4 + carbs * 4 + fats * 9);
    }
    setLoading(true);
    await supabase.from('macro_targets').upsert({
      client_id: client.id, protein_g: protein, carbs_g: carbs,
      fats_g: fats, calories, set_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });
    setLoading(false);
    showAlert('✅ Targets Applied!',
      `P:${protein}g C:${carbs}g F:${fats}g (${calories}kcal) set for ${client.name}`);
    fetchAll();
  }

  // ── CALENDAR ─────────────────────────────────────────

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
  const tabs = ['weight', 'macros', 'food', 'mealplans', 'tdee', 'feedback', ...(isFemale ? ['cycle'] : [])];
  const tabLabels = ['⚖️ Weight', '🥗 Macros', '🍽️ Food Log', '📋 Meal Plans', '🔢 TDEE', '💬 Feedback', ...(isFemale ? ['🌸 Cycle'] : [])];

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
                setEditingWeight(null); setWeightInput('');
                setWeightNotes(''); setWeightDate(todayStr);
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
            <View style={styles.foodDateRow}>
              <Text style={styles.foodDateLabel}>Date:</Text>
              <RNTextInput value={foodDate} onChangeText={setFoodDate}
                style={styles.foodDateInput} placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted} />
            </View>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => {
                setFoodInputMode('search'); setSelectedFood(null);
                setFoodSearch(''); setFoodGrams('');
                setCustomFood({ name: '', brand: '', protein: '', carbs: '', fats: '', grams: '100' });
                setShowFoodModal(true);
              }}>
              <Text style={styles.actionBtnText}>+ Log Food for {client.name}</Text>
            </TouchableOpacity>
            {todayMacroLog && (
              <View style={styles.todayMacroCard}>
                <Text style={styles.todayMacroTitle}>📊 {foodDate} Totals</Text>
                <View style={styles.macroRow}>
                  {[
                    { label: 'P', val: todayMacroLog.protein_g, color: '#FF6B6B', target: macroTargets?.protein_g },
                    { label: 'C', val: todayMacroLog.carbs_g, color: '#4ECDC4', target: macroTargets?.carbs_g },
                    { label: 'F', val: todayMacroLog.fats_g, color: '#FFE66D', target: macroTargets?.fats_g },
                    { label: 'kcal', val: todayMacroLog.calories, color: COLORS.roseGold, target: macroTargets?.calories },
                  ].map(m => (
                    <View key={m.label} style={[styles.macroPill,
                      { backgroundColor: m.color + '22', borderColor: m.color }]}>
                      <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}</Text>
                      {m.target && <Text style={styles.macroTarget}>/{m.target}</Text>}
                      <Text style={styles.macroPillLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {selectedFoodEntries.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No food logged for {foodDate}</Text>
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
                              {entry.food_name}{entry.brand ? ` · ${entry.brand}` : ''}
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
          </View>
        )}

        {/* ═══ MEAL PLANS TAB ═══ */}
        {tab === 'mealplans' && (
          <View>
            <TouchableOpacity style={styles.actionBtn} onPress={openNewPlan}>
              <Text style={styles.actionBtnText}>+ Create New Meal Plan</Text>
            </TouchableOpacity>
            {mealPlanTemplates.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No meal plans yet</Text>
                  <Text style={styles.emptySub}>Create a plan to quickly log repeated meals</Text>
                </View>
              : mealPlanTemplates.map(plan => {
                  const items = plan.meal_plan_items || [];
                  const byMeal = {};
                  items.forEach(item => {
                    if (!byMeal[item.meal_type]) byMeal[item.meal_type] = [];
                    byMeal[item.meal_type].push(item);
                  });
                  const totalCals = items.reduce((s, i) => s + (i.calories || 0), 0);
                  const totalP = items.reduce((s, i) => s + (i.protein_g || 0), 0);
                  const totalC = items.reduce((s, i) => s + (i.carbs_g || 0), 0);
                  const totalF = items.reduce((s, i) => s + (i.fats_g || 0), 0);
                  const isExpanded = expandedPlanId === plan.id;
                  return (
                    <View key={plan.id} style={styles.planCard}>
                      <TouchableOpacity style={styles.planHeader}
                        onPress={() => setExpandedPlanId(isExpanded ? null : plan.id)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.planName}>{plan.name}</Text>
                          {plan.description && (
                            <Text style={styles.planDesc}>{plan.description}</Text>
                          )}
                          <View style={styles.planMacroRow}>
                            <Text style={[styles.planMacroText, { color: '#FF6B6B' }]}>
                              P:{totalP.toFixed(0)}g
                            </Text>
                            <Text style={[styles.planMacroText, { color: '#4ECDC4' }]}>
                              C:{totalC.toFixed(0)}g
                            </Text>
                            <Text style={[styles.planMacroText, { color: '#FFE66D' }]}>
                              F:{totalF.toFixed(0)}g
                            </Text>
                            <Text style={[styles.planMacroText, { color: COLORS.roseGold }]}>
                              {totalCals.toFixed(0)}kcal
                            </Text>
                          </View>
                        </View>
                        <View style={styles.planBadges}>
                          {plan.is_shared && (
                            <View style={styles.sharedBadge}>
                              <Text style={styles.sharedBadgeText}>Shared</Text>
                            </View>
                          )}
                          <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.planExpanded}>
                          {Object.entries(byMeal).map(([meal, mealItems]) => (
                            <View key={meal} style={styles.planMealGroup}>
                              <Text style={styles.planMealTitle}>{meal}</Text>
                              {mealItems.map((item, i) => (
                                <View key={i} style={styles.planItemRow}>
                                  <Text style={styles.planItemName}>
                                    {item.food_name}{item.brand ? ` · ${item.brand}` : ''}
                                  </Text>
                                  <Text style={styles.planItemDetail}>
                                    {item.grams}g · {item.calories}kcal
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ))}

                          <View style={styles.planActions}>
                            <TouchableOpacity style={styles.planApplyBtn}
                              onPress={() => {
                                setApplyPlanTarget(plan);
                                setApplyPlanDate(todayStr);
                                setApplyPlanReplace(false);
                                setShowApplyPlanModal(true);
                              }}>
                              <Text style={styles.planApplyBtnText}>✅ Apply to Date</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.planEditBtn}
                              onPress={() => openEditPlan(plan)}>
                              <Text style={styles.planEditBtnText}>✏️ Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.planDeleteBtn}
                              onPress={() => deleteMealPlan(plan)}>
                              <Text style={styles.planDeleteBtnText}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
            }
          </View>
        )}

        {/* ═══ TDEE TAB ═══ */}
        {tab === 'tdee' && (
          <View>
            <Text style={styles.sectionTitle}>🔢 TDEE Calculator</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 16 }}>
              Calculate Total Daily Energy Expenditure for {client.name}
            </Text>

            <View style={styles.tdeeCard}>
              <Text style={styles.tdeeCardTitle}>📊 Client Stats</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'Weight (kg)', val: tdeeWeight, set: setTdeeWeight, placeholder: '70' },
                  { label: 'Height (cm)', val: tdeeHeight, set: setTdeeHeight, placeholder: '170' },
                  { label: 'Age', val: tdeeAge, set: setTdeeAge, placeholder: '25' },
                ].map(f => (
                  <View key={f.label} style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>{f.label}</Text>
                    <RNTextInput value={f.val} onChangeText={f.set}
                      style={styles.modalInput} placeholder={f.placeholder}
                      placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                  </View>
                ))}
              </View>

              <Text style={styles.modalLabel}>Gender</Text>
              <View style={styles.tdeeToggleRow}>
                {['Male', 'Female'].map(g => (
                  <TouchableOpacity key={g}
                    style={[styles.tdeeToggleBtn, tdeeGender === g && styles.tdeeToggleBtnActive]}
                    onPress={() => setTdeeGender(g)}>
                    <Text style={[styles.tdeeToggleBtnText, tdeeGender === g && styles.tdeeToggleBtnTextActive]}>
                      {g === 'Male' ? '♂ Male' : '♀ Female'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Activity Level</Text>
              {Object.entries(ACTIVITY_MULTIPLIERS).map(([key, val]) => (
                <TouchableOpacity key={key}
                  style={[styles.tdeeActivityBtn, tdeeActivity === key && styles.tdeeActivityBtnActive]}
                  onPress={() => setTdeeActivity(key)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tdeeActivityLabel,
                      tdeeActivity === key && { color: COLORS.white }]}>{val.label}</Text>
                    <Text style={styles.tdeeActivityDesc}>{val.desc} (×{val.mult})</Text>
                  </View>
                  {tdeeActivity === key && <Text style={{ color: COLORS.white }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.tdeeCard}>
              <Text style={styles.tdeeCardTitle}>🎯 Goal</Text>
              <View style={styles.tdeeGoalRow}>
                {[
                  { key: 'cutting', label: '📉 Cutting', color: '#FF6B6B' },
                  { key: 'maintenance', label: '⚖️ Maintain', color: '#4ECDC4' },
                  { key: 'bulking', label: '📈 Bulking', color: '#FFE66D' },
                ].map(g => (
                  <TouchableOpacity key={g.key}
                    style={[styles.tdeeGoalBtn, tdeeGoal === g.key && {
                      backgroundColor: g.color + '22', borderColor: g.color
                    }]}
                    onPress={() => {
                      setTdeeGoal(g.key);
                      const d = GOAL_DEFAULTS[g.key];
                      setTdeeProteinPct(d.proteinPct);
                      setTdeeCarbsPct(d.carbsPct);
                      setTdeeFatsPct(d.fatsPct);
                    }}>
                    <Text style={[styles.tdeeGoalBtnText,
                      tdeeGoal === g.key && { color: g.color }]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tdeeGoal === 'cutting' && (
                <View>
                  <Text style={styles.modalLabel}>Calorie Deficit (kcal/day)</Text>
                  <View style={styles.tdeeAdjRow}>
                    {['250','350','500','750','1000'].map(v => (
                      <TouchableOpacity key={v}
                        style={[styles.tdeeAdjChip, tdeeDeficit === v && styles.tdeeAdjChipActive]}
                        onPress={() => setTdeeDeficit(v)}>
                        <Text style={[styles.tdeeAdjChipText, tdeeDeficit === v && { color: COLORS.white }]}>
                          -{v}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <RNTextInput value={tdeeDeficit} onChangeText={setTdeeDeficit}
                    style={styles.modalInput} placeholder="500"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
              )}

              {tdeeGoal === 'bulking' && (
                <View>
                  <Text style={styles.modalLabel}>Calorie Surplus (kcal/day)</Text>
                  <View style={styles.tdeeAdjRow}>
                    {['150','250','300','400','500'].map(v => (
                      <TouchableOpacity key={v}
                        style={[styles.tdeeAdjChip, tdeeSurplus === v && styles.tdeeAdjChipActive]}
                        onPress={() => setTdeeSurplus(v)}>
                        <Text style={[styles.tdeeAdjChipText, tdeeSurplus === v && { color: COLORS.white }]}>
                          +{v}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <RNTextInput value={tdeeSurplus} onChangeText={setTdeeSurplus}
                    style={styles.modalInput} placeholder="300"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
              )}

              <TouchableOpacity style={styles.tdeeCalcBtn} onPress={calculateTDEE}>
                <Text style={styles.tdeeCalcBtnText}>⚡ Calculate TDEE</Text>
              </TouchableOpacity>
            </View>

            {tdeeResult && (
              <View style={styles.tdeeResultCard}>
                <Text style={styles.tdeeCardTitle}>📊 Results</Text>
                <View style={styles.tdeeResultRow}>
                  {[
                    { label: 'BMR', val: tdeeResult.bmr, color: COLORS.white },
                    { label: 'TDEE', val: tdeeResult.tdee, color: '#4ECDC4' },
                    { label: 'Target', val: tdeeResult.targetCals,
                      color: tdeeGoal === 'cutting' ? '#FF6B6B'
                        : tdeeGoal === 'bulking' ? '#FFE66D' : COLORS.roseGold },
                  ].map(r => (
                    <View key={r.label} style={[styles.tdeeResultItem, { borderColor: r.color }]}>
                      <Text style={[styles.tdeeResultValue, { color: r.color }]}>{r.val}</Text>
                      <Text style={styles.tdeeResultLabel}>{r.label}</Text>
                      <Text style={styles.tdeeResultSub}>kcal/day</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.tdeeCardTitle}>🥗 Macro Breakdown</Text>
                <View style={styles.tdeeToggleRow}>
                  {[['percent','% Percentage'],['grams','g Grams']].map(([k,l]) => (
                    <TouchableOpacity key={k}
                      style={[styles.tdeeToggleBtn, tdeeMacroMode === k && styles.tdeeToggleBtnActive]}
                      onPress={() => setTdeeMacroMode(k)}>
                      <Text style={[styles.tdeeToggleBtnText, tdeeMacroMode === k && styles.tdeeToggleBtnTextActive]}>
                        {l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tdeeMacroMode === 'percent' && (
                  <View>
                    {[
                      { key: 'protein', label: 'Protein', pct: tdeeProteinPct, color: '#FF6B6B', calPer: 4 },
                      { key: 'carbs', label: 'Carbs', pct: tdeeCarbsPct, color: '#4ECDC4', calPer: 4 },
                      { key: 'fats', label: 'Fats', pct: tdeeFatsPct, color: '#FFE66D', calPer: 9 },
                    ].map(m => {
                      const grams = Math.round((m.pct / 100) * tdeeResult.targetCals / m.calPer);
                      return (
                        <View key={m.key} style={styles.tdeeMacroRow}>
                          <View style={{ width: 70 }}>
                            <Text style={[styles.tdeeMacroLabel, { color: m.color }]}>{m.label}</Text>
                            <Text style={styles.tdeeMacroGrams}>{grams}g</Text>
                          </View>
                          <View style={styles.tdeeMacroSliderBg}>
                            <View style={[styles.tdeeMacroSliderFill,
                              { width: `${m.pct}%`, backgroundColor: m.color }]} />
                          </View>
                          <View style={styles.tdeePctInput}>
                            <RNTextInput value={String(m.pct)}
                              onChangeText={v => updateMacroPercent(m.key, v)}
                              style={[styles.tdeePctField, { borderColor: m.color }]}
                              keyboardType="numeric" />
                            <Text style={[styles.tdeePctSymbol, { color: m.color }]}>%</Text>
                          </View>
                        </View>
                      );
                    })}
                    <Text style={[styles.tdeeTotalText, {
                      color: (tdeeProteinPct + tdeeCarbsPct + tdeeFatsPct) === 100
                        ? COLORS.success : COLORS.error
                    }]}>
                      Total: {tdeeProteinPct + tdeeCarbsPct + tdeeFatsPct}%
                      {(tdeeProteinPct + tdeeCarbsPct + tdeeFatsPct) === 100 ? ' ✓' : ' (must = 100%)'}
                    </Text>
                    <View style={styles.tdeeSummaryRow}>
                      {(() => {
                        const m = getMacrosFromPercents();
                        return [
                          { l: 'Protein', v: `${m.p}g`, c: '#FF6B6B' },
                          { l: 'Carbs', v: `${m.c}g`, c: '#4ECDC4' },
                          { l: 'Fats', v: `${m.f}g`, c: '#FFE66D' },
                          { l: 'Total', v: `${m.p*4+m.c*4+m.f*9}kcal`, c: COLORS.roseGold },
                        ].map(x => (
                          <View key={x.l} style={[styles.tdeeSummaryPill,
                            { backgroundColor: x.c + '22', borderColor: x.c }]}>
                            <Text style={[styles.tdeeSummaryVal, { color: x.c }]}>{x.v}</Text>
                            <Text style={styles.tdeeSummaryLabel}>{x.l}</Text>
                          </View>
                        ));
                      })()}
                    </View>
                  </View>
                )}

                {tdeeMacroMode === 'grams' && (
                  <View>
                    {[
                      { label: 'Protein (g)', val: tdeeProteinG, set: setTdeeProteinG, color: '#FF6B6B' },
                      { label: 'Carbs (g)', val: tdeeCarbsG, set: setTdeeCarbsG, color: '#4ECDC4' },
                      { label: 'Fats (g)', val: tdeeFatsG, set: setTdeeFatsG, color: '#FFE66D' },
                    ].map(m => (
                      <View key={m.label}>
                        <Text style={[styles.modalLabel, { color: m.color }]}>{m.label}</Text>
                        <RNTextInput value={m.val} onChangeText={m.set}
                          style={[styles.modalInput, { borderColor: m.color + '66' }]}
                          placeholder="0" placeholderTextColor={COLORS.textMuted}
                          keyboardType="numeric" />
                      </View>
                    ))}
                    <Text style={[styles.tdeeTotalText, {
                      color: Math.abs(getTdeeTargetCals() - tdeeResult.targetCals) < 50
                        ? COLORS.success : '#FFB347'
                    }]}>
                      Total: {Math.round(getTdeeTargetCals())} kcal (target: {tdeeResult.targetCals})
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.tdeeApplyBtn, loading && { opacity: 0.6 }]}
                  onPress={applyTdeeAsTargets} disabled={loading}>
                  <Text style={styles.tdeeApplyBtnText}>
                    {loading ? 'Applying...' : `✅ Apply as Macro Targets for ${client.name}`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
              </View>
            ) : cycles.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No cycle data</Text>
                <Text style={styles.emptySub}>Client needs to log period in Health tab</Text>
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
              style={styles.modalInput} placeholder="Optional..."
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
            <Text style={styles.modalTitle}>💬 Feedback for {client.name}</Text>
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
              <Text style={styles.modalLabel}>Meal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {MEAL_TYPES.map(m => (
                  <TouchableOpacity key={m}
                    style={[styles.chip, foodMeal === m && styles.chipActive]}
                    onPress={() => setFoodMeal(m)}>
                    <Text style={[styles.chipText, foodMeal === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modeToggle}>
                {[['search','🔍 Search'],['custom','✏️ Manual']].map(([k,l]) => (
                  <TouchableOpacity key={k}
                    style={[styles.modeBtn, foodInputMode === k && styles.modeBtnActive]}
                    onPress={() => setFoodInputMode(k)}>
                    <Text style={[styles.modeBtnText, foodInputMode === k && styles.modeBtnTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {foodInputMode === 'search' && (
                <View>
                  <RNTextInput value={foodSearch} onChangeText={setFoodSearch}
                    style={styles.searchInput} placeholder="Search food or brand..."
                    placeholderTextColor={COLORS.textMuted} />
                  <TouchableOpacity style={styles.addToDatabaseBtn}
                    onPress={() => setShowAddFoodLibModal(true)}>
                    <Text style={styles.addToDatabaseBtnText}>+ Add new food to database</Text>
                  </TouchableOpacity>
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                    {filteredFoods.map(food => (
                      <TouchableOpacity key={food.id}
                        style={[styles.foodResultItem,
                          selectedFood?.id === food.id && styles.foodResultItemActive]}
                        onPress={() => { setSelectedFood(food); setFoodGrams(String(food.serving_size_g || 100)); }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.foodResultName}>{food.name}</Text>
                          {food.brand && <Text style={styles.foodResultBrand}>{food.brand}</Text>}
                          <Text style={styles.foodResultMacros}>
                            P:{food.protein_per_100g}g C:{food.carbs_per_100g}g F:{food.fats_per_100g}g /100g
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
                          <Text style={styles.noResultsAdd}>+ Add to database</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                  {selectedFood && (
                    <View style={styles.selectedFoodCard}>
                      <Text style={styles.selectedFoodName}>{selectedFood.name}</Text>
                      {selectedFood.brand && <Text style={styles.selectedFoodBrand}>{selectedFood.brand}</Text>}
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
                                <Text style={[styles.calcMacroVal, { color: x.color }]}>{x.val}</Text>
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
                </View>
              )}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowFoodModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
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
              {[
                { label: 'Food Name *', field: 'name', type: 'default', placeholder: 'e.g. Chicken Breast' },
                { label: 'Brand (optional)', field: 'brand', type: 'default', placeholder: 'e.g. Monterey' },
                { label: 'Serving Size (g)', field: 'serving_size_g', type: 'numeric', placeholder: '100' },
                { label: 'Protein per 100g', field: 'protein_per_100g', type: 'numeric', placeholder: '0' },
                { label: 'Carbs per 100g', field: 'carbs_per_100g', type: 'numeric', placeholder: '0' },
                { label: 'Fats per 100g', field: 'fats_per_100g', type: 'numeric', placeholder: '0' },
                { label: 'Calories per 100g', field: 'calories_per_100g', type: 'numeric', placeholder: '0' },
                { label: 'Fiber per 100g (optional)', field: 'fiber_g', type: 'numeric', placeholder: '0' },
                { label: 'Sugar per 100g (optional)', field: 'sugar_g', type: 'numeric', placeholder: '0' },
              ].map(f => (
                <View key={f.field}>
                  <Text style={styles.modalLabel}>{f.label}</Text>
                  <RNTextInput value={newFoodLib[f.field]}
                    onChangeText={v => setNewFoodLib(n => ({ ...n, [f.field]: v }))}
                    style={styles.modalInput} placeholder={f.placeholder}
                    placeholderTextColor={COLORS.textMuted} keyboardType={f.type} />
                </View>
              ))}
              <Text style={styles.modalLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {FOOD_CATEGORIES.map(c => (
                  <TouchableOpacity key={c}
                    style={[styles.chip, newFoodLib.category === c && styles.chipActive]}
                    onPress={() => setNewFoodLib(n => ({ ...n, category: c }))}>
                    <Text style={[styles.chipText, newFoodLib.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowAddFoodLibModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveFoodToLibrary} disabled={loading}>
                  <Text style={styles.modalSaveText}>{loading ? '...' : 'Add to Database'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ MEAL PLAN CREATE/EDIT MODAL ═══ */}
      <Modal visible={showMealPlanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '95%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingPlan ? '✏️ Edit Meal Plan' : '📋 New Meal Plan'}
              </Text>

              <Text style={styles.modalLabel}>Plan Name *</Text>
              <RNTextInput value={planName} onChangeText={setPlanName}
                style={styles.modalInput} placeholder="e.g. Cutting Day A"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>Description (optional)</Text>
              <RNTextInput value={planDesc} onChangeText={setPlanDesc}
                style={styles.modalInput} placeholder="e.g. Low carb day for rest days"
                placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.modalLabel}>Goal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {['Cutting','Maintenance','Bulking','Performance','Recovery','Custom'].map(g => (
                  <TouchableOpacity key={g}
                    style={[styles.chip, planGoal === g && styles.chipActive]}
                    onPress={() => setPlanGoal(g)}>
                    <Text style={[styles.chipText, planGoal === g && styles.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.sharedToggle}
                onPress={() => setPlanIsShared(!planIsShared)}>
                <View style={[styles.sharedToggleCheck, planIsShared && styles.sharedToggleCheckActive]}>
                  {planIsShared && <Text style={{ color: COLORS.white, fontSize: 10 }}>✓</Text>}
                </View>
                <View>
                  <Text style={styles.sharedToggleLabel}>Share with all clients</Text>
                  <Text style={styles.sharedToggleDesc}>
                    Shared plans can be used by any client
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Items list */}
              <Text style={styles.modalLabel}>
                Food Items ({planItems.length} added)
              </Text>

              {planItems.length > 0 && (() => {
                const byMeal = {};
                planItems.forEach((item, idx) => {
                  if (!byMeal[item.meal_type]) byMeal[item.meal_type] = [];
                  byMeal[item.meal_type].push({ ...item, idx });
                });
                return Object.entries(byMeal).map(([meal, items]) => (
                  <View key={meal} style={styles.planMealGroup}>
                    <Text style={styles.planMealTitle}>{meal}</Text>
                    {items.map(item => (
                      <View key={item.idx} style={styles.planItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.planItemName}>{item.food_name}</Text>
                          <Text style={styles.planItemDetail}>
                            {item.grams}g · P:{item.protein_g}g C:{item.carbs_g}g F:{item.fats_g}g · {item.calories}kcal
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => removeItemFromPlan(item.idx)}>
                          <Text style={{ color: COLORS.error }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ));
              })()}

              {/* Add item section */}
              {planItemStep === 'list' ? (
                <TouchableOpacity style={styles.addItemBtn}
                  onPress={() => setPlanItemStep('search')}>
                  <Text style={styles.addItemBtnText}>➕ Add Food Item</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.addItemForm}>
                  <Text style={styles.modalLabel}>Meal Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }}>
                    {MEAL_TYPES.map(m => (
                      <TouchableOpacity key={m}
                        style={[styles.chip, planItemMeal === m && styles.chipActive]}
                        onPress={() => setPlanItemMeal(m)}>
                        <Text style={[styles.chipText, planItemMeal === m && styles.chipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={styles.modalLabel}>Search Food</Text>
                  <RNTextInput value={planItemSearch} onChangeText={setPlanItemSearch}
                    style={styles.searchInput} placeholder="Search food..."
                    placeholderTextColor={COLORS.textMuted} />

                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {filteredPlanFoods.map(food => (
                      <TouchableOpacity key={food.id}
                        style={[styles.foodResultItem,
                          planItemFood?.id === food.id && styles.foodResultItemActive]}
                        onPress={() => {
                          setPlanItemFood(food);
                          setPlanItemGrams(String(food.serving_size_g || 100));
                        }}>
                        <Text style={styles.foodResultName}>{food.name}</Text>
                        {food.brand && <Text style={styles.foodResultBrand}>{food.brand}</Text>}
                        <Text style={styles.foodResultMacros}>
                          P:{food.protein_per_100g}g C:{food.carbs_per_100g}g F:{food.fats_per_100g}g /100g
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {planItemFood && (
                    <View>
                      <Text style={styles.modalLabel}>Grams</Text>
                      <RNTextInput value={planItemGrams} onChangeText={setPlanItemGrams}
                        style={styles.modalInput} placeholder="100"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                      {planItemGrams && (
                        <View style={styles.calcMacrosRow}>
                          {(() => {
                            const m = calcFoodMacros(planItemFood, planItemGrams);
                            return [
                              { label: 'P', val: m.protein, color: '#FF6B6B' },
                              { label: 'C', val: m.carbs, color: '#4ECDC4' },
                              { label: 'F', val: m.fats, color: '#FFE66D' },
                              { label: 'kcal', val: m.calories, color: COLORS.roseGold },
                            ].map(x => (
                              <View key={x.label} style={styles.calcMacroPill}>
                                <Text style={[styles.calcMacroVal, { color: x.color }]}>{x.val}</Text>
                                <Text style={styles.calcMacroLabel}>{x.label}</Text>
                              </View>
                            ));
                          })()}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.modalBtns}>
                    <TouchableOpacity style={styles.modalCancelBtn}
                      onPress={() => { setPlanItemStep('list'); setPlanItemFood(null); setPlanItemSearch(''); }}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSaveBtn} onPress={addItemToPlan}>
                      <Text style={styles.modalSaveText}>Add Item</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Plan totals */}
              {planItems.length > 0 && (
                <View style={styles.planTotalsCard}>
                  <Text style={styles.planTotalsTitle}>📊 Plan Totals</Text>
                  <View style={styles.macroRow}>
                    {[
                      { label: 'Protein', val: planItems.reduce((s,i)=>s+(i.protein_g||0),0).toFixed(0), color: '#FF6B6B' },
                      { label: 'Carbs', val: planItems.reduce((s,i)=>s+(i.carbs_g||0),0).toFixed(0), color: '#4ECDC4' },
                      { label: 'Fats', val: planItems.reduce((s,i)=>s+(i.fats_g||0),0).toFixed(0), color: '#FFE66D' },
                      { label: 'kcal', val: planItems.reduce((s,i)=>s+(i.calories||0),0).toFixed(0), color: COLORS.roseGold },
                    ].map(m => (
                      <View key={m.label} style={[styles.macroPill,
                        { backgroundColor: m.color + '22', borderColor: m.color }]}>
                        <Text style={[styles.macroPillValue, { color: m.color }]}>{m.val}g</Text>
                        <Text style={styles.macroPillLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowMealPlanModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveMealPlan} disabled={loading}>
                  <Text style={styles.modalSaveText}>
                    {loading ? 'Saving...' : '💾 Save Plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ APPLY MEAL PLAN MODAL ═══ */}
      <Modal visible={showApplyPlanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✅ Apply Meal Plan</Text>
            <Text style={styles.modalSubtitle}>{applyPlanTarget?.name}</Text>

            <Text style={styles.modalLabel}>Apply to Date (YYYY-MM-DD)</Text>
            <RNTextInput value={applyPlanDate} onChangeText={setApplyPlanDate}
              style={styles.modalInput} placeholder="2026-04-28"
              placeholderTextColor={COLORS.textMuted} />

            <TouchableOpacity style={styles.replaceToggle}
              onPress={() => setApplyPlanReplace(!applyPlanReplace)}>
              <View style={[styles.replaceCheck, applyPlanReplace && styles.replaceCheckActive]}>
                {applyPlanReplace && <Text style={{ color: COLORS.white, fontSize: 10 }}>✓</Text>}
              </View>
              <View>
                <Text style={styles.replaceLabel}>Replace existing food entries</Text>
                <Text style={styles.replaceDesc}>
                  {applyPlanReplace
                    ? 'Existing entries for this date will be deleted'
                    : 'New entries will be added on top of existing ones'}
                </Text>
              </View>
            </TouchableOpacity>

            {applyPlanTarget && (
              <View style={styles.applyPlanSummary}>
                <Text style={styles.applyPlanSummaryText}>
                  {(applyPlanTarget.meal_plan_items || []).length} food items will be logged
                </Text>
                <Text style={styles.applyPlanSummaryText}>
                  Total: ~{(applyPlanTarget.meal_plan_items || []).reduce((s,i) => s+(i.calories||0), 0).toFixed(0)} kcal
                </Text>
              </View>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowApplyPlanModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                onPress={applyMealPlan} disabled={loading}>
                <Text style={styles.modalSaveText}>
                  {loading ? 'Applying...' : 'Apply Plan'}
                </Text>
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
  calDayHeader: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: 9, ...FONTS.semibold },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 1 },
  calCellInner: { flex: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  calCellDay: { fontSize: 9, ...FONTS.medium },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderLeftWidth: 3 },
  phaseTitle: { ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 6 },
  phaseRec: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 2 },
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
  planCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder, overflow: 'hidden' },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  planName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  planDesc: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2, marginBottom: 4 },
  planMacroRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  planMacroText: { fontSize: SIZES.xs, ...FONTS.semibold },
  planBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sharedBadge: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  sharedBadgeText: { color: COLORS.roseGold, fontSize: 9, ...FONTS.bold },
  expandIcon: { color: COLORS.textMuted, fontSize: 12 },
  planExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  planMealGroup: { marginBottom: 10 },
  planMealTitle: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.xs, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  planItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  planItemName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  planItemDetail: { color: COLORS.textMuted, fontSize: SIZES.xs },
  planActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  planApplyBtn: { flex: 2, backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 10, alignItems: 'center' },
  planApplyBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xs },
  planEditBtn: { flex: 1, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  planEditBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  planDeleteBtn: { padding: 10, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.full },
  planDeleteBtnText: { fontSize: 14 },
  planTotalsCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  planTotalsTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 8 },
  addItemBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  addItemBtnText: { color: COLORS.roseGold, ...FONTS.bold },
  addItemForm: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginTop: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  sharedToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, padding: 12, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.darkBorder },
  sharedToggleCheck: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.darkBorder, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  sharedToggleCheckActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  sharedToggleLabel: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  sharedToggleDesc: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  replaceToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, padding: 12, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.darkBorder },
  replaceCheck: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.darkBorder, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  replaceCheckActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  replaceLabel: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  replaceDesc: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  applyPlanSummary: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  applyPlanSummaryText: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold },
  tdeeCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  tdeeResultCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  tdeeCardTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 12 },
  tdeeToggleRow: { flexDirection: 'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding: 3, marginBottom: 12 },
  tdeeToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.full, alignItems: 'center' },
  tdeeToggleBtnActive: { backgroundColor: COLORS.roseGold },
  tdeeToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  tdeeToggleBtnTextActive: { color: COLORS.white },
  tdeeActivityBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  tdeeActivityBtnActive: { backgroundColor: COLORS.roseGoldFaint, borderColor: COLORS.roseGold },
  tdeeActivityLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  tdeeActivityDesc: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  tdeeGoalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tdeeGoalBtn: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder },
  tdeeGoalBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  tdeeAdjRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  tdeeAdjChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder },
  tdeeAdjChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  tdeeAdjChipText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  tdeeCalcBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  tdeeCalcBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  tdeeResultRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tdeeResultItem: { flex: 1, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1 },
  tdeeResultValue: { fontSize: SIZES.xxl, ...FONTS.heavy },
  tdeeResultLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, marginTop: 2 },
  tdeeResultSub: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  tdeeMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tdeeMacroLabel: { fontSize: SIZES.sm, ...FONTS.bold },
  tdeeMacroGrams: { color: COLORS.textMuted, fontSize: SIZES.xs },
  tdeeMacroSliderBg: { flex: 1, height: 8, backgroundColor: COLORS.darkCard2, borderRadius: 4, overflow: 'hidden' },
  tdeeMacroSliderFill: { height: 8, borderRadius: 4 },
  tdeePctInput: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tdeePctField: { width: 48, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 6, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, textAlign: 'center', ...FONTS.bold },
  tdeePctSymbol: { fontSize: SIZES.sm, ...FONTS.bold },
  tdeeTotalText: { fontSize: SIZES.sm, ...FONTS.bold, textAlign: 'right', marginBottom: 12 },
  tdeeSummaryRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  tdeeSummaryPill: { flex: 1, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1 },
  tdeeSummaryVal: { fontSize: SIZES.md, ...FONTS.bold },
  tdeeSummaryLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  tdeeApplyBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  tdeeApplyBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
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
  foodResultItem: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: COLORS.darkBorder },
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
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipTextActive: { color: COLORS.white },
});