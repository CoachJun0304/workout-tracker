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
import { showAlert } from '../../utils/webAlert';

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
  const [expandedDays, setExpandedDays] = useState({});

  // Log modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [logDay, setLogDay] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logSets, setLogSets] = useState([]);
  const [logNote, setLogNote] = useState('');
  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Chest' });
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => { if (client?.id) fetchData(); }, [weekOffset]);

  function getWeekDates() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }

  const weekDates = getWeekDates();
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
    const total = trainingDays.length;
    const rate = total > 0 ? Math.round((logged / total) * 100) : 0;
    return { logged, missed, moved, total, rate };
  }

  // ── COMPLIANCE SCORING PER EXERCISE ─────────────────

  function getExerciseCompliance(prescribed, actualSets) {
    if (!actualSets || actualSets.length === 0) {
      return { score: 0, label: 'Not Done', color: COLORS.error, emoji: '❌' };
    }

    const prescribedSets = parseInt(prescribed.working_sets) || 3;
    const prescribedReps = parseInt(prescribed.reps) || 0;

    const completedSets = actualSets.length;
    const avgReps = actualSets.reduce((s, l) => s + (l.reps || 0), 0) / actualSets.length;
    const maxWeight = Math.max(...actualSets.map(l => l.weight_kg || 0));

    // Sets compliance
    const setsScore = Math.min(completedSets / prescribedSets, 1);
    // Reps compliance (if prescribed reps exist)
    const repsScore = prescribedReps > 0
      ? Math.min(avgReps / prescribedReps, 1)
      : 1;

    const overall = ((setsScore + repsScore) / 2) * 100;

    if (overall >= 90) return { score: Math.round(overall), label: 'Excellent', color: COLORS.success, emoji: '🏆' };
    if (overall >= 75) return { score: Math.round(overall), label: 'Good', color: '#4ECDC4', emoji: '✅' };
    if (overall >= 50) return { score: Math.round(overall), label: 'Partial', color: '#FFB347', emoji: '⚠️' };
    return { score: Math.round(overall), label: 'Incomplete', color: COLORS.error, emoji: '❌' };
  }

  function getTotalVolume(sets) {
    return sets.reduce((total, s) => {
      return total + ((s.weight_kg || 0) * (s.reps || 0));
    }, 0).toFixed(0);
  }

  // ── LOG MODAL HELPERS ───────────────────────────────

  function openLogModal(day, date) {
    setLogDay(day);
    setLogDate(date);
    setLogNote('');
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
    setLogSets(dayExs.length > 0
      ? dayExs.map(ex => ({
          exercise_name: ex.exercise_name,
          muscle_group: ex.muscle_group || 'Other',
          prescribed_sets: ex.working_sets || 3,
          prescribed_reps: ex.reps || '',
          entries: Array.from({ length: ex.working_sets || 3 }, () => ({
            weight: '', reps: ex.reps || '', unit: unit || 'kg', is_pb: false
          }))
        }))
      : [{ exercise_name: '', muscle_group: 'Chest', prescribed_sets: 3, prescribed_reps: '', entries: [{ weight: '', reps: '', unit: unit || 'kg', is_pb: false }] }]
    );
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
      prescribed_sets: 3,
      prescribed_reps: '',
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
          month: new Date(logDate + 'T12:00:00')
            .toLocaleString('default', { month: 'long' }).toUpperCase(),
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
    const prs = rows.filter(r => r.is_personal_best).length;
    showAlert('✅ Logged!',
      `${rows.length} sets saved for ${client.name} on ${logDate}${prs > 0 ? `\n🏆 ${prs} new PR!` : ''}`
    );
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
          {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US',
            { month: 'short', day: 'numeric' })} —{' '}
          {new Date(weekEnd + 'T12:00:00').toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>

        {/* Compliance stats */}
        {program && (
          <View>
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
              <View style={[styles.statCard, {
                borderColor: stats.rate >= 80 ? COLORS.success
                  : stats.rate >= 50 ? '#FFB347' : COLORS.error
              }]}>
                <Text style={[styles.statValue, {
                  color: stats.rate >= 80 ? COLORS.success
                    : stats.rate >= 50 ? '#FFB347' : COLORS.error
                }]}>{stats.rate}%</Text>
                <Text style={styles.statLabel}>Rate</Text>
              </View>
            </View>

            {/* Compliance bar */}
            <View style={styles.complianceBarBg}>
              <View style={[styles.complianceBarFill, {
                width: `${stats.rate}%`,
                backgroundColor: stats.rate >= 80 ? COLORS.success
                  : stats.rate >= 50 ? '#FFB347' : COLORS.error,
              }]} />
            </View>
            <Text style={styles.complianceBarLabel}>
              {stats.logged} of {stats.total} training days completed
            </Text>
          </View>
        )}

        {!program && (
          <View style={styles.noProgram}>
            <Text style={styles.noProgramText}>📋 No active program assigned</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('AssignProgram', { client })}>
              <Text style={styles.noProgramLink}>Assign a program →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Day by day */}
        <Text style={styles.sectionTitle}>Day-by-Day Breakdown</Text>

        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const status = getDayStatus(day, date);
          const allProgramExercises = program?.workout_templates?.template_exercises || [];
          const seen = new Set();
          const uniqueProgramExercises = allProgramExercises
            .filter(e => e.day === day)
            .sort((a, b) => a.order_index - b.order_index)
            .filter(ex => {
              if (seen.has(ex.exercise_name)) return false;
              seen.add(ex.exercise_name);
              return true;
            });

          const dayLogs = workoutLogs.filter(l => l.logged_at?.split('T')[0] === date);
          const note = sessionNotes.find(n => n.date === date);
          const isExpanded = expandedDays[date] !== false;

          // Group logged sets by exercise
          const loggedByExercise = {};
          dayLogs.forEach(log => {
            if (!loggedByExercise[log.exercise_name])
              loggedByExercise[log.exercise_name] = [];
            loggedByExercise[log.exercise_name].push(log);
          });

          // Overall day compliance score
          let dayScore = null;
          if (status.status === 'logged' && uniqueProgramExercises.length > 0) {
            const scores = uniqueProgramExercises.map(ex => {
              const actual = loggedByExercise[ex.exercise_name] || [];
              return getExerciseCompliance(ex, actual).score;
            });
            dayScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          }

          return (
            <View key={day} style={[styles.dayCard, { borderLeftColor: status.color }]}>

              {/* Day header — always visible */}
              <TouchableOpacity style={styles.dayHeader}
                onPress={() => setExpandedDays(e => ({ ...e, [date]: !isExpanded }))}>
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
                    {dayScore !== null && (
                      <View style={[styles.dayScoreBadge, {
                        backgroundColor: dayScore >= 90 ? COLORS.success + '22'
                          : dayScore >= 75 ? '#4ECDC422'
                          : dayScore >= 50 ? '#FFB34722' : '#FF4B4B22',
                        borderColor: dayScore >= 90 ? COLORS.success
                          : dayScore >= 75 ? '#4ECDC4'
                          : dayScore >= 50 ? '#FFB347' : COLORS.error,
                      }]}>
                        <Text style={[styles.dayScoreText, {
                          color: dayScore >= 90 ? COLORS.success
                            : dayScore >= 75 ? '#4ECDC4'
                            : dayScore >= 50 ? '#FFB347' : COLORS.error,
                        }]}>{dayScore}% compliance</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.dayHeaderRight}>
                  {/* Log button */}
                  {status.status !== 'rest' && (
                    <TouchableOpacity style={styles.logBtn}
                      onPress={(e) => {
                        e && e.stopPropagation && e.stopPropagation();
                        openLogModal(day, date);
                      }}>
                      <Text style={styles.logBtnText}>
                        {status.status === 'logged' ? '+ More' : '+ Log'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {/* Expanded content */}
              {isExpanded && (
                <View style={styles.dayExpanded}>

                  {/* Session note */}
                  {note && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteLabel}>📝 Client Note:</Text>
                      <Text style={styles.noteText}>{note.note}</Text>
                    </View>
                  )}

                  {/* ── PRESCRIBED vs ACTUAL per exercise ── */}
                  {uniqueProgramExercises.length > 0 && (
                    <View>
                      <Text style={styles.prescribedHeader}>📋 Program vs Actual</Text>
                      {uniqueProgramExercises.map((ex, ei) => {
                        const actualSets = loggedByExercise[ex.exercise_name] || [];
                        const compliance = getExerciseCompliance(ex, actualSets);
                        const volume = getTotalVolume(actualSets);
                        const hasPR = actualSets.some(s => s.is_personal_best);
                        const maxWeight = actualSets.length > 0
                          ? Math.max(...actualSets.map(s => s.weight_kg || 0))
                          : null;

                        return (
                          <View key={ei} style={styles.exerciseCompareCard}>
                            {/* Exercise name + compliance */}
                            <View style={styles.exCompareHeader}>
                              <View style={{ flex: 1 }}>
                                <View style={styles.exNameRow}>
                                  <Text style={styles.exCompareName}>{ex.exercise_name}</Text>
                                  {hasPR && <Text style={styles.prBadge}>🏆 PR</Text>}
                                </View>
                                <Text style={styles.exCompareMuscle}>{ex.muscle_group}</Text>
                              </View>
                              <View style={[styles.complianceBadge, {
                                backgroundColor: compliance.color + '22',
                                borderColor: compliance.color,
                              }]}>
                                <Text style={styles.complianceBadgeEmoji}>{compliance.emoji}</Text>
                                <Text style={[styles.complianceBadgeScore,
                                  { color: compliance.color }]}>
                                  {compliance.score}%
                                </Text>
                                <Text style={[styles.complianceBadgeLabel,
                                  { color: compliance.color }]}>
                                  {compliance.label}
                                </Text>
                              </View>
                            </View>

                            {/* Prescribed row */}
                            <View style={styles.prescribedRow}>
                              <View style={styles.prescribedTag}>
                                <Text style={styles.prescribedTagText}>PRESCRIBED</Text>
                              </View>
                              <Text style={styles.prescribedDetail}>
                                {ex.working_sets || 3} sets × {ex.reps || '?'} reps
                                {ex.warmup_sets > 0 ? ` + ${ex.warmup_sets} warm-up` : ''}
                              </Text>
                            </View>

                            {/* Actual sets */}
                            {actualSets.length > 0 ? (
                              <View>
                                <View style={styles.actualTag}>
                                  <Text style={styles.actualTagText}>ACTUAL</Text>
                                  {maxWeight > 0 && (
                                    <Text style={styles.actualBest}>
                                      Best: {toDisplay(maxWeight, unit)}{ul}
                                    </Text>
                                  )}
                                  {parseFloat(volume) > 0 && (
                                    <Text style={styles.actualVolume}>
                                      Vol: {toDisplay(parseFloat(volume), unit)}{ul}
                                    </Text>
                                  )}
                                </View>
                                <View style={styles.actualSetsGrid}>
                                  {actualSets.map((s, si) => (
                                    <View key={si} style={[styles.actualSetChip,
                                      s.is_personal_best && styles.actualSetChipPR]}>
                                      <Text style={styles.actualSetNum}>Set {s.set_number}</Text>
                                      <Text style={styles.actualSetWeight}>
                                        {s.weight_kg
                                          ? `${toDisplay(s.weight_kg, unit)}${ul}`
                                          : 'BW'}
                                      </Text>
                                      <Text style={styles.actualSetReps}>
                                        × {s.reps || '—'} reps
                                      </Text>
                                      {s.is_personal_best && (
                                        <Text style={styles.prFlag}>🏆</Text>
                                      )}
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ) : (
                              <View style={styles.notDoneRow}>
                                <Text style={styles.notDoneText}>Not logged</Text>
                                <TouchableOpacity style={styles.logExerciseBtn}
                                  onPress={() => openLogModal(day, date)}>
                                  <Text style={styles.logExerciseBtnText}>+ Log now</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Sets/reps comparison bar */}
                            {actualSets.length > 0 && (
                              <View style={styles.complianceBarRow}>
                                <View style={styles.complianceMiniBarBg}>
                                  <View style={[styles.complianceMiniBarFill, {
                                    width: `${Math.min(compliance.score, 100)}%`,
                                    backgroundColor: compliance.color,
                                  }]} />
                                </View>
                                <Text style={[styles.complianceMiniLabel,
                                  { color: compliance.color }]}>
                                  {compliance.score}%
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Extra logged exercises not in program */}
                  {(() => {
                    const programNames = new Set(uniqueProgramExercises.map(e => e.exercise_name));
                    const extraExercises = Object.entries(loggedByExercise)
                      .filter(([name]) => !programNames.has(name));
                    if (extraExercises.length === 0) return null;
                    return (
                      <View style={styles.extraExercisesCard}>
                        <Text style={styles.extraExercisesTitle}>
                          ➕ Extra Exercises (not in program)
                        </Text>
                        {extraExercises.map(([name, sets]) => {
                          const maxW = Math.max(...sets.map(s => s.weight_kg || 0));
                          return (
                            <View key={name} style={styles.extraExRow}>
                              <Text style={styles.extraExName}>{name}</Text>
                              <View style={styles.actualSetsGrid}>
                                {sets.map((s, si) => (
                                  <View key={si} style={styles.actualSetChip}>
                                    <Text style={styles.actualSetNum}>Set {s.set_number}</Text>
                                    <Text style={styles.actualSetWeight}>
                                      {s.weight_kg ? `${toDisplay(s.weight_kg, unit)}${ul}` : 'BW'}
                                    </Text>
                                    <Text style={styles.actualSetReps}>× {s.reps || '—'}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* Rest day or no program */}
                  {status.status === 'rest' && (
                    <View style={styles.restDayRow}>
                      <Text style={styles.restDayText}>😴 Rest & Recovery Day</Text>
                    </View>
                  )}

                </View>
              )}
            </View>
          );
        })}

      </ScrollView>

      {/* ── LOG WORKOUT MODAL ──────────────────────────── */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>📝 Log for {client.name}</Text>
              <Text style={styles.modalSubtitle}>{logDay} — {logDate}</Text>

              <Text style={styles.modalLabel}>Session Note (optional)</Text>
              <RNTextInput value={logNote} onChangeText={setLogNote}
                style={styles.modalNoteInput}
                placeholder="How did the session go?"
                placeholderTextColor={COLORS.textMuted}
                multiline />

              {logSets.map((ex, exIdx) => (
                <View key={exIdx} style={styles.logExCard}>
                  <View style={styles.logExHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logExName}>{ex.exercise_name || 'Exercise'}</Text>
                      <Text style={styles.logExPrescribed}>
                        Prescribed: {ex.prescribed_sets} sets × {ex.prescribed_reps || '?'} reps
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                      <Text style={{ color: COLORS.error, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {ex.entries.map((entry, setIdx) => (
                    <View key={setIdx} style={styles.setCard}>
                      <View style={styles.setCardHeader}>
                        <View style={styles.setNumBadge}>
                          <Text style={styles.setNumText}>Set {setIdx + 1}</Text>
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
                          <Text style={styles.inputLabel}>Weight</Text>
                          <RNTextInput value={entry.weight}
                            onChangeText={v => updateEntry(exIdx, setIdx, 'weight', v)}
                            style={styles.setInput} placeholder="0"
                            placeholderTextColor={COLORS.textMuted}
                            keyboardType="numeric" />
                        </View>
                        <TouchableOpacity style={styles.unitToggle}
                          onPress={() => updateEntry(exIdx, setIdx, 'unit',
                            entry.unit === 'kg' ? 'lbs' : 'kg')}>
                          <Text style={styles.unitToggleText}>{entry.unit}</Text>
                        </TouchableOpacity>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Reps</Text>
                          <RNTextInput value={entry.reps}
                            onChangeText={v => updateEntry(exIdx, setIdx, 'reps', v)}
                            style={styles.setInput} placeholder="0"
                            placeholderTextColor={COLORS.textMuted}
                            keyboardType="numeric" />
                        </View>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addSetBtn}
                    onPress={() => addSet(exIdx)}>
                    <Text style={styles.addSetBtnText}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addExBtn}
                onPress={() => setShowAddEx(true)}>
                <Text style={styles.addExBtnText}>➕ Add Exercise</Text>
              </TouchableOpacity>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowLogModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, savingLog && { opacity: 0.6 }]}
                  onPress={saveLog} disabled={savingLog}>
                  <Text style={styles.modalSaveText}>
                    {savingLog ? 'Saving...' : '💾 Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── ADD EXERCISE MODAL ─────────────────────────── */}
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
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1 },
  statValue: { fontSize: SIZES.xxl, ...FONTS.bold, color: COLORS.white },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  complianceBarBg: { height: 8, backgroundColor: COLORS.darkCard2, borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  complianceBarFill: { height: 8, borderRadius: 4 },
  complianceBarLabel: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 16, textAlign: 'center' },
  noProgram: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  noProgramText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  noProgramLink: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 8, ...FONTS.semibold },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  dayCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder, borderLeftWidth: 4, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  dayTitleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dayName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  dayDate: { color: COLORS.textMuted, fontSize: SIZES.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusEmoji: { fontSize: 14 },
  statusLabel: { fontSize: SIZES.sm, ...FONTS.medium },
  dayScoreBadge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  dayScoreText: { fontSize: 10, ...FONTS.bold },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  logBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5 },
  logBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xs },
  expandIcon: { color: COLORS.textMuted, fontSize: 12 },
  dayExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  noteBox: { backgroundColor: '#60A5FA22', borderRadius: RADIUS.md, padding: 10, marginTop: 10, marginBottom: 10, borderWidth: 1, borderColor: '#60A5FA44' },
  noteLabel: { color: '#60A5FA', fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 4 },
  noteText: { color: COLORS.white, fontSize: SIZES.sm, lineHeight: 18 },
  prescribedHeader: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginTop: 10, marginBottom: 8 },
  exerciseCompareCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  exCompareHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  exNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  exCompareName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, flex: 1 },
  exCompareMuscle: { color: COLORS.roseGold, fontSize: SIZES.xs },
  prBadge: { fontSize: SIZES.xs },
  complianceBadge: { borderRadius: RADIUS.md, padding: 8, alignItems: 'center', borderWidth: 1, minWidth: 72 },
  complianceBadgeEmoji: { fontSize: 16, marginBottom: 2 },
  complianceBadgeScore: { fontSize: SIZES.lg, ...FONTS.heavy },
  complianceBadgeLabel: { fontSize: 9, ...FONTS.semibold },
  prescribedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  prescribedTag: { backgroundColor: '#60A5FA22', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#60A5FA44' },
  prescribedTagText: { color: '#60A5FA', fontSize: 9, ...FONTS.bold },
  prescribedDetail: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  actualTag: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  actualTagText: { backgroundColor: COLORS.success + '22', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2, color: COLORS.success, fontSize: 9, ...FONTS.bold, borderWidth: 1, borderColor: COLORS.success + '44', overflow: 'hidden' },
  actualBest: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  actualVolume: { color: COLORS.textMuted, fontSize: SIZES.xs },
  actualSetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  actualSetChip: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: COLORS.darkBorder, minWidth: 80, alignItems: 'center' },
  actualSetChipPR: { borderColor: '#FFE66D', backgroundColor: '#FFE66D11' },
  actualSetNum: { color: COLORS.textMuted, fontSize: 9, marginBottom: 2 },
  actualSetWeight: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.bold },
  actualSetReps: { color: COLORS.textSecondary, fontSize: 10 },
  prFlag: { fontSize: 10, marginTop: 2 },
  notDoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  notDoneText: { color: COLORS.textMuted, fontSize: SIZES.sm, fontStyle: 'italic' },
  logExerciseBtn: { borderWidth: 1, borderColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  logExerciseBtnText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  complianceBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  complianceMiniBarBg: { flex: 1, height: 4, backgroundColor: COLORS.darkCard, borderRadius: 2, overflow: 'hidden' },
  complianceMiniBarFill: { height: 4, borderRadius: 2 },
  complianceMiniLabel: { fontSize: 10, ...FONTS.bold, minWidth: 30, textAlign: 'right' },
  extraExercisesCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginTop: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  extraExercisesTitle: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold, marginBottom: 8 },
  extraExRow: { marginBottom: 8 },
  extraExName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm, marginBottom: 4 },
  restDayRow: { alignItems: 'center', paddingVertical: 16 },
  restDayText: { color: COLORS.textMuted, fontSize: SIZES.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom: 4 },
  modalSubtitle: { color: COLORS.roseGold, ...FONTS.semibold, fontSize: SIZES.md, marginBottom: 16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  modalNoteInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.sm, borderWidth: 1, borderColor: COLORS.darkBorder, minHeight: 60, textAlignVertical: 'top', marginBottom: 12 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 8 },
  logExCard: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder },
  logExHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  logExName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  logExPrescribed: { color: COLORS.roseGold, fontSize: SIZES.xs, marginTop: 2 },
  setCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  setCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  setNumBadge: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.roseGoldMid },
  setNumText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  setCardActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, borderWidth: 1, borderColor: COLORS.darkBorder },
  prBtnActive: { backgroundColor: COLORS.roseGoldMid, borderColor: COLORS.roseGold },
  prBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold },
  removeSetBtn: { padding: 4 },
  setCardInputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  inputGroup: { flex: 1 },
  inputLabel: { color: COLORS.textMuted, fontSize: 9, ...FONTS.semibold, textTransform: 'uppercase', marginBottom: 4 },
  setInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.sm, padding: 8, color: COLORS.white, fontSize: SIZES.lg, borderWidth: 1, borderColor: COLORS.darkBorder, textAlign: 'center', ...FONTS.bold, height: 44 },
  unitToggle: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.roseGoldMid, alignItems: 'center', justifyContent: 'center', height: 44, minWidth: 48 },
  unitToggleText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.bold },
  addSetBtn: { marginTop: 6, alignItems: 'center', padding: 8, borderWidth: 1, borderColor: COLORS.darkBorder, borderRadius: RADIUS.sm },
  addSetBtnText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  addExBtn: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.roseGoldMid },
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