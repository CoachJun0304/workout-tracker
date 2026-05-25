import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Platform, Dimensions
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { getCurrentPhase } from '../../data/cycleData';
import { showAlert } from '../../utils/webAlert';

const W = Dimensions.get('window').width;

export default function DashboardScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({
    clients: 0, logsToday: 0, logsWeek: 0, inactive: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [inactiveClients, setInactiveClients] = useState([]);
  const [cycleAlerts, setCycleAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [weightLogs, setWeightLogs] = useState([]);
  const [macroLogs, setMacroLogs] = useState([]);
  const [macroTargets, setMacroTargets] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setRefreshing(true);
    const [
      { count: clients },
      { count: logsToday },
      { count: logsWeek },
      { data: recent },
      { data: allClients },
      { data: myWeightLogs },
      { data: myMacroLogs },
      { data: myMacroTargets },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .eq('role', 'client').eq('status', 'active'),
      supabase.from('workout_logs').select('*', { count: 'exact', head: true })
        .gte('logged_at', todayStr),
      supabase.from('workout_logs').select('*', { count: 'exact', head: true })
        .gte('logged_at', weekAgo),
      supabase.from('workout_logs')
        .select('*, profiles!client_id(name, gender)')
        .order('logged_at', { ascending: false }).limit(6),
      supabase.from('profiles')
        .select('id, name, goal, gender, status, weight_kg, age, height_cm')
        .eq('role', 'client').eq('status', 'active'),
      supabase.from('weight_logs').select('*')
        .eq('client_id', profile.id)
        .order('logged_at', { ascending: true }).limit(30),
      supabase.from('macro_logs').select('*')
        .eq('client_id', profile.id)
        .order('date', { ascending: false }).limit(7),
      supabase.from('macro_targets').select('*')
        .eq('client_id', profile.id).single(),
    ]);

    // Inactive clients
    const inactive = [];
    for (const client of (allClients || [])) {
      const { count } = await supabase.from('workout_logs')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .gte('logged_at', twoWeeksAgo);
      if (!count) inactive.push(client);
    }

    // Cycle alerts
    const femaleClients = (allClients || []).filter(c => c.gender === 'Female');
    const alerts = [];
    for (const client of femaleClients) {
      const { data: cycles } = await supabase
        .from('menstrual_cycles').select('*')
        .eq('client_id', client.id)
        .order('cycle_start_date', { ascending: false }).limit(1);
      if (cycles && cycles.length > 0) {
        const phase = getCurrentPhase(cycles[0].cycle_start_date, cycles[0].cycle_length);
        if (phase) alerts.push({ client, phase, cycle: cycles[0] });
      }
    }

    setStats({
      clients: clients || 0,
      logsToday: logsToday || 0,
      logsWeek: logsWeek || 0,
      inactive: inactive.length,
    });
    setRecentLogs(recent || []);
    setInactiveClients(inactive);
    setCycleAlerts(alerts);
    setWeightLogs(myWeightLogs || []);
    setMacroLogs(myMacroLogs || []);
    setMacroTargets(myMacroTargets || null);
    setRefreshing(false);
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) signOut();
    } else {
      showAlert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]);
    }
  }

  function getPhaseIntensityLabel(phase) {
    const name = phase.name?.toLowerCase() || '';
    if (name.includes('menstrual')) return { label: 'Low Intensity', color: '#FF6B6B', emoji: '🔴' };
    if (name.includes('follicular')) return { label: 'Moderate-High', color: '#4ECDC4', emoji: '🟢' };
    if (name.includes('ovulat')) return { label: 'Peak Performance', color: '#FFE66D', emoji: '⭐' };
    if (name.includes('luteal')) return { label: 'Moderate → Low', color: '#FF9F43', emoji: '🟡' };
    return { label: 'Check Phase', color: COLORS.textMuted, emoji: '📋' };
  }

  function goToClient(client) {
    navigation.navigate('Clients', {
      screen: 'ClientDetail',
      params: { client },
      initial: false,
    });
  }

  // ── SVG CHARTS ────────────────────────────────────────

  function WeightLineChart() {
    const data = weightLogs.slice(-14);
    if (data.length < 2) return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>Log at least 2 weigh-ins to see chart</Text>
      </View>
    );
    const chartW = Math.min(W - 64, 500);
    const chartH = 120;
    const padL = 36, padR = 12, padT = 12, padB = 24;
    const values = data.map(d => d.weight_kg);
    const minV = Math.min(...values) - 1;
    const maxV = Math.max(...values) + 1;
    const scaleX = (i) => padL + (i / (data.length - 1)) * (chartW - padL - padR);
    const scaleY = (v) => padT + ((maxV - v) / (maxV - minV)) * (chartH - padT - padB);
    const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.weight_kg)}`).join(' ');
    const areaPoints = `${padL},${chartH - padB} ` +
      data.map((d, i) => `${scaleX(i)},${scaleY(d.weight_kg)}`).join(' ') +
      ` ${scaleX(data.length - 1)},${chartH - padB}`;
    return (
      <View style={{ alignItems: 'center' }}>
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
          {[0, 0.5, 1].map((t, i) => {
            const y = padT + t * (chartH - padT - padB);
            const val = (maxV - t * (maxV - minV)).toFixed(1);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y}
                  stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
                <text x={padL - 4} y={y + 4} fontSize="8" fill="#888" textAnchor="end">{val}</text>
              </g>
            );
          })}
          <polygon points={areaPoints} fill={COLORS.roseGold} fillOpacity="0.1" />
          <polyline points={points} fill="none" stroke={COLORS.roseGold} strokeWidth="2" strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={i} cx={scaleX(i)} cy={scaleY(d.weight_kg)} r="3"
              fill={COLORS.roseGold} stroke={COLORS.darkCard} strokeWidth="1.5" />
          ))}
          {data.filter((_, i) => i % Math.ceil(data.length / 4) === 0).map((d, i) => {
            const origIdx = data.indexOf(d);
            return (
              <text key={i} x={scaleX(origIdx)} y={chartH - 4}
                fontSize="7" fill="#888" textAnchor="middle">
                {d.logged_at.split('T')[0].slice(5)}
              </text>
            );
          })}
        </svg>
      </View>
    );
  }

  function MacroBarChart() {
    const last7 = [...macroLogs].reverse();
    if (last7.length === 0) return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No macro data yet</Text>
      </View>
    );
    const chartW = Math.min(W - 64, 500);
    const chartH = 100;
    const padL = 32, padR = 8, padT = 8, padB = 24;
    const maxCal = Math.max(...last7.map(l => l.calories || 0), macroTargets?.calories || 1);
    const scaleY = (v) => padT + ((maxCal - v) / maxCal) * (chartH - padT - padB);
    const barColors = { protein_g: '#FF6B6B', carbs_g: '#4ECDC4', fats_g: '#FFE66D' };
    return (
      <View style={{ alignItems: 'center' }}>
        <svg width={chartW} height={chartH}>
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
                  const calVal = key === 'fats_g' ? val * 9 : val * 4;
                  const h = (calVal / maxCal) * (chartH - padT - padB);
                  stackY -= h;
                  return (
                    <rect key={ki} x={x + 2} y={stackY}
                      width={((chartW - padL - padR) / last7.length) * 0.7}
                      height={h} fill={barColors[key]} rx="2" />
                  );
                })}
                <text x={x + ((chartW - padL - padR) / last7.length) * 0.35} y={chartH - 4}
                  fontSize="7" fill="#888" textAnchor="middle">
                  {log.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
        <View style={styles.chartLegend}>
          {[['#FF6B6B','P'],['#4ECDC4','C'],['#FFE66D','F'],[COLORS.roseGold,'Target']].map(([c,l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const latestWeight = weightLogs.length > 0
    ? weightLogs[weightLogs.length - 1].weight_kg : null;
  const weightChange = weightLogs.length >= 2
    ? (weightLogs[weightLogs.length - 1].weight_kg - weightLogs[0].weight_kg).toFixed(1)
    : null;
  const todayMacros = macroLogs.find(l => l.date === todayStr);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData}
        tintColor={COLORS.roseGold} />}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {new Date().getHours() < 12 ? 'Good morning'
              : new Date().getHours() < 17 ? 'Good afternoon'
              : 'Good evening'} 👋
          </Text>
          <Text style={styles.coachName}>{profile?.name || 'Coach'}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardRose]}>
          <Text style={styles.statValueLarge}>{stats.clients}</Text>
          <Text style={styles.statLabelWhite}>Active Clients</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.logsToday}</Text>
          <Text style={styles.statLabel}>Sets Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.logsWeek}</Text>
          <Text style={styles.statLabel}>Sets This Week</Text>
        </View>
        <View style={[styles.statCard, stats.inactive > 0 && { borderColor: COLORS.error }]}>
          <Text style={[styles.statValue, stats.inactive > 0 && { color: COLORS.error }]}>
            {stats.inactive}
          </Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* ── COACH PERSONAL HEALTH ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 My Health Overview</Text>

        {/* Weight summary */}
        <View style={styles.healthRow}>
          <View style={styles.healthCard}>
            <Text style={styles.healthCardValue}>
              {latestWeight ? `${latestWeight}kg` : '—'}
            </Text>
            <Text style={styles.healthCardLabel}>Current Weight</Text>
          </View>
          {weightChange !== null && (
            <View style={styles.healthCard}>
              <Text style={[styles.healthCardValue, {
                color: weightChange > 0 ? COLORS.error
                  : weightChange < 0 ? COLORS.success : COLORS.textMuted
              }]}>
                {weightChange > 0 ? '+' : ''}{weightChange}kg
              </Text>
              <Text style={styles.healthCardLabel}>Total Change</Text>
            </View>
          )}
          <View style={styles.healthCard}>
            <Text style={styles.healthCardValue}>{weightLogs.length}</Text>
            <Text style={styles.healthCardLabel}>Weigh-ins</Text>
          </View>
        </View>

        {/* Weight chart */}
        {weightLogs.length >= 2 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>⚖️ Weight Trend</Text>
            <WeightLineChart />
          </View>
        )}

        {/* Today's macros */}
        {todayMacros && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>🥗 Today's Macros</Text>
            <View style={styles.macroTodayRow}>
              {[
                { label: 'Protein', val: todayMacros.protein_g, color: '#FF6B6B', target: macroTargets?.protein_g },
                { label: 'Carbs', val: todayMacros.carbs_g, color: '#4ECDC4', target: macroTargets?.carbs_g },
                { label: 'Fats', val: todayMacros.fats_g, color: '#FFE66D', target: macroTargets?.fats_g },
                { label: 'kcal', val: todayMacros.calories, color: COLORS.roseGold, target: macroTargets?.calories },
              ].map(m => (
                <View key={m.label} style={[styles.macroPill,
                  { backgroundColor: m.color + '22', borderColor: m.color }]}>
                  <Text style={[styles.macroPillVal, { color: m.color }]}>{m.val}</Text>
                  {m.target && <Text style={styles.macroPillTarget}>/{m.target}</Text>}
                  <Text style={styles.macroPillLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 7-day macro chart */}
        {macroLogs.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>📊 7-Day Macro Breakdown</Text>
            <MacroBarChart />
          </View>
        )}

        {weightLogs.length === 0 && macroLogs.length === 0 && (
          <View style={styles.healthEmpty}>
            <Text style={styles.healthEmptyText}>
              No personal health data yet
            </Text>
            <Text style={styles.healthEmptySub}>
              Log your weight and food in the client Health tab using your own profile
            </Text>
          </View>
        )}
      </View>

      {/* Cycle alerts */}
      {cycleAlerts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌸 Female Client Cycle Alerts</Text>
          <Text style={styles.sectionSubtitle}>
            Adjust training intensity based on current phase
          </Text>
          {cycleAlerts.map(({ client, phase }) => {
            const intensity = getPhaseIntensityLabel(phase);
            return (
              <TouchableOpacity key={client.id}
                style={[styles.cycleAlertCard, { borderLeftColor: phase.color }]}
                onPress={() => goToClient(client)}>
                <View style={styles.cycleAlertHeader}>
                  <View style={styles.cycleAvatar}>
                    <Text style={styles.cycleAvatarText}>{client.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cycleClientName}>{client.name}</Text>
                    <View style={styles.cyclePhaseRow}>
                      <Text style={{ fontSize: 14 }}>{phase.emoji}</Text>
                      <Text style={[styles.cyclePhaseName, { color: phase.color }]}>
                        {phase.name}
                      </Text>
                      <Text style={styles.cycleDayIn}>Day {phase.dayInPhase}</Text>
                    </View>
                  </View>
                  <View style={[styles.intensityBadge, {
                    backgroundColor: intensity.color + '22',
                    borderColor: intensity.color
                  }]}>
                    <Text style={{ fontSize: 10 }}>{intensity.emoji}</Text>
                    <Text style={[styles.intensityLabel, { color: intensity.color }]}>
                      {intensity.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cyclePhaseDesc}>{phase.description}</Text>
                <View style={styles.cycleRecsRow}>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>💪</Text>
                    <Text style={styles.cycleRecText}>
                      {phase.workoutRecommendations?.[0]}
                    </Text>
                  </View>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>🥗</Text>
                    <Text style={styles.cycleRecText}>
                      {phase.nutritionTips?.[0]}
                    </Text>
                  </View>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>⚖️</Text>
                    <Text style={styles.cycleRecText}>{phase.weightNote}</Text>
                  </View>
                </View>
                <Text style={styles.cycleAlertTap}>Tap to view client profile →</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Inactive clients */}
      {inactiveClients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠️ No Activity (2+ Weeks)</Text>
          {inactiveClients.map(client => (
            <TouchableOpacity key={client.id} style={styles.inactiveCard}
              onPress={() => goToClient(client)}>
              <View style={styles.inactiveAvatar}>
                <Text style={styles.inactiveAvatarText}>{client.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inactiveName}>{client.name}</Text>
                <Text style={styles.inactiveGoal}>{client.goal || 'No goal set'}</Text>
              </View>
              <Text style={styles.inactiveArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Recent Activity</Text>
        {recentLogs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No activity yet today</Text>
          </View>
        ) : recentLogs.map((log, i) => (
          <View key={i} style={styles.recentLogRow}>
            <View style={styles.recentLogAvatar}>
              <Text style={styles.recentLogAvatarText}>
                {log.profiles?.name?.charAt(0) || '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentLogName}>{log.profiles?.name || 'Unknown'}</Text>
              <Text style={styles.recentLogDetail}>
                {log.exercise_name} · {log.weight_kg ? `${log.weight_kg}kg` : 'BW'}
                {log.reps ? ` × ${log.reps}` : ''}
                {log.is_personal_best ? ' 🏆' : ''}
              </Text>
            </View>
            <Text style={styles.recentLogTime}>
              {new Date(log.logged_at).toLocaleTimeString('en-US',
                { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))}
      </View>

      {/* Quick actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity style={styles.quickAction}
            onPress={() => navigation.navigate('Clients',
              { screen: 'AddClient', initial: false })}>
            <Text style={styles.quickActionIcon}>➕</Text>
            <Text style={styles.quickActionLabel}>Add Client</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}
            onPress={() => navigation.navigate('Templates')}>
            <Text style={styles.quickActionIcon}>📋</Text>
            <Text style={styles.quickActionLabel}>Programs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}
            onPress={() => navigation.navigate('Clients')}>
            <Text style={styles.quickActionIcon}>👥</Text>
            <Text style={styles.quickActionLabel}>All Clients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={fetchData}>
            <Text style={styles.quickActionIcon}>🔄</Text>
            <Text style={styles.quickActionLabel}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  coachName: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.heavy },
  signOutBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FF4B4B44' },
  signOutText: { color: COLORS.error, fontSize: SIZES.sm, ...FONTS.medium },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  statCardRose: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  statValue: { fontSize: SIZES.xxl, ...FONTS.heavy, color: COLORS.white },
  statValueLarge: { fontSize: 36, ...FONTS.heavy, color: COLORS.white },
  statLabel: { fontSize: SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  statLabelWhite: { fontSize: SIZES.xs, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.bold, marginBottom: 6 },
  sectionSubtitle: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 12 },
  healthRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  healthCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  healthCardValue: { fontSize: SIZES.lg, ...FONTS.bold, color: COLORS.white },
  healthCardLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  healthEmpty: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  healthEmptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  healthEmptySub: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign: 'center', marginTop: 4, lineHeight: 16 },
  chartCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder, overflow: 'hidden' },
  chartTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 10 },
  chartEmpty: { alignItems: 'center', padding: 16 },
  chartEmptyText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  chartLegend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { color: COLORS.textMuted, fontSize: SIZES.xs },
  macroTodayRow: { flexDirection: 'row', gap: 6 },
  macroPill: { flex: 1, borderRadius: RADIUS.md, padding: 8, alignItems: 'center', borderWidth: 1 },
  macroPillVal: { fontSize: SIZES.md, ...FONTS.bold },
  macroPillTarget: { fontSize: 9, color: COLORS.textMuted },
  macroPillLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 1 },
  cycleAlertCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder, borderLeftWidth: 4 },
  cycleAlertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cycleAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  cycleAvatarText: { color: COLORS.roseGold, fontSize: 18, ...FONTS.bold },
  cycleClientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  cyclePhaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cyclePhaseName: { fontSize: SIZES.sm, ...FONTS.semibold },
  cycleDayIn: { color: COLORS.textMuted, fontSize: SIZES.xs },
  intensityBadge: { borderRadius: RADIUS.md, padding: 6, alignItems: 'center', borderWidth: 1, minWidth: 70 },
  intensityLabel: { fontSize: 9, ...FONTS.bold, marginTop: 2, textAlign: 'center' },
  cyclePhaseDesc: { color: COLORS.textSecondary, fontSize: SIZES.xs, lineHeight: 16, marginBottom: 10, fontStyle: 'italic' },
  cycleRecsRow: { gap: 6, marginBottom: 8 },
  cycleRec: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cycleRecIcon: { fontSize: 12, marginTop: 1 },
  cycleRecText: { color: COLORS.textSecondary, fontSize: SIZES.xs, flex: 1, lineHeight: 16 },
  cycleAlertTap: { color: COLORS.roseGold, fontSize: SIZES.xs, textAlign: 'right', marginTop: 4 },
  inactiveCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#FF4B4B44', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inactiveAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF4B4B22', justifyContent: 'center', alignItems: 'center' },
  inactiveAvatarText: { color: COLORS.error, fontSize: 16, ...FONTS.bold },
  inactiveName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  inactiveGoal: { color: COLORS.textMuted, fontSize: SIZES.xs },
  inactiveArrow: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  recentLogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  recentLogAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  recentLogAvatarText: { color: COLORS.roseGold, fontSize: 14, ...FONTS.bold },
  recentLogName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  recentLogDetail: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  recentLogTime: { color: COLORS.textMuted, fontSize: SIZES.xs },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { width: '47%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  quickActionIcon: { fontSize: 28, marginBottom: 6 },
  quickActionLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },
  empty: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 24, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: SIZES.sm },
});