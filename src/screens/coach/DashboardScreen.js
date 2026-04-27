import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Platform
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { getPhaseForDate, getCurrentPhase } from '../../data/cycleData';
import { showAlert } from '../../utils/webAlert';

export default function DashboardScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({
    clients: 0, logsToday: 0, logsWeek: 0, inactive: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [inactiveClients, setInactiveClients] = useState([]);
  const [cycleAlerts, setCycleAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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
        .select('id, name, goal, gender, status')
        .eq('role', 'client').eq('status', 'active'),
    ]);

    // Find inactive clients
    const inactive = [];
    for (const client of (allClients || [])) {
      const { count } = await supabase.from('workout_logs')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .gte('logged_at', twoWeeksAgo);
      if (!count) inactive.push(client);
    }

    // Cycle alerts for female clients
    const femaleClients = (allClients || []).filter(c => c.gender === 'Female');
    const alerts = [];
    for (const client of femaleClients) {
      const { data: cycles } = await supabase
        .from('menstrual_cycles')
        .select('*')
        .eq('client_id', client.id)
        .order('cycle_start_date', { ascending: false })
        .limit(1);

      if (cycles && cycles.length > 0) {
        const cycle = cycles[0];
        const phase = getCurrentPhase(cycle.cycle_start_date, cycle.cycle_length);
        if (phase) {
          alerts.push({
            client,
            phase,
            cycle,
          });
        }
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
    if (name.includes('ovulatory') || name.includes('ovulation')) return { label: 'Peak Performance', color: '#FFE66D', emoji: '⭐' };
    if (name.includes('luteal')) return { label: 'Moderate → Low', color: '#FF9F43', emoji: '🟡' };
    return { label: 'Check Phase', color: COLORS.textMuted, emoji: '📋' };
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData}
        tintColor={COLORS.roseGold} />}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {new Date().getHours() < 12 ? 'Good morning' :
             new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} 👋
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
        <View style={[styles.statCard,
          stats.inactive > 0 && { borderColor: COLORS.error }]}>
          <Text style={[styles.statValue,
            stats.inactive > 0 && { color: COLORS.error }]}>
            {stats.inactive}
          </Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* ── CYCLE ALERTS ──────────────────────────────── */}
      {cycleAlerts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌸 Female Client Cycle Alerts</Text>
          <Text style={styles.sectionSubtitle}>
            Adjust training intensity based on each client's current phase
          </Text>
          {cycleAlerts.map(({ client, phase, cycle }) => {
            const intensity = getPhaseIntensityLabel(phase);
            return (
              <TouchableOpacity key={client.id} style={[styles.cycleAlertCard,
                { borderLeftColor: phase.color }]}
                onPress={() => navigation.navigate('Clients',
                  { screen: 'ClientDetail', params: { client } })}>

                {/* Client info */}
                <View style={styles.cycleAlertHeader}>
                  <View style={styles.cycleAvatar}>
                    <Text style={styles.cycleAvatarText}>
                      {client.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cycleClientName}>{client.name}</Text>
                    <View style={styles.cyclePhaseRow}>
                      <Text style={{ fontSize: 14 }}>{phase.emoji}</Text>
                      <Text style={[styles.cyclePhaseName, { color: phase.color }]}>
                        {phase.name}
                      </Text>
                      <Text style={styles.cycleDayIn}>
                        Day {phase.dayInPhase}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.intensityBadge,
                    { backgroundColor: intensity.color + '22', borderColor: intensity.color }]}>
                    <Text style={{ fontSize: 10 }}>{intensity.emoji}</Text>
                    <Text style={[styles.intensityLabel, { color: intensity.color }]}>
                      {intensity.label}
                    </Text>
                  </View>
                </View>

                {/* Phase description */}
                <Text style={styles.cyclePhaseDesc}>
                  {phase.description}
                </Text>

                {/* Top recommendations */}
                <View style={styles.cycleRecsRow}>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>💪</Text>
                    <Text style={styles.cycleRecText}>
                      {phase.workoutRecommendations?.[0] || 'Adjust intensity'}
                    </Text>
                  </View>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>🥗</Text>
                    <Text style={styles.cycleRecText}>
                      {phase.nutritionTips?.[0] || 'Monitor nutrition'}
                    </Text>
                  </View>
                  <View style={styles.cycleRec}>
                    <Text style={styles.cycleRecIcon}>⚖️</Text>
                    <Text style={styles.cycleRecText}>
                      {phase.weightNote || 'Monitor weight'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cycleAlertTap}>
                  Tap to view client profile →
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── INACTIVE CLIENTS ──────────────────────────── */}
      {inactiveClients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠️ No Activity (2+ Weeks)</Text>
          {inactiveClients.map(client => (
            <TouchableOpacity key={client.id} style={styles.inactiveCard}
              onPress={() => navigation.navigate('Clients',
                { screen: 'ClientDetail', params: { client } })}>
              <View style={styles.inactiveAvatar}>
                <Text style={styles.inactiveAvatarText}>
                  {client.name.charAt(0)}
                </Text>
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

      {/* ── RECENT ACTIVITY ────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Recent Activity</Text>
        {recentLogs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No activity yet today</Text>
          </View>
        ) : (
          recentLogs.map((log, i) => (
            <View key={i} style={styles.recentLogRow}>
              <View style={styles.recentLogAvatar}>
                <Text style={styles.recentLogAvatarText}>
                  {log.profiles?.name?.charAt(0) || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentLogName}>
                  {log.profiles?.name || 'Unknown'}
                </Text>
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
          ))
        )}
      </View>

      {/* ── QUICK ACTIONS ──────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity style={styles.quickAction}
            onPress={() => navigation.navigate('Clients',
              { screen: 'AddClient' })}>
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
          <TouchableOpacity style={styles.quickAction}
            onPress={fetchData}>
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

  // Cycle alerts
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

  // Inactive clients
  inactiveCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#FF4B4B44', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inactiveAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF4B4B22', justifyContent: 'center', alignItems: 'center' },
  inactiveAvatarText: { color: COLORS.error, fontSize: 16, ...FONTS.bold },
  inactiveName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  inactiveGoal: { color: COLORS.textMuted, fontSize: SIZES.xs },
  inactiveArrow: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },

  // Recent logs
  recentLogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  recentLogAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  recentLogAvatarText: { color: COLORS.roseGold, fontSize: 14, ...FONTS.bold },
  recentLogName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  recentLogDetail: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  recentLogTime: { color: COLORS.textMuted, fontSize: SIZES.xs },

  // Quick actions
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { width: '47%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  quickActionIcon: { fontSize: 28, marginBottom: 6 },
  quickActionLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold },

  empty: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 24, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: SIZES.sm },
});