import React, { useState, useEffect, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput, Animated, ActivityIndicator
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getPhaseForDate, getCurrentPhase } from '../../data/cycleData';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];
const TIMER_PRESETS = [30, 60, 90, 120, 180, 300];
const MAX_CLIENTS = 4;
const CLIENT_COLORS = [COLORS.roseGold, '#4ECDC4', '#FFE66D', '#FF9F43'];

export default function MultiClientSessionScreen({ navigation }) {
  const { user, unit } = useAuth();
  const ul = unitLabel(unit);
  const todayStr = new Date().toISOString().split('T')[0];
  const currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const currentMonth = MONTHS[new Date().getMonth()];

  // Client selection
  const [allClients, setAllClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [showClientPicker, setShowClientPicker] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);

  // Active client tab
  const [activeClientIdx, setActiveClientIdx] = useState(0);

  // Per-client session data: { [clientId]: { sets, savedStatus, sessionNote, day, loading } }
  const [clientSessions, setClientSessions] = useState({});

  // Session date (shared)
  const [sessionDate, setSessionDate] = useState(todayStr);
  const [sessionDay, setSessionDay] = useState(currentDay);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInput, setDateInput] = useState(todayStr);

  // Add exercise modal
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });

  // Timer (shared across all clients)
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerDuration, setTimerDuration] = useState(90);
  const [timerCustomInput, setTimerCustomInput] = useState('');
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const timerRef = useRef(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Save all loading
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => { fetchAllClients(); }, []);

  // ── TIMER ─────────────────────────────────────────────

  useEffect(() => {
    if (timerRunning && !timerPaused) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            setTimerFinished(true);
            triggerTimerAlert();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning, timerPaused]);

  function triggerTimerAlert() {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('⏱️ Rest Complete!', { body: 'Next set ready!' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification('⏱️ Rest Complete!', { body: 'Next set ready!' });
        });
      }
    }
  }

  function startTimer(seconds) {
    clearInterval(timerRef.current);
    setTimerDuration(seconds);
    setTimerSeconds(seconds);
    setTimerRunning(true);
    setTimerPaused(false);
    setTimerFinished(false);
    setShowTimerModal(false);
  }

  function pauseResumeTimer() { setTimerPaused(p => !p); }

  function resetTimer() {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerFinished(false);
    setTimerSeconds(timerDuration);
  }

  function restartTimer() { startTimer(timerDuration); }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  const timerColor = timerSeconds <= 10 ? '#FF6B6B'
    : timerSeconds <= 30 ? '#FFE66D' : COLORS.success;
  const timerProgress = timerDuration > 0 ? timerSeconds / timerDuration : 0;

  // ── CLIENTS ───────────────────────────────────────────

  async function fetchAllClients() {
    setLoadingClients(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, name, gender, goal, unit_preference')
      .eq('role', 'client')
      .eq('status', 'active')
      .order('name');
    setAllClients(data || []);
    setLoadingClients(false);
  }

  async function initClientSession(client, day) {
    const d = day || sessionDay;

    // Fetch program
    const { data: prog } = await supabase
      .from('client_programs')
      .select('*, workout_templates(*, template_exercises(*))')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Build exercise sets from program
    let sets = [];
    if (prog?.workout_templates?.template_exercises) {
      const seen = new Set();
      const dayExs = prog.workout_templates.template_exercises
        .filter(e => e.day === d)
        .sort((a, b) => a.order_index - b.order_index)
        .filter(ex => {
          if (seen.has(ex.exercise_name)) return false;
          seen.add(ex.exercise_name); return true;
        });
      sets = dayExs.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || 'Other',
        prescribed_sets: ex.working_sets || 3,
        prescribed_reps: ex.reps || '8-12',
        entries: Array.from({ length: ex.working_sets || 3 }, () => ({
          weight: '', reps: ex.reps?.split('-')[0] || '',
          unit: client.unit_preference || unit || 'kg', is_pb: false,
        }))
      }));
    }

    // Fetch cycle phase if female
    let cyclePhaseTag = null;
    if (client.gender === 'Female') {
      const { data: cycles } = await supabase
        .from('menstrual_cycles').select('*')
        .eq('client_id', client.id)
        .order('cycle_start_date', { ascending: false }).limit(1);
      if (cycles && cycles.length > 0) {
        const phase = getPhaseForDate(sessionDate, cycles[0].cycle_start_date, cycles[0].cycle_length);
        cyclePhaseTag = phase?.name || null;
      }
    }

    return {
      sets,
      sessionNote: '',
      savedStatus: false,
      loading: false,
      program: prog,
      cyclePhaseTag,
      day: d,
    };
  }

  async function confirmClientSelection() {
    if (selectedClients.length === 0) {
      showAlert('Select Clients', 'Select at least one client'); return;
    }
    setLoadingClients(true);
    const sessions = {};
    for (const client of selectedClients) {
      sessions[client.id] = await initClientSession(client, sessionDay);
    }
    setClientSessions(sessions);
    setActiveClientIdx(0);
    setShowClientPicker(false);
    setLoadingClients(false);
  }

  function toggleClientSelect(client) {
    setSelectedClients(s => {
      const exists = s.find(c => c.id === client.id);
      if (exists) return s.filter(c => c.id !== client.id);
      if (s.length >= MAX_CLIENTS) {
        showAlert('Max Clients', `You can only log up to ${MAX_CLIENTS} clients at once`);
        return s;
      }
      return [...s, client];
    });
  }

  // ── SESSION DATA HELPERS ──────────────────────────────

  function getActiveClient() {
    return selectedClients[activeClientIdx];
  }

  function getActiveSession() {
    const client = getActiveClient();
    return client ? clientSessions[client.id] : null;
  }

  function updateActiveSession(updater) {
    const client = getActiveClient();
    if (!client) return;
    setClientSessions(s => ({
      ...s,
      [client.id]: updater(s[client.id])
    }));
  }

  // ── SET MANAGEMENT ───────────────────────────────────

  function updateEntry(exIdx, setIdx, field, value) {
    updateActiveSession(session => ({
      ...session,
      sets: session.sets.map((ex, i) => i === exIdx
        ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
        : ex
      )
    }));
  }

  function addSet(exIdx) {
    updateActiveSession(session => ({
      ...session,
      sets: session.sets.map((ex, i) => i === exIdx
        ? { ...ex, entries: [...ex.entries, { weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }
        : ex
      )
    }));
  }

  function removeSet(exIdx, setIdx) {
    showConfirm('Remove Set', 'Remove this set?', () => {
      updateActiveSession(session => ({
        ...session,
        sets: session.sets.map((ex, i) => i === exIdx
          ? { ...ex, entries: ex.entries.filter((_, j) => j !== setIdx) }
          : ex
        )
      }));
    }, null, 'Remove', true);
  }

  function removeExercise(exIdx) {
    showConfirm('Remove Exercise', 'Remove this exercise from session?', () => {
      updateActiveSession(session => ({
        ...session,
        sets: session.sets.filter((_, i) => i !== exIdx)
      }));
    }, null, 'Remove', true);
  }

  function addExerciseToActive() {
    if (!newEx.name.trim()) { showAlert('Error', 'Exercise name required'); return; }
    updateActiveSession(session => ({
      ...session,
      sets: [...session.sets, {
        exercise_name: newEx.name.trim(),
        muscle_group: newEx.muscle_group,
        prescribed_sets: 3, prescribed_reps: '8-12',
        entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
      }]
    }));
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
  }

  function updateSessionNote(note) {
    updateActiveSession(session => ({ ...session, sessionNote: note }));
  }

  async function changeDay(newDay) {
    const client = getActiveClient();
    if (!client) return;
    setClientSessions(s => ({
      ...s,
      [client.id]: { ...s[client.id], loading: true }
    }));
    const updated = await initClientSession(client, newDay);
    setClientSessions(s => ({
      ...s,
      [client.id]: { ...updated, loading: false }
    }));
    setSessionDay(newDay);
  }

  // ── SAVE ─────────────────────────────────────────────

  async function saveClientWorkout(client) {
    const session = clientSessions[client.id];
    if (!session) return;

    const rows = [];
    for (const ex of session.sets) {
      const { data: prData } = await supabase
        .from('workout_logs').select('weight_kg')
        .eq('client_id', client.id)
        .eq('exercise_name', ex.exercise_name)
        .order('weight_kg', { ascending: false }).limit(1);
      const currentPR = prData?.[0]?.weight_kg || 0;

      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        const weightKg = entry.weight ? toKg(parseFloat(entry.weight), entry.unit) : null;
        rows.push({
          client_id: client.id,
          logged_by: user?.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: currentMonth,
          week: 1,
          day: session.day || sessionDay,
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: weightKg && weightKg > currentPR,
          logged_at: new Date(sessionDate + 'T12:00:00').toISOString(),
          cycle_phase: session.cyclePhaseTag || null,
        });
      });
    }

    if (!rows.length) {
      showAlert('No data', `No sets logged for ${client.name}`); return;
    }

    setClientSessions(s => ({ ...s, [client.id]: { ...s[client.id], loading: true } }));

    if (session.sessionNote?.trim()) {
      await supabase.from('session_notes').upsert({
        client_id: client.id,
        date: sessionDate,
        note: session.sessionNote.trim(),
      }, { onConflict: 'client_id,date' });
    }

    const { error } = await supabase.from('workout_logs').insert(rows);
    setClientSessions(s => ({
      ...s,
      [client.id]: { ...s[client.id], loading: false, savedStatus: !error }
    }));

    if (error) {
      showAlert('Error', `Failed to save ${client.name}: ${error.message}`);
    } else {
      const prs = rows.filter(r => r.is_personal_best).length;
      showAlert('✅ Saved!',
        `${client.name}: ${rows.length} sets logged!${prs > 0 ? ` 🏆 ${prs} PR!` : ''}`);
    }
  }

  async function saveAllClients() {
    setSavingAll(true);
    for (const client of selectedClients) {
      const session = clientSessions[client.id];
      if (!session?.savedStatus) {
        await saveClientWorkout(client);
      }
    }
    setSavingAll(false);
    const allSaved = selectedClients.every(c => clientSessions[c.id]?.savedStatus);
    if (allSaved) {
      showAlert('✅ All Saved!', 'All client workouts have been logged!',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    }
  }

  function confirmDate() {
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setSessionDate(dateInput);
      const d = new Date(dateInput + 'T12:00:00');
      const newDay = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
      setSessionDay(newDay);
    } else {
      showAlert('Invalid Date', 'Use YYYY-MM-DD format'); return;
    }
    setShowDatePicker(false);
  }

  // ── CLIENT PICKER ─────────────────────────────────────

  if (showClientPicker) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.pageTitle}>👥 Group Session</Text>
          <Text style={styles.pageSub}>
            Select up to {MAX_CLIENTS} clients for this session
          </Text>

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>📅 Session Date: {sessionDate}</Text>
            <TouchableOpacity style={styles.changeDateBtn}
              onPress={() => setShowDatePicker(true)}>
              <Text style={styles.changeDateBtnText}>Change</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}>
            {DAYS.map(d => (
              <TouchableOpacity key={d}
                style={[styles.chip, sessionDay === d && styles.chipActive]}
                onPress={() => setSessionDay(d)}>
                <Text style={[styles.chipText, sessionDay === d && styles.chipTextActive]}>
                  {d.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>
            Select Clients ({selectedClients.length}/{MAX_CLIENTS})
          </Text>

          {loadingClients ? (
            <ActivityIndicator color={COLORS.roseGold} size="large" style={{ marginTop: 40 }} />
          ) : allClients.map(client => {
            const isSelected = selectedClients.find(c => c.id === client.id);
            const selIdx = selectedClients.findIndex(c => c.id === client.id);
            return (
              <TouchableOpacity key={client.id}
                style={[styles.clientPickerRow,
                  isSelected && { borderColor: CLIENT_COLORS[selIdx] || COLORS.roseGold,
                    backgroundColor: (CLIENT_COLORS[selIdx] || COLORS.roseGold) + '11' }]}
                onPress={() => toggleClientSelect(client)}>
                <View style={[styles.clientPickerAvatar, {
                  backgroundColor: isSelected
                    ? (CLIENT_COLORS[selIdx] || COLORS.roseGold)
                    : COLORS.darkCard2
                }]}>
                  <Text style={[styles.clientPickerAvatarText, {
                    color: isSelected ? COLORS.white : COLORS.textMuted
                  }]}>
                    {isSelected ? (selIdx + 1) : client.name.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientPickerName}>{client.name}</Text>
                  <Text style={styles.clientPickerGoal}>
                    {client.goal || 'No goal'} · {client.gender || 'Unknown'}
                  </Text>
                </View>
                {isSelected && (
                  <View style={[styles.selectedBadge, {
                    backgroundColor: CLIENT_COLORS[selIdx] || COLORS.roseGold
                  }]}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.startSessionBtn,
              selectedClients.length === 0 && { opacity: 0.5 }]}
            onPress={confirmClientSelection}
            disabled={selectedClients.length === 0 || loadingClients}>
            <Text style={styles.startSessionBtnText}>
              {loadingClients ? 'Loading Programs...' : `▶ Start Session (${selectedClients.length} clients)`}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Date picker modal */}
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>📅 Session Date</Text>
              <RNTextInput value={dateInput} onChangeText={setDateInput}
                style={styles.modalInput} placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted} />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmDate}>
                  <Text style={styles.modalSaveText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── SESSION SCREEN ────────────────────────────────────

  const activeClient = getActiveClient();
  const activeSession = getActiveSession();

  return (
    <View style={styles.container}>

      {/* Client tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.clientTabsBar}
        contentContainerStyle={styles.clientTabsContent}>
        {selectedClients.map((client, idx) => {
          const session = clientSessions[client.id];
          const isActive = idx === activeClientIdx;
          const color = CLIENT_COLORS[idx] || COLORS.roseGold;
          return (
            <TouchableOpacity key={client.id}
              style={[styles.clientTab, isActive && { borderBottomColor: color, borderBottomWidth: 3 }]}
              onPress={() => setActiveClientIdx(idx)}>
              <View style={[styles.clientTabAvatar, { backgroundColor: color + '33' }]}>
                <Text style={[styles.clientTabAvatarText, { color }]}>
                  {client.name.charAt(0)}
                </Text>
              </View>
              <Text style={[styles.clientTabName, isActive && { color }]}>
                {client.name.split(' ')[0]}
              </Text>
              {session?.savedStatus && (
                <Text style={styles.clientTabSaved}>✅</Text>
              )}
              {session?.loading && (
                <ActivityIndicator size="small" color={color} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Date + day bar */}
      <View style={styles.sessionBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionBarText}>
            {activeSession?.day || sessionDay} · {sessionDate}
          </Text>
          {activeSession?.cyclePhaseTag && (
            <Text style={[styles.sessionCycleTag, { color: '#FF9F43' }]}>
              🌸 {activeSession.cyclePhaseTag}
            </Text>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.dayChip, (activeSession?.day || sessionDay) === d && styles.dayChipActive]}
              onPress={() => changeDay(d)}>
              <Text style={[styles.dayChipText,
                (activeSession?.day || sessionDay) === d && styles.dayChipTextActive]}>
                {d.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main content */}
      {activeSession?.loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.roseGold} size="large" />
          <Text style={styles.loadingText}>Loading program...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.sessionContent}>

          {/* Session note */}
          <RNTextInput
            value={activeSession?.sessionNote || ''}
            onChangeText={updateSessionNote}
            style={styles.noteInput}
            placeholder={`Session note for ${activeClient?.name}...`}
            placeholderTextColor={COLORS.textMuted}
            multiline />

          {/* Exercises */}
          {(!activeSession?.sets || activeSession.sets.length === 0) && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No exercises for this day</Text>
              <Text style={styles.emptySub}>Add exercises manually below</Text>
            </View>
          )}

          {(activeSession?.sets || []).map((ex, exIdx) => (
            <View key={exIdx} style={[styles.exerciseCard, {
              borderLeftColor: CLIENT_COLORS[activeClientIdx] || COLORS.roseGold,
              borderLeftWidth: 3,
            }]}>
              <View style={styles.exHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                  <Text style={styles.prescribedText}>
                    Prescribed: {ex.prescribed_sets}×{ex.prescribed_reps}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </TouchableOpacity>
              </View>

              {ex.entries.map((entry, setIdx) => (
                <View key={setIdx} style={styles.setCard}>
                  <View style={styles.setCardHeader}>
                    <View style={[styles.setNumBadge, {
                      borderColor: CLIENT_COLORS[activeClientIdx] || COLORS.roseGold
                    }]}>
                      <Text style={[styles.setNumBadgeText, {
                        color: CLIENT_COLORS[activeClientIdx] || COLORS.roseGold
                      }]}>
                        Set {setIdx + 1}
                      </Text>
                    </View>
                    <View style={styles.setCardActions}>
                      <TouchableOpacity
                        style={[styles.prBtn, entry.is_pb && styles.prBtnActive]}
                        onPress={() => updateEntry(exIdx, setIdx, 'is_pb', !entry.is_pb)}>
                        <Text style={styles.prBtnText}>
                          {entry.is_pb ? '🏆 PR' : '○ PR'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.removeSetBtn}
                        onPress={() => removeSet(exIdx, setIdx)}>
                        <Text style={{ color: COLORS.error }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.setCardInputs}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>Weight</Text>
                      <RNTextInput value={entry.weight}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                        style={styles.inputGroupField} placeholder="0"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    </View>
                    <TouchableOpacity style={styles.unitToggle}
                      onPress={() => updateEntry(exIdx, setIdx, 'unit',
                        entry.unit === 'kg' ? 'lbs' : 'kg')}>
                      <Text style={styles.unitToggleText}>{entry.unit || 'kg'}</Text>
                    </TouchableOpacity>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>Reps</Text>
                      <RNTextInput value={entry.reps}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                        style={styles.inputGroupField} placeholder="0"
                        placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
                <Text style={styles.addSetBtnText}>+ Add Set</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addExBtn} onPress={() => setShowAddEx(true)}>
            <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
          </TouchableOpacity>

          {/* Save this client */}
          <TouchableOpacity
            style={[styles.saveClientBtn, {
              backgroundColor: activeSession?.savedStatus
                ? COLORS.success
                : (CLIENT_COLORS[activeClientIdx] || COLORS.roseGold),
              opacity: activeSession?.loading ? 0.6 : 1,
            }]}
            onPress={() => saveClientWorkout(activeClient)}
            disabled={activeSession?.loading || activeSession?.savedStatus}>
            <Text style={styles.saveClientBtnText}>
              {activeSession?.savedStatus
                ? `✅ ${activeClient?.name} Saved`
                : activeSession?.loading
                ? 'Saving...'
                : `💾 Save ${activeClient?.name}`}
            </Text>
          </TouchableOpacity>

          {/* Save all */}
          <TouchableOpacity
            style={[styles.saveAllBtn, savingAll && { opacity: 0.6 }]}
            onPress={saveAllClients}
            disabled={savingAll}>
            <Text style={styles.saveAllBtnText}>
              {savingAll ? 'Saving All...' : '💾 Save All Clients'}
            </Text>
            <View style={styles.saveAllStatus}>
              {selectedClients.map((c, i) => (
                <Text key={c.id} style={{
                  fontSize: 12,
                  color: clientSessions[c.id]?.savedStatus ? COLORS.success : COLORS.textMuted
                }}>
                  {clientSessions[c.id]?.savedStatus ? '✅' : '○'}
                </Text>
              ))}
            </View>
          </TouchableOpacity>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Floating timer */}
      <Animated.View style={[styles.timerFab, {
        backgroundColor: timerRunning
          ? (timerFinished ? '#FF6B6B' : timerColor)
          : COLORS.roseGold,
        opacity: flashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
      }]}>
        <TouchableOpacity style={styles.timerFabInner}
          onPress={() => { if (!timerRunning && !timerFinished) setShowTimerModal(true); }}
          onLongPress={() => { if (timerRunning) pauseResumeTimer(); }}>
          <Text style={styles.timerFabIcon}>⏱️</Text>
          <Text style={styles.timerFabText}>
            {timerRunning || timerFinished ? formatTime(timerSeconds) : 'Rest'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Timer overlay */}
      {(timerRunning || timerFinished) && (
        <View style={styles.timerOverlay}>
          <View style={styles.timerOverlayCard}>
            <Text style={styles.timerOverlayTitle}>
              {timerFinished ? '✅ Rest Complete!' : '⏱️ Rest Timer'}
            </Text>
            <Text style={[styles.timerOverlayCount, { color: timerColor }]}>
              {formatTime(timerSeconds)}
            </Text>
            <View style={styles.timerProgressBg}>
              <View style={[styles.timerProgressFill, {
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
              }]} />
            </View>
            <View style={styles.timerOverlayBtns}>
              {!timerFinished ? (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={pauseResumeTimer}>
                    <Text style={styles.timerOverlayBtnText}>
                      {timerPaused ? '▶ Resume' : '⏸ Pause'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={resetTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Reset</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.timerOverlayBtn} onPress={restartTimer}>
                    <Text style={styles.timerOverlayBtnText}>↺ Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.timerOverlayBtn, { backgroundColor: COLORS.roseGold }]}
                    onPress={resetTimer}>
                    <Text style={[styles.timerOverlayBtnText, { color: COLORS.white }]}>
                      ✕ Close
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Add exercise modal */}
      <Modal visible={showAddEx} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>➕ Add Exercise</Text>
            <Text style={styles.modalLabel}>Exercise Name</Text>
            <RNTextInput value={newEx.name}
              onChangeText={v => setNewEx(e => ({ ...e, name: v }))}
              style={styles.modalInput} placeholder="e.g. Bench Press"
              placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Muscle Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}>
              {MUSCLE_GROUPS.map(m => (
                <TouchableOpacity key={m}
                  style={[styles.chip, newEx.muscle_group === m && styles.chipActive]}
                  onPress={() => setNewEx(e => ({ ...e, muscle_group: m }))}>
                  <Text style={[styles.chipText, newEx.muscle_group === m && styles.chipTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowAddEx(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={addExerciseToActive}>
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Timer setup modal */}
      <Modal visible={showTimerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⏱️ Set Rest Timer</Text>
            <Text style={styles.modalLabel}>Quick Presets</Text>
            <View style={styles.timerPresets}>
              {TIMER_PRESETS.map(s => (
                <TouchableOpacity key={s} style={styles.timerPresetBtn}
                  onPress={() => startTimer(s)}>
                  <Text style={styles.timerPresetBtnText}>
                    {s < 60 ? `${s}s` : `${s / 60}min`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Custom (seconds)</Text>
            <RNTextInput value={timerCustomInput}
              onChangeText={setTimerCustomInput}
              style={styles.modalInput} placeholder="e.g. 45"
              placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn}
                onPress={() => setShowTimerModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn}
                onPress={() => {
                  const secs = parseInt(timerCustomInput);
                  if (!secs || secs <= 0) {
                    showAlert('Error', 'Enter a valid number of seconds'); return;
                  }
                  startTimer(secs);
                }}>
                <Text style={styles.modalSaveText}>▶ Start</Text>
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
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy, marginBottom: 4 },
  pageSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  dateLabel: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold, flex: 1 },
  changeDateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGoldFaint, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  changeDateBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  clientPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  clientPickerAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  clientPickerAvatarText: { fontSize: 18, ...FONTS.bold },
  clientPickerName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  clientPickerGoal: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  selectedBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  selectedBadgeText: { color: COLORS.white, fontSize: 14, ...FONTS.bold },
  startSessionBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 16, shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  startSessionBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientTabsBar: { backgroundColor: COLORS.darkCard, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder, maxHeight: 70 },
  clientTabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  clientTab: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, borderBottomWidth: 3, borderBottomColor: 'transparent', minWidth: 80 },
  clientTabAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  clientTabAvatarText: { fontSize: 14, ...FONTS.bold },
  clientTabName: { color: COLORS.textMuted, fontSize: SIZES.xs, ...FONTS.semibold },
  clientTabSaved: { fontSize: 10, marginTop: 2 },
  sessionBar: { backgroundColor: COLORS.darkCard2, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  sessionBarText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold },
  sessionCycleTag: { fontSize: 9, marginTop: 2 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  dayChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayChipText: { color: COLORS.textSecondary, fontSize: 10 },
  dayChipTextActive: { color: COLORS.white },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  sessionContent: { padding: 12, paddingBottom: 120 },
  noteInput: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 50, textAlignVertical: 'top', marginBottom: 12 },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  exerciseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  muscleGroup: { color: COLORS.roseGold, fontSize: SIZES.xs, marginTop: 2 },
  prescribedText: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  setCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  setCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  setNumBadge: { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  setNumBadgeText: { fontSize: SIZES.xs, ...FONTS.bold },
  setCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid, borderColor: COLORS.roseGold },
  prBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  removeSetBtn: { padding: 4, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.sm },
  setCardInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  inputGroup: { flex: 1 },
  inputGroupLabel: { color: COLORS.textMuted, fontSize: 9, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  inputGroupField: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 8, color: COLORS.white, fontSize: SIZES.lg, borderWidth: 1, borderColor: COLORS.darkBorder, textAlign: 'center', ...FONTS.bold, height: 44 },
  unitToggle: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid, alignItems: 'center', justifyContent: 'center', height: 44, minWidth: 48 },
  unitToggleText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  addSetBtn: { marginTop: 6, alignItems: 'center', padding: 6, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  addExBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  addExBtnText: { color: COLORS.textSecondary, ...FONTS.medium, fontSize: SIZES.sm },
  saveClientBtn: { borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginBottom: 10, elevation: 4 },
  saveClientBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  saveAllBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: COLORS.roseGold, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  saveAllBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.md },
  saveAllStatus: { flexDirection: 'row', gap: 4 },
  timerFab: { position: 'absolute', bottom: 24, right: 16, borderRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  timerFabInner: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', minWidth: 70 },
  timerFabIcon: { fontSize: 20 },
  timerFabText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.bold, marginTop: 2 },
  timerOverlay: { position: 'absolute', bottom: 90, right: 16, left: 16 },
  timerOverlayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 20, borderWidth: 2, borderColor: COLORS.roseGold, elevation: 10 },
  timerOverlayTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, textAlign: 'center', marginBottom: 8 },
  timerOverlayCount: { fontSize: 56, ...FONTS.heavy, textAlign: 'center', marginBottom: 12 },
  timerProgressBg: { height: 6, backgroundColor: COLORS.darkCard2, borderRadius: 3, marginBottom: 16, overflow: 'hidden' },
  timerProgressFill: { height: 6, borderRadius: 3 },
  timerOverlayBtns: { flexDirection: 'row', gap: 10 },
  timerOverlayBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  timerOverlayBtnText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  timerPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  timerPresetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGoldFaint, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  timerPresetBtnText: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.sm },
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