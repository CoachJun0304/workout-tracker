import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, ActivityIndicator
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, toKg, unitLabel } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getPhaseForDate, CYCLE_PHASES } from '../../data/cycleData';

const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_ORDERED = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
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
const CC_DAY_COLORS = { high: '#FF6B6B', medium: '#FFE66D', low: '#4ECDC4', none: COLORS.darkBorder };
const CC_DAY_LABELS = { high: 'H', medium: 'M', low: 'L', none: '—' };
const CC_DAY_TYPE_INFO = {
  high: { label: '🔴 High Carb Day', color: '#FF6B6B' },
  medium: { label: '🟡 Medium Carb Day', color: '#FFE66D' },
  low: { label: '🔵 Low Carb Day', color: '#4ECDC4' },
  none: { label: '— Not Linked', color: COLORS.textMuted },
};

export default function CoachHealthScreen({ route, navigation }) {
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
  const [carbCyclePlans, setCarbCyclePlans] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalDate, setSelectedCalDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [retagging, setRetagging] = useState(false);

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
  const [planCarbDayType, setPlanCarbDayType] = useState('none');
  const [planCarbCyclePlanId, setPlanCarbCyclePlanId] = useState(null);

  // Cycle edit modals
  const [showEditCycleModal, setShowEditCycleModal] = useState(false);
  const [editingCycle, setEditingCycle] = useState(null);
  const [editCycleInput, setEditCycleInput] = useState({
    start_date: '', cycle_length: '28', period_length: '5'
  });

  // Carb cycling state
  const [showCarbCycleModal, setShowCarbCycleModal] = useState(false);
  const [editingCarbPlan, setEditingCarbPlan] = useState(null);
  const [ccName, setCcName] = useState('');
  const [ccDesc, setCcDesc] = useState('');
  const [ccWeeklyCals, setCcWeeklyCals] = useState('');
  const [ccProtein, setCcProtein] = useState('');
  const [ccFats, setCcFats] = useState('');
  const [ccRatioHigh, setCcRatioHigh] = useState('3');
  const [ccRatioMed, setCcRatioMed] = useState('2');
  const [ccRatioLow, setCcRatioLow] = useState('1');
  const [ccDayTypes, setCcDayTypes] = useState({
    Monday: 'none', Tuesday: 'none', Wednesday: 'none',
    Thursday: 'none', Friday: 'none', Saturday: 'none', Sunday: 'none'
  });
  const [ccResult, setCcResult] = useState(null);
  const [expandedCarbPlanId, setExpandedCarbPlanId] = useState(null);

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
      const [wRes, mRes, tRes, fRes, cRes, feRes, flRes, mpRes, ccRes] = await Promise.all([
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
          .order('created_at', { ascending: false }),
        supabase.from('carb_cycling_plans').select('*')
          .or(`client_id.eq.${client.id},created_by.eq.${profile.id}`)
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
      setCarbCyclePlans(ccRes.data || []);
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
    setPlanName(''); setPlanGoal(''); setPlanDesc('');
    setPlanIsShared(false); setPlanItems([]);
    setPlanItemStep('list');
    setPlanCarbDayType('none');
    setPlanCarbCyclePlanId(activeCarbPlan?.id || null);
    setShowMealPlanModal(true);
  }

  function openEditPlan(plan) {
    setEditingPlan(plan);
    setPlanName(plan.name); setPlanGoal(plan.goal || '');
    setPlanDesc(plan.description || '');
    setPlanIsShared(plan.is_shared || false);
    setPlanItems(plan.meal_plan_items || []);
    setPlanItemStep('list');
    setPlanCarbDayType(plan.carb_cycle_day_type || 'none');
    setPlanCarbCyclePlanId(plan.carb_cycle_plan_id || null);
    setShowMealPlanModal(true);
  }

  function addItemToPlan() {
    if (!planItemFood) { showAlert('Error', 'Select a food first'); return; }
    const macros = calcFoodMacros(planItemFood, planItemGrams);
    setPlanItems(p => [...p, {
      meal_type: planItemMeal,
      food_name: planItemFood.name,
      brand: planItemFood.brand || null,
      food_library_id: planItemFood.id,
      grams: parseFloat(planItemGrams),
      protein_g: macros.protein, carbs_g: macros.carbs,
      fats_g: macros.fats, calories: macros.calories,
      order_index: planItems.length,
    }]);
    setPlanItemFood(null); setPlanItemGrams('100');
    setPlanItemSearch(''); setPlanItemStep('list');
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

    const carbLink = planCarbDayType !== 'none' ? {
      carb_cycle_day_type: planCarbDayType,
      carb_cycle_plan_id: planCarbCyclePlanId || activeCarbPlan?.id || null,
    } : { carb_cycle_day_type: null, carb_cycle_plan_id: null };

    let planId;
    if (editingPlan) {
      const { error } = await supabase.from('meal_plan_templates').update({
        name: planName.trim(), description: planDesc.trim() || null,
        goal: planGoal || null, is_shared: planIsShared,
        total_calories: totals.calories, total_protein_g: totals.protein,
        total_carbs_g: totals.carbs, total_fats_g: totals.fats,
        ...carbLink,
      }).eq('id', editingPlan.id);
      if (error) { setLoading(false); showAlert('Error', error.message); return; }
      await supabase.from('meal_plan_items').delete().eq('template_id', editingPlan.id);
      planId = editingPlan.id;
    } else {
      const { data, error } = await supabase.from('meal_plan_templates').insert({
        name: planName.trim(), description: planDesc.trim() || null,
        goal: planGoal || null, is_shared: planIsShared,
        client_id: client.id, created_by: profile.id,
        total_calories: totals.calories, total_protein_g: totals.protein,
        total_carbs_g: totals.carbs, total_fats_g: totals.fats,
        ...carbLink,
      }).select().single();
      if (error) { setLoading(false); showAlert('Error', error.message); return; }
      planId = data?.id;
    }

    if (planId) {
      const { error: itemsError } = await supabase.from('meal_plan_items').insert(
        planItems.map((item, i) => ({ ...item, template_id: planId, order_index: i }))
      );
      if (itemsError) { setLoading(false); showAlert('Error', itemsError.message); return; }
    }

    setLoading(false);
    setShowMealPlanModal(false);
    showAlert('✅ Meal Plan Saved!', `"${planName}" has been saved.`);
    fetchAll();
  }

  async function deleteMealPlan(plan) {
    showConfirm('Delete Meal Plan', `Delete "${plan.name}"?`, async () => {
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
      client_id: client.id, date: applyPlanDate,
      food_name: item.food_name, brand: item.brand || null,
      food_library_id: item.food_library_id || null,
      grams: item.grams, protein_g: item.protein_g,
      carbs_g: item.carbs_g, fats_g: item.fats_g,
      calories: item.calories, meal_type: item.meal_type,
    }));
    await supabase.from('food_entries').insert(newEntries);
    const existing = applyPlanReplace ? [] : foodEntries.filter(e => e.date === applyPlanDate);
    await recalcMacroLog(applyPlanDate, [...existing, ...newEntries]);
    setLoading(false);
    setShowApplyPlanModal(false);
    showAlert('✅ Meal Plan Applied!',
      `"${applyPlanTarget.name}" applied to ${applyPlanDate} for ${client.name}.`);
    fetchAll();
  }

  // ── CARB CYCLING ──────────────────────────────────────

  function openNewCarbCycle() {
    setEditingCarbPlan(null);
    setCcName('');
    setCcDesc('');
    setCcWeeklyCals(macroTargets ? String(Math.round(macroTargets.calories * 7)) : '');
    setCcProtein(macroTargets ? String(Math.round(macroTargets.protein_g)) : '');
    setCcFats(macroTargets ? String(Math.round(macroTargets.fats_g)) : '');
    setCcRatioHigh('3');
    setCcRatioMed('2');
    setCcRatioLow('1');
    setCcDayTypes({
      Monday: 'none', Tuesday: 'none', Wednesday: 'none',
      Thursday: 'none', Friday: 'none', Saturday: 'none', Sunday: 'none'
    });
    setCcResult(null);
    setShowCarbCycleModal(true);
  }

  function openEditCarbCycle(plan) {
    setEditingCarbPlan(plan);
    setCcName(plan.name);
    setCcDesc(plan.description || '');
    setCcWeeklyCals(String(plan.weekly_calories));
    setCcProtein(String(plan.protein_g_daily));
    setCcFats(String(plan.fats_g_daily));
    setCcRatioHigh(String(plan.carb_ratio_high || 3));
    setCcRatioMed(String(plan.carb_ratio_medium || 2));
    setCcRatioLow(String(plan.carb_ratio_low || 1));
    const dayTypes = {
      Monday: 'none', Tuesday: 'none', Wednesday: 'none',
      Thursday: 'none', Friday: 'none', Saturday: 'none', Sunday: 'none'
    };
    (plan.high_carb_days || []).forEach(d => { dayTypes[d] = 'high'; });
    (plan.medium_carb_days || []).forEach(d => { dayTypes[d] = 'medium'; });
    (plan.low_carb_days || []).forEach(d => { dayTypes[d] = 'low'; });
    setCcDayTypes(dayTypes);
    setCcResult({
      highCals: plan.high_carb_calories,
      medCals: plan.medium_carb_calories,
      lowCals: plan.low_carb_calories,
      highCarbG: plan.high_carb_g,
      medCarbG: plan.medium_carb_g,
      lowCarbG: plan.low_carb_g,
      weeklyCals: plan.weekly_calories,
      proteinG: plan.protein_g_daily,
      fatsG: plan.fats_g_daily,
      highDays: plan.high_carb_days || [],
      medDays: plan.medium_carb_days || [],
      lowDays: plan.low_carb_days || [],
    });
    setShowCarbCycleModal(true);
  }

  function computeCarbCycle() {
    const weeklyCals = parseFloat(ccWeeklyCals);
    const protein = parseFloat(ccProtein);
    const fats = parseFloat(ccFats);
    const ratioH = parseFloat(ccRatioHigh) || 3;
    const ratioM = parseFloat(ccRatioMed) || 2;
    const ratioL = parseFloat(ccRatioLow) || 1;

    if (!weeklyCals || !protein || !fats) {
      showAlert('Error', 'Enter weekly calories, daily protein and daily fats'); return;
    }

    const highDays = DAYS_ORDERED.filter(d => ccDayTypes[d] === 'high');
    const medDays = DAYS_ORDERED.filter(d => ccDayTypes[d] === 'medium');
    const lowDays = DAYS_ORDERED.filter(d => ccDayTypes[d] === 'low');
    const activeDays = highDays.length + medDays.length + lowDays.length;

    if (activeDays === 0) {
      showAlert('Error', 'Assign at least one day a carb type (H/M/L)'); return;
    }

    const fixedDailyCals = (protein * 4) + (fats * 9);
    const fixedWeeklyCals = fixedDailyCals * 7;
    const remainingWeeklyCarbCals = weeklyCals - fixedWeeklyCals;

    if (remainingWeeklyCarbCals <= 0) {
      showAlert('Error', 'Weekly calories too low — protein + fats already exceed weekly target'); return;
    }

    const denominator = (highDays.length * ratioH) + (medDays.length * ratioM) + (lowDays.length * ratioL);
    const x = remainingWeeklyCarbCals / denominator;

    const highCarbCals = ratioH * x;
    const medCarbCals = ratioM * x;
    const lowCarbCals = ratioL * x;

    const highCarbG = +(highCarbCals / 4).toFixed(0);
    const medCarbG = +(medCarbCals / 4).toFixed(0);
    const lowCarbG = +(lowCarbCals / 4).toFixed(0);

    const highTotalCals = Math.round(highCarbCals + fixedDailyCals);
    const medTotalCals = Math.round(medCarbCals + fixedDailyCals);
    const lowTotalCals = Math.round(lowCarbCals + fixedDailyCals);

    const computedWeekly = (highDays.length * highTotalCals) +
      (medDays.length * medTotalCals) + (lowDays.length * lowTotalCals) +
      ((7 - activeDays) * fixedDailyCals);

    setCcResult({
      highCals: highTotalCals, medCals: medTotalCals, lowCals: lowTotalCals,
      highCarbG, medCarbG, lowCarbG,
      weeklyCals: computedWeekly,
      proteinG: Math.round(protein), fatsG: Math.round(fats),
      highDays, medDays, lowDays,
    });
  }

  async function saveCarbCyclePlan() {
    if (!ccName.trim()) { showAlert('Error', 'Plan name required'); return; }
    if (!ccResult) { showAlert('Error', 'Compute the plan first'); return; }
    setLoading(true);

    const payload = {
      name: ccName.trim(),
      description: ccDesc.trim() || null,
      client_id: client.id,
      created_by: profile.id,
      weekly_calories: parseFloat(ccWeeklyCals),
      protein_g_daily: parseFloat(ccProtein),
      fats_g_daily: parseFloat(ccFats),
      high_carb_days: ccResult.highDays || [],
      medium_carb_days: ccResult.medDays || [],
      low_carb_days: ccResult.lowDays || [],
      high_carb_calories: ccResult.highCals,
      medium_carb_calories: ccResult.medCals,
      low_carb_calories: ccResult.lowCals,
      high_carb_g: ccResult.highCarbG,
      medium_carb_g: ccResult.medCarbG,
      low_carb_g: ccResult.lowCarbG,
      carb_ratio_high: parseFloat(ccRatioHigh),
      carb_ratio_medium: parseFloat(ccRatioMed),
      carb_ratio_low: parseFloat(ccRatioLow),
      is_active: true,
    };

    if (editingCarbPlan) {
      await supabase.from('carb_cycling_plans').update(payload).eq('id', editingCarbPlan.id);
    } else {
      await supabase.from('carb_cycling_plans').insert(payload);
    }

    setLoading(false);
    setShowCarbCycleModal(false);
    showAlert('✅ Carb Cycle Saved!', `"${ccName}" has been saved for ${client.name}.`);
    fetchAll();
  }

  async function deleteCarbCyclePlan(plan) {
    showConfirm('Delete', `Delete "${plan.name}"?`, async () => {
      await supabase.from('carb_cycling_plans').delete().eq('id', plan.id);
      fetchAll();
    }, null, 'Delete', true);
  }

  function getTodayCarbCycleTargets() {
    const activePlan = carbCyclePlans.find(p => p.is_active);
    if (!activePlan) return null;
    const todayName = DAYS_ORDERED[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    let dayType = 'none';
    if ((activePlan.high_carb_days || []).includes(todayName)) dayType = 'high';
    else if ((activePlan.medium_carb_days || []).includes(todayName)) dayType = 'medium';
    else if ((activePlan.low_carb_days || []).includes(todayName)) dayType = 'low';
    const carbG = dayType === 'high' ? activePlan.high_carb_g
      : dayType === 'medium' ? activePlan.medium_carb_g
      : dayType === 'low' ? activePlan.low_carb_g : null;
    const cals = dayType === 'high' ? activePlan.high_carb_calories
      : dayType === 'medium' ? activePlan.medium_carb_calories
      : dayType === 'low' ? activePlan.low_carb_calories : null;
    return { plan: activePlan, dayType, carbG, cals, todayName };
  }

  // ── TDEE → CARB CYCLE ─────────────────────────────────

  function applyTdeeToCarb() {
    let protein, fats, targetCals;
    if (tdeeMacroMode === 'percent') {
      const m = getMacrosFromPercents();
      protein = m.p; fats = m.f; targetCals = tdeeResult?.targetCals || 0;
    } else {
      protein = parseFloat(tdeeProteinG) || 0;
      fats = parseFloat(tdeeFatsG) || 0;
      targetCals = Math.round(protein * 4 + (parseFloat(tdeeCarbsG) || 0) * 4 + fats * 9);
    }
    setTab('carbcycle');
    setEditingCarbPlan(null);
    setCcName(`${client.name} Carb Cycle`);
    setCcDesc(`Based on TDEE: ${tdeeResult?.targetCals || targetCals} kcal/day`);
    setCcWeeklyCals(String(Math.round(targetCals * 7)));
    setCcProtein(String(Math.round(protein)));
    setCcFats(String(Math.round(fats)));
    setCcRatioHigh('3'); setCcRatioMed('2'); setCcRatioLow('1');
    setCcDayTypes({
      Monday: 'none', Tuesday: 'none', Wednesday: 'none',
      Thursday: 'none', Friday: 'none', Saturday: 'none', Sunday: 'none'
    });
    setCcResult(null);
    setShowCarbCycleModal(true);
  }

  // ── CYCLE EDIT / RETAG ────────────────────────────────

  function openEditCycle(cycle) {
    setEditingCycle(cycle);
    setEditCycleInput({
      start_date: cycle.cycle_start_date,
      cycle_length: String(cycle.cycle_length),
      period_length: String(cycle.period_length),
    });
    setShowEditCycleModal(true);
  }

  async function saveEditCycle() {
    if (!editCycleInput.start_date) {
      showAlert('Error', 'Enter the start date'); return;
    }
    setLoading(true);
    const newStart = editCycleInput.start_date;
    const newLength = parseInt(editCycleInput.cycle_length) || 28;
    const newPeriod = parseInt(editCycleInput.period_length) || 5;
    await supabase.from('menstrual_cycles').update({
      cycle_start_date: newStart,
      cycle_length: newLength,
      period_length: newPeriod,
      updated_at: new Date().toISOString(),
    }).eq('id', editingCycle.id);
    setLoading(false);
    setShowEditCycleModal(false);
    await retroactivelyRetag(newStart, newLength);
    fetchAll();
  }

  async function deleteCycleEntry(cycle) {
    showConfirm('Delete Cycle Entry', `Delete cycle starting ${cycle.cycle_start_date}?`,
      async () => {
        setRetagging(true);
        const endDate = new Date(
          new Date(cycle.cycle_start_date).getTime() +
          cycle.cycle_length * 24 * 60 * 60 * 1000
        ).toISOString().split('T')[0];
        await supabase.from('workout_logs')
          .update({ cycle_phase: null })
          .eq('client_id', client.id)
          .gte('logged_at', cycle.cycle_start_date)
          .lte('logged_at', endDate + 'T23:59:59');
        await supabase.from('menstrual_cycles').delete().eq('id', cycle.id);
        setRetagging(false);
        fetchAll();
        showAlert('🗑️ Deleted', 'Cycle entry removed and phase tags cleared.');
      }, null, 'Delete', true
    );
  }

  async function retroactivelyRetag(startDate, cycleLength) {
    setRetagging(true);
    const endDate = new Date(
      new Date(startDate).getTime() + cycleLength * 24 * 60 * 60 * 1000
    ).toISOString().split('T')[0];
    const { data: logs } = await supabase
      .from('workout_logs').select('id, logged_at')
      .eq('client_id', client.id)
      .gte('logged_at', startDate)
      .lte('logged_at', endDate + 'T23:59:59');
    if (!logs || logs.length === 0) { setRetagging(false); return; }
    for (const log of logs) {
      const logDate = log.logged_at.split('T')[0];
      const phase = getPhaseForDate(logDate, startDate, cycleLength);
      await supabase.from('workout_logs')
        .update({ cycle_phase: phase?.name || null })
        .eq('id', log.id);
    }
    setRetagging(false);
    showAlert('✅ Done!', `${logs.length} workout logs updated with corrected phase tags.`);
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
  const tabs = ['weight', 'macros', 'food', 'mealplans', 'carbcycle', 'tdee', 'feedback', ...(isFemale ? ['cycle'] : [])];
  const tabLabels = ['⚖️ Weight', '🥗 Macros', '🍽️ Food Log', '📋 Meal Plans', '🔄 Carb Cycle', '🔢 TDEE', '💬 Feedback', ...(isFemale ? ['🌸 Cycle'] : [])];
  const todayCarbTargets = getTodayCarbCycleTargets();
  const activeCarbPlan = carbCyclePlans.find(p => p.is_active);

  // Get linked meal plan for today's carb type
  function getLinkedMealPlanForDay(dayType) {
    if (!dayType || dayType === 'none') return null;
    return mealPlanTemplates.find(p =>
      p.carb_cycle_day_type === dayType &&
      (p.carb_cycle_plan_id === activeCarbPlan?.id || !p.carb_cycle_plan_id)
    ) || null;
  }

  const todayLinkedPlan = todayCarbTargets
    ? getLinkedMealPlanForDay(todayCarbTargets.dayType)
    : null;

  return (
    <View style={styles.container}>

      {retagging && (
        <View style={styles.retaggingOverlay}>
          <View style={styles.retaggingCard}>
            <ActivityIndicator color={COLORS.roseGold} size="large" />
            <Text style={styles.retaggingText}>Updating phase tags...</Text>
            <Text style={styles.retaggingSubText}>
              Retroactively updating workout logs for {client.name}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.banner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name?.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientSub}>Health & Nutrition · {ul}</Text>
        </View>
      </View>

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

            {/* Carb cycle linked plans summary */}
            {activeCarbPlan && (
              <View style={styles.ccLinkedSummary}>
                <Text style={styles.ccLinkedSummaryTitle}>
                  🔄 Linked to: {activeCarbPlan.name}
                </Text>
                {['high','medium','low'].map(type => {
                  const linked = getLinkedMealPlanForDay(type);
                  return (
                    <View key={type} style={styles.ccLinkedRow}>
                      <View style={[styles.ccLinkedDot, { backgroundColor: CC_DAY_COLORS[type] }]} />
                      <Text style={[styles.ccLinkedType, { color: CC_DAY_COLORS[type] }]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)} Carb
                      </Text>
                      <Text style={styles.ccLinkedPlan}>
                        {linked ? linked.name : '— No plan linked'}
                      </Text>
                      {linked && (
                        <TouchableOpacity onPress={() => openEditPlan(linked)}>
                          <Text style={styles.ccLinkedEdit}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

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
                  const dayTypeInfo = plan.carb_cycle_day_type
                    ? CC_DAY_TYPE_INFO[plan.carb_cycle_day_type] : null;
                  return (
                    <View key={plan.id} style={[styles.planCard,
                      dayTypeInfo && { borderLeftColor: CC_DAY_COLORS[plan.carb_cycle_day_type], borderLeftWidth: 3 }]}>
                      <TouchableOpacity style={styles.planHeader}
                        onPress={() => setExpandedPlanId(isExpanded ? null : plan.id)}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.planName}>{plan.name}</Text>
                            {dayTypeInfo && (
                              <View style={[styles.ccDayTypePlanBadge, {
                                backgroundColor: CC_DAY_COLORS[plan.carb_cycle_day_type] + '33',
                                borderColor: CC_DAY_COLORS[plan.carb_cycle_day_type],
                              }]}>
                                <Text style={[styles.ccDayTypePlanBadgeText, {
                                  color: CC_DAY_COLORS[plan.carb_cycle_day_type]
                                }]}>
                                  {dayTypeInfo.label}
                                </Text>
                              </View>
                            )}
                          </View>
                          {plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
                          <View style={styles.planMacroRow}>
                            <Text style={[styles.planMacroText, { color: '#FF6B6B' }]}>P:{totalP.toFixed(0)}g</Text>
                            <Text style={[styles.planMacroText, { color: '#4ECDC4' }]}>C:{totalC.toFixed(0)}g</Text>
                            <Text style={[styles.planMacroText, { color: '#FFE66D' }]}>F:{totalF.toFixed(0)}g</Text>
                            <Text style={[styles.planMacroText, { color: COLORS.roseGold }]}>{totalCals.toFixed(0)}kcal</Text>
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

        {/* ═══ CARB CYCLE TAB ═══ */}
        {tab === 'carbcycle' && (
          <View>
            {todayCarbTargets && todayCarbTargets.dayType !== 'none' && (
              <View style={[styles.ccTodayCard, {
                borderColor: CC_DAY_COLORS[todayCarbTargets.dayType]
              }]}>
                <Text style={styles.ccTodayTitle}>
                  📅 Today — {todayCarbTargets.todayName}
                </Text>
                <View style={[styles.ccDayTypeBadge, {
                  backgroundColor: CC_DAY_COLORS[todayCarbTargets.dayType] + '33'
                }]}>
                  <Text style={[styles.ccDayTypeBadgeText, {
                    color: CC_DAY_COLORS[todayCarbTargets.dayType]
                  }]}>
                    {todayCarbTargets.dayType.toUpperCase()} CARB DAY
                  </Text>
                </View>
                <View style={styles.ccTodayMacros}>
                  <View style={styles.ccMacroPill}>
                    <Text style={[styles.ccMacroPillVal, { color: '#4ECDC4' }]}>
                      {todayCarbTargets.carbG}g
                    </Text>
                    <Text style={styles.ccMacroPillLabel}>Carbs</Text>
                  </View>
                  <View style={styles.ccMacroPill}>
                    <Text style={[styles.ccMacroPillVal, { color: '#FF6B6B' }]}>
                      {todayCarbTargets.plan.protein_g_daily}g
                    </Text>
                    <Text style={styles.ccMacroPillLabel}>Protein</Text>
                  </View>
                  <View style={styles.ccMacroPill}>
                    <Text style={[styles.ccMacroPillVal, { color: '#FFE66D' }]}>
                      {todayCarbTargets.plan.fats_g_daily}g
                    </Text>
                    <Text style={styles.ccMacroPillLabel}>Fats</Text>
                  </View>
                  <View style={styles.ccMacroPill}>
                    <Text style={[styles.ccMacroPillVal, { color: COLORS.roseGold }]}>
                      {todayCarbTargets.cals}
                    </Text>
                    <Text style={styles.ccMacroPillLabel}>kcal</Text>
                  </View>
                </View>
                {todayLinkedPlan && (
                  <View style={styles.ccLinkedMealPlanCard}>
                    <Text style={styles.ccLinkedMealPlanTitle}>
                      📋 Linked Meal Plan: {todayLinkedPlan.name}
                    </Text>
                    <Text style={styles.ccLinkedMealPlanSub}>
                      {(todayLinkedPlan.meal_plan_items || []).length} items ·
                      {todayLinkedPlan.total_calories?.toFixed(0) || 0} kcal
                    </Text>
                    <TouchableOpacity style={styles.ccLinkedMealPlanBtn}
                      onPress={() => {
                        setApplyPlanTarget(todayLinkedPlan);
                        setApplyPlanDate(todayStr);
                        setApplyPlanReplace(false);
                        setShowApplyPlanModal(true);
                      }}>
                      <Text style={styles.ccLinkedMealPlanBtnText}>✅ Apply to Today</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.actionBtn} onPress={openNewCarbCycle}>
              <Text style={styles.actionBtnText}>🔄 Create Carb Cycling Plan</Text>
            </TouchableOpacity>

            {!macroTargets && (
              <View style={styles.ccNoTargetsWarning}>
                <Text style={styles.ccNoTargetsText}>
                  ⚠️ No macro targets set for {client.name}. Set targets first via the Macros tab or TDEE tab.
                </Text>
              </View>
            )}

            {carbCyclePlans.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyText}>No carb cycling plans yet</Text>
                  <Text style={styles.emptySub}>
                    Create a plan to distribute calories across the week
                  </Text>
                </View>
              : carbCyclePlans.map(plan => {
                  const isExpanded = expandedCarbPlanId === plan.id;
                  return (
                    <View key={plan.id} style={[styles.ccPlanCard,
                      plan.is_active && { borderColor: COLORS.roseGold }]}>
                      <TouchableOpacity style={styles.planHeader}
                        onPress={() => setExpandedCarbPlanId(isExpanded ? null : plan.id)}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.planName}>{plan.name}</Text>
                            {plan.is_active && (
                              <View style={styles.activeBadge}>
                                <Text style={styles.activeBadgeText}>Active</Text>
                              </View>
                            )}
                          </View>
                          {plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
                          <Text style={styles.ccPlanMeta}>
                            Weekly: {plan.weekly_calories}kcal ·
                            P:{plan.protein_g_daily}g · F:{plan.fats_g_daily}g
                          </Text>
                        </View>
                        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.planExpanded}>
                          <Text style={styles.ccWeekTitle}>📅 Weekly Schedule</Text>
                          <View style={styles.ccWeekGrid}>
                            {DAYS_ORDERED.map(day => {
                              let dayType = 'none';
                              if ((plan.high_carb_days || []).includes(day)) dayType = 'high';
                              else if ((plan.medium_carb_days || []).includes(day)) dayType = 'medium';
                              else if ((plan.low_carb_days || []).includes(day)) dayType = 'low';
                              const carbG = dayType === 'high' ? plan.high_carb_g
                                : dayType === 'medium' ? plan.medium_carb_g
                                : dayType === 'low' ? plan.low_carb_g : null;
                              const cals = dayType === 'high' ? plan.high_carb_calories
                                : dayType === 'medium' ? plan.medium_carb_calories
                                : dayType === 'low' ? plan.low_carb_calories : null;
                              const linkedPlan = getLinkedMealPlanForDay(dayType);
                              return (
                                <View key={day} style={[styles.ccDayCard, {
                                  borderColor: CC_DAY_COLORS[dayType],
                                  backgroundColor: CC_DAY_COLORS[dayType] + '11',
                                }]}>
                                  <Text style={styles.ccDayName}>{day.slice(0, 3)}</Text>
                                  <Text style={[styles.ccDayType, {
                                    color: CC_DAY_COLORS[dayType]
                                  }]}>
                                    {CC_DAY_LABELS[dayType]}
                                  </Text>
                                  {carbG && <Text style={styles.ccDayCarbG}>{carbG}g C</Text>}
                                  {cals && <Text style={styles.ccDayCals}>{cals} kcal</Text>}
                                  {linkedPlan && <Text style={styles.ccDayLinked}>📋</Text>}
                                </View>
                              );
                            })}
                          </View>

                          {/* Linked meal plans per type */}
                          <Text style={styles.ccWeekTitle}>📋 Linked Meal Plans</Text>
                          {['high','medium','low'].map(type => {
                            const linked = getLinkedMealPlanForDay(type);
                            const daysOfType = type === 'high' ? plan.high_carb_days
                              : type === 'medium' ? plan.medium_carb_days
                              : plan.low_carb_days;
                            if (!(daysOfType || []).length) return null;
                            return (
                              <View key={type} style={[styles.ccLinkedPlanRow, {
                                borderColor: CC_DAY_COLORS[type]
                              }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.ccLinkedPlanType, { color: CC_DAY_COLORS[type] }]}>
                                    {CC_DAY_TYPE_INFO[type].label}
                                  </Text>
                                  <Text style={styles.ccLinkedPlanName}>
                                    {linked ? linked.name : '— No meal plan linked'}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.ccLinkPlanBtn}
                                  onPress={() => {
                                    if (linked) {
                                      openEditPlan(linked);
                                    } else {
                                      openNewPlan();
                                      setPlanCarbDayType(type);
                                      setPlanCarbCyclePlanId(plan.id);
                                      setPlanName(`${client.name} - ${CC_DAY_TYPE_INFO[type].label}`);
                                    }
                                  }}>
                                  <Text style={styles.ccLinkPlanBtnText}>
                                    {linked ? '✏️ Edit' : '+ Create'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}

                          <View style={styles.planActions}>
                            <TouchableOpacity style={styles.planApplyBtn}
                              onPress={async () => {
                                await supabase.from('carb_cycling_plans')
                                  .update({ is_active: false })
                                  .eq('client_id', client.id);
                                await supabase.from('carb_cycling_plans')
                                  .update({ is_active: true })
                                  .eq('id', plan.id);
                                fetchAll();
                                showAlert('✅ Activated!', `"${plan.name}" is now active.`);
                              }}>
                              <Text style={styles.planApplyBtnText}>
                                {plan.is_active ? '✅ Active' : '▶ Set Active'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.planEditBtn}
                              onPress={() => openEditCarbCycle(plan)}>
                              <Text style={styles.planEditBtnText}>✏️ Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.planDeleteBtn}
                              onPress={() => deleteCarbCyclePlan(plan)}>
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
                        <Text style={[styles.tdeeAdjChipText, tdeeDeficit === v && { color: COLORS.white }]}>-{v}</Text>
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
                        <Text style={[styles.tdeeAdjChipText, tdeeSurplus === v && { color: COLORS.white }]}>+{v}</Text>
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
                <TouchableOpacity style={styles.tdeeCarbCycleBtn} onPress={applyTdeeToCarb}>
                  <Text style={styles.tdeeCarbCycleBtnText}>
                    🔄 Create Carb Cycle from this TDEE
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
                {navigation && (
                  <TouchableOpacity style={styles.phaseProgressBtn}
                    onPress={() => navigation.navigate('PhaseProgress', { client })}>
                    <Text style={styles.phaseProgressBtnText}>
                      📊 View Phase Records & Trends for {client.name}
                    </Text>
                  </TouchableOpacity>
                )}
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
                <Text style={styles.sectionTitle}>Cycle History</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8, fontStyle: 'italic' }}>
                  ✏️ Edit to retroactively fix phase tags on workout logs
                </Text>
                {cycles.map((c, i) => (
                  <View key={c.id || i} style={styles.cycleHistoryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cycleHistoryDate}>🔴 {c.cycle_start_date}</Text>
                      <Text style={styles.cycleHistoryDetail}>
                        {c.cycle_length} day cycle · {c.period_length} day period
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.cycleEditBtn}
                      onPress={() => openEditCycle(c)}>
                      <Text>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cycleDelBtn}
                      onPress={() => deleteCycleEntry(c)}>
                      <Text>🗑️</Text>
                    </TouchableOpacity>
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
                { label: 'Fiber per 100g', field: 'fiber_g', type: 'numeric', placeholder: '0' },
                { label: 'Sugar per 100g', field: 'sugar_g', type: 'numeric', placeholder: '0' },
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

              {/* Macro targets guide */}
              {macroTargets && (
                <View style={styles.mpTargetGuide}>
                  <Text style={styles.mpTargetGuideTitle}>📊 Client's Daily Targets</Text>
                  <View style={styles.mpTargetGuideRow}>
                    {[
                      { label: 'P', val: macroTargets.protein_g, color: '#FF6B6B' },
                      { label: 'C', val: macroTargets.carbs_g, color: '#4ECDC4' },
                      { label: 'F', val: macroTargets.fats_g, color: '#FFE66D' },
                      { label: 'kcal', val: macroTargets.calories, color: COLORS.roseGold },
                    ].map(m => (
                      <View key={m.label} style={[styles.mpTargetPill, { borderColor: m.color }]}>
                        <Text style={[styles.mpTargetVal, { color: m.color }]}>{m.val}</Text>
                        <Text style={styles.mpTargetLabel}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Carb cycle day type linking */}
              {activeCarbPlan && (
                <View style={styles.mpCarbLinkSection}>
                  <Text style={styles.mpTargetGuideTitle}>
                    🔄 Link to Carb Cycle Day Type
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 10 }}>
                    Link this meal plan to a day type in "{activeCarbPlan.name}"
                  </Text>
                  <View style={styles.mpCarbLinkRow}>
                    {[
                      { type: 'none', label: '— Not linked', cals: null, carbs: null },
                      { type: 'high', label: '🔴 High', cals: activeCarbPlan.high_carb_calories, carbs: activeCarbPlan.high_carb_g },
                      { type: 'medium', label: '🟡 Medium', cals: activeCarbPlan.medium_carb_calories, carbs: activeCarbPlan.medium_carb_g },
                      { type: 'low', label: '🔵 Low', cals: activeCarbPlan.low_carb_calories, carbs: activeCarbPlan.low_carb_g },
                    ].map(t => (
                      <TouchableOpacity key={t.type}
                        style={[styles.mpCarbLinkChip, {
                          backgroundColor: planCarbDayType === t.type
                            ? (CC_DAY_COLORS[t.type] || COLORS.roseGold)
                            : 'transparent',
                          borderColor: CC_DAY_COLORS[t.type] || COLORS.darkBorder,
                        }]}
                        onPress={() => setPlanCarbDayType(t.type)}>
                        <Text style={[styles.mpCarbLinkChipText, {
                          color: planCarbDayType === t.type
                            ? COLORS.white
                            : (CC_DAY_COLORS[t.type] || COLORS.textMuted)
                        }]}>
                          {t.label}
                        </Text>
                        {t.cals && (
                          <Text style={[styles.mpCarbLinkChipSub, {
                            color: planCarbDayType === t.type ? 'rgba(255,255,255,0.8)' : COLORS.textMuted
                          }]}>
                            {t.carbs}g C · {t.cals}kcal
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                  {planCarbDayType !== 'none' && (
                    <View style={styles.mpCarbTargetHint}>
                      <Text style={styles.mpCarbTargetHintText}>
                        Target for {planCarbDayType} day:
                        C:{planCarbDayType === 'high' ? activeCarbPlan.high_carb_g
                          : planCarbDayType === 'medium' ? activeCarbPlan.medium_carb_g
                          : activeCarbPlan.low_carb_g}g ·
                        P:{activeCarbPlan.protein_g_daily}g ·
                        F:{activeCarbPlan.fats_g_daily}g ·
                        {planCarbDayType === 'high' ? activeCarbPlan.high_carb_calories
                          : planCarbDayType === 'medium' ? activeCarbPlan.medium_carb_calories
                          : activeCarbPlan.low_carb_calories}kcal
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.modalLabel}>Plan Name *</Text>
              <RNTextInput value={planName} onChangeText={setPlanName}
                style={styles.modalInput} placeholder="e.g. Cutting Day A"
                placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.modalLabel}>Description (optional)</Text>
              <RNTextInput value={planDesc} onChangeText={setPlanDesc}
                style={styles.modalInput} placeholder="e.g. Low carb day"
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
                  <Text style={styles.sharedToggleDesc}>Shared plans can be used by any client</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.modalLabel}>Food Items ({planItems.length} added)</Text>
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
              {planItemStep === 'list' ? (
                <TouchableOpacity style={styles.addItemBtn}
                  onPress={() => setPlanItemStep('search')}>
                  <Text style={styles.addItemBtnText}>➕ Add Food Item</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.addItemForm}>
                  <Text style={styles.modalLabel}>Meal Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
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
                  <Text style={styles.modalSaveText}>{loading ? 'Saving...' : '💾 Save Plan'}</Text>
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
                <Text style={styles.modalSaveText}>{loading ? 'Applying...' : 'Apply Plan'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ CARB CYCLING MODAL ═══ */}
      <Modal visible={showCarbCycleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '95%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingCarbPlan ? '✏️ Edit Carb Cycle' : '🔄 New Carb Cycling Plan'}
              </Text>

              {macroTargets && !editingCarbPlan && (
                <View style={styles.ccAutoFillNote}>
                  <Text style={styles.ccAutoFillNoteText}>
                    ✅ Auto-filled from {client.name}'s macro targets ({macroTargets.calories} kcal/day). Edit if needed.
                  </Text>
                </View>
              )}

              <Text style={styles.modalLabel}>Plan Name *</Text>
              <RNTextInput value={ccName} onChangeText={setCcName}
                style={styles.modalInput} placeholder="e.g. Week 1 Carb Cycle"
                placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.modalLabel}>Description (optional)</Text>
              <RNTextInput value={ccDesc} onChangeText={setCcDesc}
                style={styles.modalInput} placeholder="e.g. Cutting phase"
                placeholderTextColor={COLORS.textMuted} />

              <View style={styles.ccSection}>
                <Text style={styles.ccSectionTitle}>Step 1 — Weekly Targets</Text>
                <Text style={styles.modalLabel}>Weekly Calories (total for 7 days)</Text>
                <RNTextInput value={ccWeeklyCals} onChangeText={setCcWeeklyCals}
                  style={styles.modalInput} placeholder="e.g. 18200"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                {ccWeeklyCals && (
                  <Text style={styles.ccDailyAvg}>
                    Daily avg: {Math.round(parseFloat(ccWeeklyCals) / 7)} kcal/day
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalLabel, { color: '#FF6B6B' }]}>Daily Protein (g)</Text>
                    <RNTextInput value={ccProtein} onChangeText={setCcProtein}
                      style={[styles.modalInput, { borderColor: '#FF6B6B66' }]}
                      placeholder="150" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalLabel, { color: '#FFE66D' }]}>Daily Fats (g)</Text>
                    <RNTextInput value={ccFats} onChangeText={setCcFats}
                      style={[styles.modalInput, { borderColor: '#FFE66D66' }]}
                      placeholder="60" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                  </View>
                </View>
                {ccProtein && ccFats && (
                  <Text style={styles.ccFixedNote}>
                    Fixed daily: {Math.round((parseFloat(ccProtein)||0)*4 + (parseFloat(ccFats)||0)*9)} kcal
                  </Text>
                )}
              </View>

              <View style={styles.ccSection}>
                <Text style={styles.ccSectionTitle}>Step 2 — Assign Day Types</Text>
                <Text style={styles.ccSectionNote}>
                  H = High Carb · M = Medium Carb · L = Low Carb · — = Rest/off
                </Text>
                {DAYS_ORDERED.map(day => (
                  <View key={day} style={styles.ccDayRow}>
                    <Text style={styles.ccDayRowName}>{day}</Text>
                    <View style={styles.ccDayChips}>
                      {(['high','medium','low','none']).map(type => (
                        <TouchableOpacity key={type}
                          style={[styles.ccDayChip, {
                            backgroundColor: ccDayTypes[day] === type
                              ? CC_DAY_COLORS[type] : 'transparent',
                            borderColor: CC_DAY_COLORS[type],
                          }]}
                          onPress={() => setCcDayTypes(d => ({ ...d, [day]: type }))}>
                          <Text style={[styles.ccDayChipText, {
                            color: ccDayTypes[day] === type ? COLORS.white : CC_DAY_COLORS[type]
                          }]}>
                            {type === 'none' ? '—' : type === 'high' ? 'H' : type === 'medium' ? 'M' : 'L'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.ccSection}>
                <Text style={styles.ccSectionTitle}>Step 3 — Carb Ratios (optional)</Text>
                <Text style={styles.ccSectionNote}>
                  Default 3:2:1 — high day has 3× more carbs than low day.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { label: 'High ratio', val: ccRatioHigh, set: setCcRatioHigh, color: '#FF6B6B' },
                    { label: 'Med ratio', val: ccRatioMed, set: setCcRatioMed, color: '#FFE66D' },
                    { label: 'Low ratio', val: ccRatioLow, set: setCcRatioLow, color: '#4ECDC4' },
                  ].map(r => (
                    <View key={r.label} style={{ flex: 1 }}>
                      <Text style={[styles.modalLabel, { color: r.color }]}>{r.label}</Text>
                      <RNTextInput value={r.val} onChangeText={r.set}
                        style={[styles.modalInput, { borderColor: r.color + '66' }]}
                        placeholder="1" placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric" />
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={styles.ccComputeBtn} onPress={computeCarbCycle}>
                <Text style={styles.ccComputeBtnText}>⚡ Compute Carb Cycle</Text>
              </TouchableOpacity>

              {ccResult && (
                <View style={styles.ccResultCard}>
                  <Text style={styles.ccResultTitle}>📊 Computed Plan</Text>
                  <Text style={[styles.ccResultWeekly, {
                    color: Math.abs(ccResult.weeklyCals - parseFloat(ccWeeklyCals)) < 50
                      ? COLORS.success : '#FFB347'
                  }]}>
                    Weekly total: {ccResult.weeklyCals} kcal (target: {ccWeeklyCals})
                  </Text>
                  <View style={styles.ccResultGrid}>
                    {[
                      { type: 'high', label: 'High Carb Day', carbG: ccResult.highCarbG, cals: ccResult.highCals, days: ccResult.highDays },
                      { type: 'medium', label: 'Medium Carb Day', carbG: ccResult.medCarbG, cals: ccResult.medCals, days: ccResult.medDays },
                      { type: 'low', label: 'Low Carb Day', carbG: ccResult.lowCarbG, cals: ccResult.lowCals, days: ccResult.lowDays },
                    ].filter(t => (t.days || []).length > 0).map(t => (
                      <View key={t.type} style={[styles.ccResultItem, {
                        borderColor: CC_DAY_COLORS[t.type],
                        backgroundColor: CC_DAY_COLORS[t.type] + '11',
                      }]}>
                        <Text style={[styles.ccResultItemTitle, { color: CC_DAY_COLORS[t.type] }]}>
                          {t.label}
                        </Text>
                        <Text style={styles.ccResultItemMacro}>Carbs: {t.carbG}g</Text>
                        <Text style={styles.ccResultItemMacro}>Protein: {ccResult.proteinG}g</Text>
                        <Text style={styles.ccResultItemMacro}>Fats: {ccResult.fatsG}g</Text>
                        <Text style={[styles.ccResultItemCals, { color: CC_DAY_COLORS[t.type] }]}>
                          {t.cals} kcal
                        </Text>
                        <Text style={styles.ccResultItemDays}>
                          {(t.days || []).join(', ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowCarbCycleModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, loading && { opacity: 0.6 }]}
                  onPress={saveCarbCyclePlan} disabled={loading}>
                  <Text style={styles.modalSaveText}>
                    {loading ? 'Saving...' : '💾 Save Plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ EDIT CYCLE MODAL ═══ */}
      <Modal visible={showEditCycleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✏️ Edit Cycle</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 12 }}>
              Saving will retroactively update phase tags on all workout logs within this cycle's date range.
            </Text>
            <Text style={styles.modalLabel}>Period Start Date (YYYY-MM-DD)</Text>
            <RNTextInput value={editCycleInput.start_date}
              onChangeText={v => setEditCycleInput(c => ({ ...c, start_date: v }))}
              style={styles.modalInput} placeholder="e.g. 2026-04-22"
              placeholderTextColor={COLORS.textMuted} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Cycle Length (days)</Text>
                <RNTextInput value={editCycleInput.cycle_length}
                  onChangeText={v => setEditCycleInput(c => ({ ...c, cycle_length: v }))}
                  style={styles.modalInput} placeholder="28"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Period Length (days)</Text>
                <RNTextInput value={editCycleInput.period_length}
                  onChangeText={v => setEditCycleInput(c => ({ ...c, period_length: v }))}
                  style={styles.modalInput} placeholder="5"
                  placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowEditCycleModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={saveEditCycle} disabled={loading}>
                <Text style={styles.modalSaveText}>{loading ? '...' : 'Save & Retag'}</Text>
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
  cycleHistoryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  cycleHistoryDate: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  cycleHistoryDetail: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  cycleEditBtn: { padding: 8, backgroundColor: COLORS.darkCard2, borderRadius: 6, marginLeft: 6 },
  cycleDelBtn: { padding: 8, backgroundColor: '#FF4B4B22', borderRadius: 6, marginLeft: 4 },
  phaseProgressBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  phaseProgressBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
  retaggingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  retaggingCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  retaggingText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  retaggingSubText: { color: COLORS.textMuted, fontSize: SIZES.sm },
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
  // Meal plan linked styles
  ccLinkedSummary: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  ccLinkedSummaryTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 10 },
  ccLinkedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  ccLinkedDot: { width: 8, height: 8, borderRadius: 4 },
  ccLinkedType: { width: 80, fontSize: SIZES.xs, ...FONTS.bold },
  ccLinkedPlan: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.xs },
  ccLinkedEdit: { fontSize: 14 },
  ccDayTypePlanBadge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  ccDayTypePlanBadgeText: { fontSize: 9, ...FONTS.bold },
  ccLinkedMealPlanCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  ccLinkedMealPlanTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 4 },
  ccLinkedMealPlanSub: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 8 },
  ccLinkedMealPlanBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 8, alignItems: 'center' },
  ccLinkedMealPlanBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xs },
  ccLinkedPlanRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1 },
  ccLinkedPlanType: { fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 2 },
  ccLinkedPlanName: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  ccLinkPlanBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  ccLinkPlanBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  // Meal plan modal carb link
  mpTargetGuide: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  mpTargetGuideTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  mpTargetGuideRow: { flexDirection: 'row', gap: 8 },
  mpTargetPill: { flex: 1, borderRadius: RADIUS.md, padding: 8, alignItems: 'center', borderWidth: 1, backgroundColor: COLORS.darkCard },
  mpTargetVal: { fontSize: SIZES.md, ...FONTS.bold },
  mpTargetLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  mpCarbLinkSection: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  mpCarbLinkRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mpCarbLinkChip: { flex: 1, minWidth: 70, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1.5 },
  mpCarbLinkChipText: { fontSize: SIZES.xs, ...FONTS.bold, textAlign: 'center' },
  mpCarbLinkChipSub: { fontSize: 8, marginTop: 3, textAlign: 'center' },
  mpCarbTargetHint: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 10, marginTop: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  mpCarbTargetHintText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  // Carb cycle tab
  ccTodayCard: { borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 2, backgroundColor: COLORS.darkCard },
  ccTodayTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 8 },
  ccDayTypeBadge: { borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 12 },
  ccDayTypeBadgeText: { ...FONTS.heavy, fontSize: SIZES.sm },
  ccTodayMacros: { flexDirection: 'row', gap: 8 },
  ccMacroPill: { flex: 1, backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  ccMacroPillVal: { fontSize: SIZES.lg, ...FONTS.bold },
  ccMacroPillLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  ccNoTargetsWarning: { backgroundColor: '#FFB34722', borderRadius: RADIUS.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFB347' },
  ccNoTargetsText: { color: '#FFB347', fontSize: SIZES.xs, lineHeight: 16 },
  ccPlanCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder, overflow: 'hidden' },
  ccPlanMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4 },
  activeBadge: { backgroundColor: COLORS.success + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.success },
  activeBadgeText: { color: COLORS.success, fontSize: 9, ...FONTS.bold },
  ccWeekTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  ccWeekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  ccDayCard: { width: '13%', borderRadius: RADIUS.sm, padding: 6, alignItems: 'center', borderWidth: 1 },
  ccDayName: { color: COLORS.textMuted, fontSize: 8, marginBottom: 2 },
  ccDayType: { fontSize: SIZES.md, ...FONTS.heavy },
  ccDayCarbG: { color: COLORS.white, fontSize: 8, marginTop: 2 },
  ccDayCals: { color: COLORS.textMuted, fontSize: 7, marginTop: 1 },
  ccDayLinked: { fontSize: 8, marginTop: 2 },
  ccSection: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  ccSectionTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 8 },
  ccSectionNote: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 12, lineHeight: 16 },
  ccDailyAvg: { color: COLORS.roseGold, fontSize: SIZES.xs, marginBottom: 8, textAlign: 'right' },
  ccFixedNote: { color: '#4ECDC4', fontSize: SIZES.xs, marginBottom: 4, textAlign: 'right' },
  ccDayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  ccDayRowName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold, width: 100 },
  ccDayChips: { flexDirection: 'row', gap: 6, flex: 1 },
  ccDayChip: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1.5 },
  ccDayChipText: { fontSize: SIZES.sm, ...FONTS.heavy },
  ccComputeBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  ccComputeBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  ccResultCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  ccResultTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 8 },
  ccResultWeekly: { fontSize: SIZES.sm, ...FONTS.semibold, marginBottom: 12 },
  ccResultGrid: { gap: 8 },
  ccResultItem: { borderRadius: RADIUS.md, padding: 12, borderWidth: 1 },
  ccResultItemTitle: { fontSize: SIZES.sm, ...FONTS.bold, marginBottom: 6 },
  ccResultItemMacro: { color: COLORS.white, fontSize: SIZES.xs, marginBottom: 2 },
  ccResultItemCals: { fontSize: SIZES.lg, ...FONTS.bold, marginTop: 4 },
  ccResultItemDays: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4 },
  ccAutoFillNote: { backgroundColor: '#00C89622', borderRadius: RADIUS.md, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#00C896' },
  ccAutoFillNoteText: { color: '#00C896', fontSize: SIZES.xs, lineHeight: 16 },
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
  tdeeApplyBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  tdeeApplyBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  tdeeCarbCycleBtn: { backgroundColor: '#4ECDC422', borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4ECDC4' },
  tdeeCarbCycleBtnText: { color: '#4ECDC4', ...FONTS.bold, fontSize: SIZES.md },
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