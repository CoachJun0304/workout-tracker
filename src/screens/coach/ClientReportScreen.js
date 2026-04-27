import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toKg, toDisplay, unitLabel, estimated1RM } from '../../utils/unitUtils';
import { showAlert, showConfirm } from '../../utils/webAlert';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MUSCLE_GROUPS = ['Chest','Back','Quads','Hamstrings','Glutes','Calves',
  'Front Delts','Side Delts','Rear Delts','Biceps','Triceps','Core','Full Body'];

export default function ClientReportScreen({ route, navigation }) {
  const { client } = route.params || {};
  const { profile, unit } = useAuth();
  const ul = unitLabel(unit);
  const [program, setProgram] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [scheduleChanges, setScheduleChanges] = useState([]);
  const [sessionNotes, setSessionNotes] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  // Log workout modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [logDay, setLogDay] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logSets, setLogSets] = useState([]);
  const [logNote, setLogNote] = useState('');
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => { if (client?.id) fetchData(); }, [weekOffset]);

  function getWeekDates(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }

  const weekDates = getWeekDates(weekOffset);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  async function fetchData() {
    setLoading(true);
    const [progRes, logsRes, changesRes, notesRes] = await Promise.all([
      supabase.from('client_programs')
        .select('*, workout_templates(*, template_exercises(*))')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase.from('workout_logs')
        .select('*')
        .eq('client_id', client.id)
        .gte('logged_at', weekStart)
        .lte('logged_at', weekEnd + 'T23:59:59')
        .order('logged_at', { ascending: true }),
      supabase.from('workout_schedule_changes')
        .select('*')
        .eq('client_id', client.id)
        .gte('original_date', weekStart)
        .lte('original_date', weekEnd),
      supabase.from('session_notes')
        .select('*')
        .eq('client_id', client.id)
        .gte('date', weekStart)
        .lte('date', weekEnd),
    ]);
    setProgram(progRes.data || null);
    setWorkoutLogs(logsRes.data || []);
    setScheduleChanges(changesRes.data || []);
    setSessionNotes(notesRes.data || []);
    setLoading(false);
  }

  function getDayStatus(day, date) {
    const programExercises = program?.workout_templates?.template_exercises || [];
    const seen = new Set();
    const hasProgram = programExercises.some(e => e.day === day);
    const change = scheduleChanges.find(c => c.original_day === day || c.original_date === date);
    const dayLogs = workoutLogs.filter(l => l.logged_at?.split('T')[0] === date);
    const isToday = date === new Date().toISOString().split('T')[0];
    const isPast = new Date(date + 'T23:59:59') < new Date() && !isToday;

    if (change?.status === 'moved') return { status: 'moved', color: COLORS.roseGold, emoji: '📅', label: `Moved → ${change.rescheduled_day || 'another day'}`, note: change.notes };
    if (change?.status === 'missed') return { status: 'missed', color: COLORS.error, emoji: '❌', label: 'Marked as Missed', note: change.notes };
    if (dayLogs.length > 0) return { status: 'logged', color: COLORS.success, emoji: '✅', label: `Logged (${dayLogs.length} sets)`, note: null };
    if (!hasProgram) return { status: 'rest', color: COLORS.textMuted, emoji: '😴', label: 'Rest Day', note: null };
    if (isToday) return { status: 'today', color: '#60A5FA', emoji: '⏳', label: 'Today — not logged yet', note: null };
    if (isPast) return { status: 'missed_auto', color: COLORS.error, emoji: '⚠️', label: 'No log — likely missed', note: null };
    return { status: 'upcoming', color: COLORS.textMuted, emoji: '📋', label: 'Upcoming', note: null };
  }

  function getWeekLabel() {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === -1) return 'Last Week';
    if (weekOffset === 1) return 'Next Week';
    return new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getComplianceStats() {
    const programExercises = program?.workout_templates?.template_exercises || [];
    const trainingDays = [...new Set(programExercises.map(e => e.day))];
    let logged = 0, missed = 0, moved = 0;
    trainingDays.forEach(day => {
      const date = weekDates[DAYS.indexOf(day)];
      if (!date) return;
      const s = getDayStatus(day, date);
      if (s.status === 'logged') logged++;
      else if (s.status === 'missed_auto' || s.status === 'missed') missed++;
      else if (s.status === 'moved') moved++;
    });
    return { logged, missed, moved, total: trainingDays.length };
  }

  function openLogModal(day, date) {
    setLogDay(day);
    setLogDate(date);
    setLogNote('');

    // Pre-load exercises from program for this day
    const programExercises = program?.workout_templates?.template_exercises || [];
    const seen = new Set();
    const dayExs = programExercises
      .filter(e => e.day === day)
      .sort((a, b) => a.order_index - b.order_index)
      .filter(ex => {
        if (seen.has(ex.exercise_name)) return false;
        seen.add(ex.exercise_name);
        return true;
      });

    if (dayExs.length > 0) {
      setLogSets(dayExs.map(ex => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || 'Other',
        entries: Array.from({ length: ex.working_sets || 3 }, () => ({
          weight: '', reps: ex.reps || '', unit: unit || 'kg', is_pb: false
        }))
      })));
    } else {
      setLogSets([{ exercise_name: '', muscle_group: 'Chest', entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }]);
    }
    setShowLogModal(true);
  }

  function updateEntry(exIdx, setIdx, field, value) {
    setLogSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.map((e, j) => j === setIdx ? { ...e, [field]: value } : e) }
      : ex
    ));
  }

  function addSet(exIdx) {
    setLogSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: [...ex.entries, { weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }
      : ex
    ));
  }

  function removeSet(exIdx, setIdx) {
    setLogSets(s => s.map((ex, i) => i === exIdx
      ? { ...ex, entries: ex.entries.filter((_, j) => j !== setIdx) }
      : ex
    ));
  }

  function removeExercise(exIdx) {
    setLogSets(s => s.filter((_, i) => i !== exIdx));
  }

  function addExercise() {
    if (!newEx.name.trim()) { showAlert('Error', 'Exercise name required'); return; }
    setLogSets(s => [...s, {
      exercise_name: newEx.name.trim(),
      muscle_group: newEx.muscle_group,
      entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }]
    }]);
    setNewEx({ name: '', muscle_group: 'Chest' });
    setShowAddEx(false);
  }

  async function saveLog() {
    const rows = [];
    for (const ex of logSets) {
      if (!ex.exercise_name.trim()) continue;
      const { data: prData } = await supabase
        .from('workout_logs').select('weight_kg')
        .eq('client_id', client.id)
        .eq('exercise_name', ex.exercise_name)
        .order('weight_kg', { ascending: false }).limit(1);
      const currentPR = prData?.[0]?.weight_kg || 0;

      ex.entries.forEach((entry, setIdx) => {
        if (!entry.weight && !entry.reps) return;
        const weightKg = entry.weight ? toKg(parseFloat(entry.weight), entry.unit) : null;
        const isPR = weightKg && weightKg > currentPR;
        rows.push({
          client_id: client.id,
          logged_by: profile.id,
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group,
          month: new Date(logDate + 'T12:00:00').toLocaleString('default', { month: 'long' }).toUpperCase(),
          week: 1,
          day: logDay,
          set_type: 'working',
          set_number: setIdx + 1,
          weight_kg: weightKg,
          reps: entry.reps ? parseInt(entry.reps) : null,
          is_personal_best: isPR,
          logged_at: new Date(logDate + 'T12:00:00').toISOString(),
        });
      });
    }

    if (!rows.length) { showAlert('No data', 'Enter at least one set'); return; }
    setSavingLog(true);

    if (logNote.trim()) {
      await supabase.from('session_notes').upsert({
        client_id: client.id,
        date: logDate,
        note: logNote.trim(),
      }, { onConflict: 'client_id,date' });
    }

    const { error } = await supabase.from('workout_logs').insert(rows);
    setSavingLog(false);
    if (error) { showAlert('Error', error.message); return; }

    setShowLogModal(false);
    showAlert('✅ Logged!', `${rows.length} sets saved for ${client.name} on ${logDate}`);
    fetchData();
  }

  if (!client) return null;

  const stats = getComplianceStats();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{client.name?.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.clientSub}>Workout Compliance Report</Text>
          </View>
        </View>

        {/* Week navigation */}
        <View style={styles.weekNav}>
          <TouchableOpacity style={styles.weekBtn}
            onPress={() => setWeekOffset(w => w - 1)}>
            <Text style={styles.weekBtnText}>‹ Prev</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{getWeekLabel()}</Text>
          <TouchableOpacity
            style={[styles.weekBtn, weekOffset >= 0 && styles.weekBtnDisabled]}
            onPress={() => setWeekOffset(w => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}>
            <Text style={styles.weekBtnText}>Next ›</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.weekDates}>
          {new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
          {new Date(weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>

        {/* Compliance stats */}
        {program && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: COLORS.success }]}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>{stats.logged}</Text>
              <Text style={styles.statLabel}>Logged</Text>
            </View>
            <View style={[styles.statCard, { borderColor: COLORS.error }]}>
              <Text style={[styles.statValue, { color: COLORS.error }]}>{stats.missed}</Text>
              <Text style={styles.statLabel}>Missed</Text>
            </View>
            <View style={[styles.statCard, { borderColor: COLORS.roseGold }]}>
              <Text style={[styles.statValue, { color: COLORS.roseGold }]}>{stats.moved}</Text>
              <Text style={styles.statLabel}>Moved</Text>
            </View>
            <View style={[styles.statCard, { borderColor: COLORS.darkBorder }]}>
              <Text style={styles.statValue}>
                {stats.total > 0 ? Math.round((stats.logged / stats.total) * 100) : 0}%
              </Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
          </View>
        )}

        {!program && (
          <View style={styles.noProgram}>
            <Text style={styles.noProgramText}>📋 No active program assigned</Text>
          </View>
        )}

        {/* Day by day */}
        <Text style={styles.sectionTitle}>Day-by-Day Breakdown</Text>
        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const status = getDayStatus(day, date);
          const programExercises = (program?.workout_templates?.template_exercises || [])
            .filter(e => e.day === day);
          const seen = new Set();
          const uniqueExercises = programExercises.filter(ex => {
            if (seen.has(ex.exercise_name)) return false;
            seen.add(ex.exercise_name);
            return true;
          });
          const dayLogs = workoutLogs.filter(l => l.logged_at?.split('T')[0] === date);
          const note = sessionNotes.find(n => n.date === date);

          // Group logged sets by exercise
          const loggedExercises = {};
          dayLogs.forEach(log => {
            if (!loggedExercises[log.exercise_name]) loggedExercises[log.exercise_name] = [];
            loggedExercises[log.exercise_name].push(log);
          });

          return (
            <View key={day} style={[styles.dayCard, { borderLeftColor: status.color }]}>
              <View style={styles.dayHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.dayTitleRow}>
                    <Text style={styles.dayName}>{day}</Text>
                    <Text style={styles.dayDate}>
                      {new Date(date + 'T12:00:00').toLocaleDateString('en-US',
                        { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusEmoji}>{status.emoji}</Text>
                    <Text style={[styles.statusLabel, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                  {status.note && (
                    <Text style={styles.statusNote}>📝 {status.note}</Text>
                  )}
                </View>

                {/* Log button — show for past/today training days */}
                {(status.status === 'missed_auto' || status.status === 'today' ||
                  status.status === 'logged' || status.status === 'upcoming') &&
                  status.status !== 'rest' && (
                  <TouchableOpacity style={styles.logBtn}
                    onPress={() => openLogModal(day, date)}>
                    <Text style={styles.logBtnText}>
                      {status.status === 'logged' ? '+ Add More' : '+ Log'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Session note */}
              {note && (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>📝 Client Note:</Text>
                  <Text style={styles.noteText}>{note.note}</Text>
                </View>
              )}

              {/* Program exercises */}
              {uniqueExercises.length > 0 && dayLogs.length === 0 && (
                <View style={styles.exerciseList}>
                  {uniqueExercises.map((ex, j) => (
                    <Text key={j} style={styles.exerciseItem}>
                      • {ex.exercise_name} — {ex.working_sets}×{ex.reps}
                    </Text>
                  ))}
                </View>
              )}

              {/* Actual logged data */}
              {Object.entries(loggedExercises).map(([exName, sets]) => {
                const maxWeight = Math.max(...sets.map(s => s.weight_kg || 0));
                const hasPR = sets.some(s => s.is_personal_best);
                return (
                  <View key={exName} style={styles.loggedExercise}>
                    <View style={styles.loggedExHeader}>
                      <Text style={styles.loggedExName}>{exName}</Text>
                      {hasPR && <Text style={styles.prBadge}>🏆 PR</Text>}
                      {maxWeight > 0 && (
                        <Text style={styles.loggedMaxWeight}>
                          Best: {toDisplay(maxWeight, unit)}{ul}
                        </Text>
                      )}
                    </View>
                    <View style={styles.setsRow}>
                      {sets.map((s, si) => (
                        <View key={si} style={styles.setChip}>
                          <Text style={styles.setChipText}>
                            Set {s.set_number}: {s.weight_kg ? `${toDisplay(s.weight_kg, unit)}${ul}` : 'BW'}
                            {s.reps ? ` × ${s.reps}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

      </ScrollView>

      {/* Log Workout Modal */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                📝 Log for {client.name}
              </Text>
              <Text style={styles.modalSubtitle}>
                {logDay} — {logDate}
              </Text>

              {/* Session note */}
              <Text style={styles.modalLabel}>Session Note (optional)</Text>
              <RNTextInput value={logNote} onChangeText={setLogNote}
                style={styles.modalNoteInput}
                placeholder="How did the session go?"
                placeholderTextColor={COLORS.textMuted}
                multiline />

              {/* Exercises */}
              {logSets.map((ex, exIdx) => (
                <View key={exIdx} style={styles.logExCard}>
                  <View style={styles.logExHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logExName}>{ex.exercise_name || 'Exercise'}</Text>
                      <Text style={styles.logExMuscle}>{ex.muscle_group}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                      <Text style={{ color: COLORS.error, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Set header */}
                  <View style={styles.setHeader}>
                    <Text style={[styles.setHeaderText, { flex: 0.5 }]}>Set</Text>
                    <Text style={[styles.setHeaderText, { flex: 2 }]}>Weight</Text>
                    <Text style={[styles.setHeaderText, { flex: 0.8 }]}>Unit</Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
                    <Text style={[styles.setHeaderText, { flex: 0.5 }]}>✕</Text>
                  </View>

                  {ex.entries.map((entry, setIdx) => (
                    <View key={setIdx} style={styles.setRow}>
                      <Text style={[styles.setNum, { flex: 0.5 }]}>{setIdx + 1}</Text>
                      <RNTextInput
                        value={entry.weight}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                        style={[styles.setInput, { flex: 2 }]}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric" />
                      <TouchableOpacity
                        style={[styles.unitPicker, { flex: 0.8 }]}
                        onPress={() => updateEntry(exIdx, setIdx, 'unit',
                          entry.unit === 'kg' ? 'lbs' : 'kg')}>
                        <Text style={styles.unitPickerText}>{entry.unit}</Text>
                      </TouchableOpacity>
                      <RNTextInput
                        value={entry.reps}
                        onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                        style={[styles.setInput, { flex: 1 }]}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric" />
                      <TouchableOpacity
                        style={{ flex: 0.5, alignItems: 'center' }}
                        onPress={() => removeSet(exIdx, setIdx)}>
                        <Text style={{ color: COLORS.error }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addSetBtn}
                    onPress={() => addSet(exIdx)}>
                    <Text style={styles.addSetBtnText}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add exercise */}
              <TouchableOpacity style={styles.addExBtn}
                onPress={() => setShowAddEx(true)}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>

              {/* Save / Cancel */}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowLogModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, savingLog && { opacity: 0.6 }]}
                  onPress={saveLog} disabled={savingLog}>
                  <Text style={styles.modalSaveText}>
                    {savingLog ? 'Saving...' : '💾 Save Workout'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Exercise Modal */}
      <Modal visible={showAddEx} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>➕ Add Exercise</Text>
            <Text style={styles.modalLabel}>Exercise Name</Text>
            <RNTextInput value={newEx.name}
              onChangeText={v => setNewEx(e => ({ ...e, name: v }))}
              style={styles.modalInput}
              placeholder="e.g. Bench Press"
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
              <TouchableOpacity style={styles.modalSaveBtn} onPress={addExercise}>
                <Text style={styles.modalSaveText}>Add</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.roseGold, fontSize: 22, ...FONTS.bold },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  clientSub: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  weekBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  weekBtnDisabled: { opacity: 0.3 },
  weekBtnText: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.sm },
  weekLabel: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  weekDates: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue: { fontSize: SIZES.xxl, ...FONTS.bold, color: COLORS.white },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  noProgram: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  noProgramText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  dayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder, borderLeftWidth: 4 },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  dayTitleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dayName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dayDate: { color: COLORS.textMuted, fontSize: SIZES.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusEmoji: { fontSize: 14 },
  statusLabel: { fontSize: SIZES.sm, ...FONTS.medium },
  statusNote: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4, fontStyle: 'italic' },
  logBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8 },
  logBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xs },
  noteBox: { backgroundColor: '#60A5FA22', borderRadius: RADIUS.md, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#60A5FA44' },
  noteLabel: { color: '#60A5FA', fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 4 },
  noteText: { color: COLORS.white, fontSize: SIZES.sm, lineHeight: 18 },
  exerciseList: { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  exerciseItem: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 2 },
  loggedExercise: { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  loggedExHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  loggedExName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm, flex: 1 },
  prBadge: { fontSize: SIZES.xs },
  loggedMaxWeight: { color: COLORS.roseGold, ...FONTS.bold, fontSize: SIZES.xs },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  setChip: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.darkBorder },
  setChipText: { color: COLORS.textSecondary, fontSize: 10, ...FONTS.medium },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  modalNoteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 60, textAlignVertical: 'top', marginBottom: 12 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  logExCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  logExHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  logExName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  logExMuscle: { color: COLORS.roseGold, fontSize: SIZES.xs },
  setHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  setHeaderText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  setNum: { color: COLORS.textMuted, textAlign: 'center', fontSize: SIZES.sm },
  setInput: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm, padding: 8, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, textAlign: 'center', height: 38 },
  unitPicker: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid, alignItems: 'center', height: 38, justifyContent: 'center' },
  unitPickerText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  addSetBtn: { marginTop: 6, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.md },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  addExBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  addExBtnText: { color: COLORS.roseGold, ...FONTS.bold },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, marginRight: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipTextActive: { color: COLORS.white },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex: 2, paddingVertical: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems: 'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});