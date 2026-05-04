import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { toDisplay, unitLabel } from '../../utils/unitUtils';

const PHASES = [
  { key: 'Menstrual Phase', emoji: '🔴', color: '#FF6B6B', short: 'Menstrual' },
  { key: 'Follicular Phase', emoji: '🌱', color: '#4ECDC4', short: 'Follicular' },
  { key: 'Ovulation Phase', emoji: '⭐', color: '#FFE66D', short: 'Ovulation' },
  { key: 'Luteal Phase', emoji: '🟡', color: '#FF9F43', short: 'Luteal' },
];

export default function PhaseProgressScreen({ route }) {
  const { client } = route.params || {};
  const { profile, unit } = useAuth();
  const ul = unitLabel(unit);

  // If coach passed client, use that. Otherwise use own profile.
  const targetId = client?.id || profile?.id;
  const targetName = client?.name || profile?.name || 'Me';
  const targetUnit = client?.unit_preference || unit;

  const [loading, setLoading] = useState(true);
  const [phaseLogs, setPhaseLogs] = useState({});
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [expandedExercise, setExpandedExercise] = useState(null);

  useEffect(() => { fetchPhaseLogs(); }, []);

  async function fetchPhaseLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('client_id', targetId)
      .not('cycle_phase', 'is', null)
      .order('logged_at', { ascending: false });

    if (error) {
      console.log('phase logs error:', error.message);
      setLoading(false);
      return;
    }

    // Group by phase → exercise → sessions
    const grouped = {};
    (data || []).forEach(log => {
      const phase = normalizePhase(log.cycle_phase);
      if (!phase) return;
      if (!grouped[phase]) grouped[phase] = {};
      const ex = log.exercise_name;
      if (!grouped[phase][ex]) grouped[phase][ex] = [];
      grouped[phase][ex].push(log);
    });

    setPhaseLogs(grouped);
    setLoading(false);
  }

  // Normalize phase name to match PHASES keys
  function normalizePhase(phaseName) {
    if (!phaseName) return null;
    const n = phaseName.toLowerCase();
    if (n.includes('menstrual')) return 'Menstrual Phase';
    if (n.includes('follicular')) return 'Follicular Phase';
    if (n.includes('ovulat')) return 'Ovulation Phase';
    if (n.includes('luteal')) return 'Luteal Phase';
    return null;
  }

  // Get best set per session for trend analysis
  function getExerciseTrend(logs) {
    // Group by date → get best weight for that date
    const byDate = {};
    logs.forEach(log => {
      const date = log.logged_at?.split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(log);
    });

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayLogs]) => {
        const bestWeight = Math.max(...dayLogs.map(l => l.weight_kg || 0));
        const bestReps = Math.max(...dayLogs.map(l => l.reps || 0));
        const totalSets = dayLogs.length;
        const isPR = dayLogs.some(l => l.is_personal_best);
        return { date, bestWeight, bestReps, totalSets, isPR };
      });
  }

  function getExerciseSummary(logs) {
    const trend = getExerciseTrend(logs);
    if (trend.length === 0) return null;
    const allWeights = trend.map(t => t.bestWeight).filter(w => w > 0);
    const bestWeight = allWeights.length > 0 ? Math.max(...allWeights) : 0;
    const latestWeight = trend[trend.length - 1]?.bestWeight || 0;
    const firstWeight = trend[0]?.bestWeight || 0;
    const improvement = firstWeight > 0
      ? (((latestWeight - firstWeight) / firstWeight) * 100).toFixed(1)
      : null;
    const totalSessions = trend.length;
    const totalPRs = trend.filter(t => t.isPR).length;
    return { bestWeight, latestWeight, firstWeight, improvement, totalSessions, totalPRs, trend };
  }

  function getTrendArrow(improvement) {
    if (!improvement) return { icon: '—', color: COLORS.textMuted };
    const val = parseFloat(improvement);
    if (val > 5) return { icon: '↑↑', color: COLORS.success };
    if (val > 0) return { icon: '↑', color: '#4ECDC4' };
    if (val === 0) return { icon: '→', color: COLORS.textMuted };
    if (val > -5) return { icon: '↓', color: '#FFB347' };
    return { icon: '↓↓', color: COLORS.error };
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.roseGold} size="large" />
        <Text style={styles.loadingText}>Loading phase records...</Text>
      </View>
    );
  }

  const hasAnyData = PHASES.some(p => phaseLogs[p.key] && Object.keys(phaseLogs[p.key]).length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>🌸 Phase Records</Text>
        <Text style={styles.pageSub}>
          {targetName}'s performance tracked by menstrual cycle phase
        </Text>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        {PHASES.map(ph => (
          <View key={ph.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: ph.color }]} />
            <Text style={styles.legendText}>{ph.emoji} {ph.short}</Text>
          </View>
        ))}
      </View>

      {!hasAnyData ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🌸</Text>
          <Text style={styles.emptyTitle}>No Phase Data Yet</Text>
          <Text style={styles.emptySub}>
            Workout logs will be tagged with cycle phases automatically when logging with an active cycle.
            Log a few sessions to see phase-based trends here.
          </Text>
        </View>
      ) : (
        PHASES.map(phase => {
          const exerciseData = phaseLogs[phase.key] || {};
          const exerciseCount = Object.keys(exerciseData).length;
          const isExpanded = expandedPhase === phase.key;
          const totalLogs = Object.values(exerciseData).reduce((s, l) => s + l.length, 0);

          return (
            <View key={phase.key} style={[styles.phaseCard, { borderColor: phase.color }]}>
              {/* Phase header */}
              <TouchableOpacity
                style={styles.phaseHeader}
                onPress={() => {
                  setExpandedPhase(isExpanded ? null : phase.key);
                  setExpandedExercise(null);
                }}>
                <View style={[styles.phaseEmojiBox, { backgroundColor: phase.color + '22' }]}>
                  <Text style={styles.phaseEmoji}>{phase.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phaseName, { color: phase.color }]}>{phase.key}</Text>
                  <Text style={styles.phaseMeta}>
                    {exerciseCount > 0
                      ? `${exerciseCount} exercises · ${totalLogs} sets logged`
                      : 'No data yet'}
                  </Text>
                </View>
                <Text style={[styles.expandChevron, { color: phase.color }]}>
                  {isExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {/* Phase summary pills */}
              {exerciseCount > 0 && !isExpanded && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={styles.exercisePillScroll}>
                  {Object.keys(exerciseData).slice(0, 6).map(ex => (
                    <View key={ex} style={[styles.exercisePill, { borderColor: phase.color }]}>
                      <Text style={[styles.exercisePillText, { color: phase.color }]}>
                        {ex.length > 15 ? ex.slice(0, 15) + '…' : ex}
                      </Text>
                    </View>
                  ))}
                  {Object.keys(exerciseData).length > 6 && (
                    <View style={styles.exercisePillMore}>
                      <Text style={styles.exercisePillMoreText}>
                        +{Object.keys(exerciseData).length - 6}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <View style={styles.phaseExpanded}>
                  {exerciseCount === 0 ? (
                    <View style={styles.phaseEmpty}>
                      <Text style={styles.phaseEmptyText}>
                        No workouts logged during {phase.short} phase yet
                      </Text>
                    </View>
                  ) : (
                    Object.entries(exerciseData).map(([exerciseName, logs]) => {
                      const summary = getExerciseSummary(logs);
                      const isExExpanded = expandedExercise === `${phase.key}-${exerciseName}`;
                      const trend = getTrendArrow(summary?.improvement);

                      return (
                        <View key={exerciseName} style={styles.exerciseBlock}>
                          {/* Exercise row */}
                          <TouchableOpacity
                            style={styles.exerciseRow}
                            onPress={() => setExpandedExercise(
                              isExExpanded ? null : `${phase.key}-${exerciseName}`
                            )}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.exerciseName}>{exerciseName}</Text>
                              <Text style={styles.exerciseMeta}>
                                {summary?.totalSessions || 0} sessions
                                {summary?.totalPRs > 0 ? ` · 🏆 ${summary.totalPRs} PRs` : ''}
                              </Text>
                            </View>

                            {/* Best weight */}
                            <View style={styles.exerciseBest}>
                              <Text style={[styles.exerciseBestWeight, { color: phase.color }]}>
                                {summary?.bestWeight > 0
                                  ? `${toDisplay(summary.bestWeight, targetUnit)}${ul}`
                                  : 'BW'}
                              </Text>
                              <Text style={styles.exerciseBestLabel}>best</Text>
                            </View>

                            {/* Trend */}
                            <View style={styles.exerciseTrend}>
                              <Text style={[styles.exerciseTrendIcon, { color: trend.color }]}>
                                {trend.icon}
                              </Text>
                              {summary?.improvement && (
                                <Text style={[styles.exerciseTrendPct, { color: trend.color }]}>
                                  {parseFloat(summary.improvement) > 0 ? '+' : ''}{summary.improvement}%
                                </Text>
                              )}
                            </View>

                            <Text style={styles.exExpandChevron}>
                              {isExExpanded ? '▲' : '▼'}
                            </Text>
                          </TouchableOpacity>

                          {/* Exercise trend table */}
                          {isExExpanded && summary && (
                            <View style={styles.trendTable}>
                              <View style={styles.trendTableHeader}>
                                <Text style={[styles.trendTableCol, { flex: 2 }]}>Date</Text>
                                <Text style={styles.trendTableCol}>Weight</Text>
                                <Text style={styles.trendTableCol}>Reps</Text>
                                <Text style={styles.trendTableCol}>Sets</Text>
                                <Text style={styles.trendTableCol}>PR</Text>
                              </View>
                              {summary.trend.map((row, i) => (
                                <View key={i} style={[styles.trendTableRow,
                                  i % 2 === 0 && { backgroundColor: phase.color + '08' }]}>
                                  <Text style={[styles.trendTableCell, { flex: 2 }]}>
                                    {row.date}
                                  </Text>
                                  <Text style={[styles.trendTableCell, {
                                    color: row.bestWeight > 0 ? phase.color : COLORS.textMuted
                                  }]}>
                                    {row.bestWeight > 0
                                      ? `${toDisplay(row.bestWeight, targetUnit)}${ul}`
                                      : 'BW'}
                                  </Text>
                                  <Text style={styles.trendTableCell}>{row.bestReps || '—'}</Text>
                                  <Text style={styles.trendTableCell}>{row.totalSets}</Text>
                                  <Text style={styles.trendTableCell}>
                                    {row.isPR ? '🏆' : '—'}
                                  </Text>
                                </View>
                              ))}

                              {/* Mini progress bar */}
                              {summary.trend.length > 1 && summary.bestWeight > 0 && (
                                <View style={styles.miniTrendChart}>
                                  <Text style={styles.miniTrendLabel}>Weight trend</Text>
                                  <View style={styles.miniTrendBars}>
                                    {summary.trend.slice(-8).map((row, i, arr) => {
                                      const maxW = Math.max(...arr.map(r => r.bestWeight));
                                      const h = maxW > 0
                                        ? Math.max(4, (row.bestWeight / maxW) * 40)
                                        : 4;
                                      return (
                                        <View key={i} style={styles.miniTrendBarCol}>
                                          <View style={[styles.miniTrendBar, {
                                            height: h,
                                            backgroundColor: row.isPR
                                              ? COLORS.roseGold
                                              : phase.color,
                                          }]} />
                                          <Text style={styles.miniTrendBarLabel}>
                                            {row.date.slice(5)}
                                          </Text>
                                        </View>
                                      );
                                    })}
                                  </View>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Phase comparison summary */}
      {hasAnyData && (
        <View style={styles.comparisonCard}>
          <Text style={styles.comparisonTitle}>📊 Phase Comparison</Text>
          <Text style={styles.comparisonSub}>
            Average best weight across all exercises per phase
          </Text>
          {PHASES.map(phase => {
            const exerciseData = phaseLogs[phase.key] || {};
            const allBests = Object.values(exerciseData).map(logs => {
              const weights = logs.map(l => l.weight_kg || 0).filter(w => w > 0);
              return weights.length > 0 ? Math.max(...weights) : 0;
            }).filter(w => w > 0);
            const avgBest = allBests.length > 0
              ? allBests.reduce((s, w) => s + w, 0) / allBests.length
              : 0;
            const maxAvg = Math.max(...PHASES.map(p => {
              const ed = phaseLogs[p.key] || {};
              const bs = Object.values(ed).map(logs => {
                const ws = logs.map(l => l.weight_kg || 0).filter(w => w > 0);
                return ws.length > 0 ? Math.max(...ws) : 0;
              }).filter(w => w > 0);
              return bs.length > 0 ? bs.reduce((s, w) => s + w, 0) / bs.length : 0;
            }));
            const barWidth = maxAvg > 0 ? (avgBest / maxAvg) * 100 : 0;

            return (
              <View key={phase.key} style={styles.comparisonRow}>
                <Text style={styles.comparisonPhaseEmoji}>{phase.emoji}</Text>
                <Text style={[styles.comparisonPhaseLabel, { color: phase.color }]}>
                  {phase.short}
                </Text>
                <View style={styles.comparisonBarBg}>
                  <View style={[styles.comparisonBarFill, {
                    width: `${barWidth}%`,
                    backgroundColor: phase.color,
                  }]} />
                </View>
                <Text style={[styles.comparisonValue, { color: phase.color }]}>
                  {avgBest > 0
                    ? `${toDisplay(avgBest, targetUnit)}${ul}`
                    : '—'}
                </Text>
              </View>
            );
          })}
          <Text style={styles.comparisonNote}>
            💡 Lower weights in Menstrual/Luteal phases are normal and expected.
            Track trends within each phase to measure true progress.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, backgroundColor: COLORS.darkBg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: SIZES.sm },
  header: { marginBottom: 16 },
  pageTitle: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy },
  pageSub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  emptyCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 16 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg, marginBottom: 8 },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, textAlign: 'center', lineHeight: 20 },
  phaseCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  phaseEmojiBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  phaseEmoji: { fontSize: 22 },
  phaseName: { fontSize: SIZES.md, ...FONTS.bold },
  phaseMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  expandChevron: { fontSize: 14, ...FONTS.bold },
  exercisePillScroll: { paddingHorizontal: 16, paddingBottom: 12 },
  exercisePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, marginRight: 6 },
  exercisePillText: { fontSize: SIZES.xs, ...FONTS.semibold },
  exercisePillMore: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2 },
  exercisePillMoreText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  phaseExpanded: { borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  phaseEmpty: { padding: 24, alignItems: 'center' },
  phaseEmptyText: { color: COLORS.textMuted, fontSize: SIZES.sm, textAlign: 'center' },
  exerciseBlock: { borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  exerciseName: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.semibold },
  exerciseMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  exerciseBest: { alignItems: 'center', minWidth: 60 },
  exerciseBestWeight: { fontSize: SIZES.md, ...FONTS.bold },
  exerciseBestLabel: { color: COLORS.textMuted, fontSize: 9 },
  exerciseTrend: { alignItems: 'center', minWidth: 44 },
  exerciseTrendIcon: { fontSize: SIZES.lg, ...FONTS.bold },
  exerciseTrendPct: { fontSize: 9, ...FONTS.bold },
  exExpandChevron: { color: COLORS.textMuted, fontSize: 11 },
  trendTable: { backgroundColor: COLORS.darkCard2, margin: 12, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.darkBorder },
  trendTableHeader: { flexDirection: 'row', backgroundColor: COLORS.darkCard, padding: 8 },
  trendTableCol: { flex: 1, color: COLORS.textSecondary, fontSize: 10, ...FONTS.bold, textTransform: 'uppercase' },
  trendTableRow: { flexDirection: 'row', padding: 8 },
  trendTableCell: { flex: 1, color: COLORS.white, fontSize: SIZES.xs },
  miniTrendChart: { padding: 12, borderTopWidth: 0.5, borderTopColor: COLORS.darkBorder },
  miniTrendLabel: { color: COLORS.textMuted, fontSize: 10, marginBottom: 6 },
  miniTrendBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 50 },
  miniTrendBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  miniTrendBar: { width: '100%', borderRadius: 2, minHeight: 4 },
  miniTrendBarLabel: { color: COLORS.textMuted, fontSize: 7, marginTop: 2 },
  comparisonCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginTop: 8, borderWidth: 1, borderColor: COLORS.darkBorder },
  comparisonTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginBottom: 4 },
  comparisonSub: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 16 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  comparisonPhaseEmoji: { fontSize: 14, width: 20 },
  comparisonPhaseLabel: { fontSize: SIZES.xs, ...FONTS.bold, width: 70 },
  comparisonBarBg: { flex: 1, height: 8, backgroundColor: COLORS.darkCard2, borderRadius: 4, overflow: 'hidden' },
  comparisonBarFill: { height: 8, borderRadius: 4 },
  comparisonValue: { fontSize: SIZES.xs, ...FONTS.bold, width: 60, textAlign: 'right' },
  comparisonNote: { color: COLORS.textMuted, fontSize: SIZES.xs, lineHeight: 16, marginTop: 12, fontStyle: 'italic' },
});