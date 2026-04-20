import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { format, subDays } from 'date-fns';

export default function DashboardScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({ clients: 0, logsToday: 0, logsWeek: 0, inactive: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [inactiveClients, setInactiveClients] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setRefreshing(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const twoWeeksAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

    const [{ count: clients }, { count: logsToday }, { count: logsWeek },
      { data: recent }, { data: allClients }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .eq('role', 'client').eq('status', 'active'),
      supabase.from('workout_logs').select('*', { count: 'exact', head: true })
        .gte('logged_at', today),
      supabase.from('workout_logs').select('*', { count: 'exact', head: true })
        .gte('logged_at', weekAgo),
      supabase.from('workout_logs').select('*, profiles!client_id(name)')
        .order('logged_at', { ascending: false }).limit(5),
      supabase.from('profiles').select('id, name, goal')
        .eq('role', 'client').eq('status', 'active'),
    ]);

    // Find inactive clients (no logs in 2 weeks)
    const inactive = [];
    for (const client of (allClients || [])) {
      const { count } = await supabase.from('workout_logs')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id).gte('logged_at', twoWeeksAgo);
      if (!count) inactive.push(client);
    }

    setStats({ clients: clients || 0, logsToday: logsToday || 0, logsWeek: logsWeek || 0, inactive: inactive.length });
    setRecentLogs(recent || []);
    setInactiveClients(inactive);
    setRefreshing(false);
  }

 function confirmSignOut() {
  if (Platform.OS === 'web') {
    if (window.confirm('Are you sure you want to sign out?')) {
      signOut();
    }
  } else {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  }
}

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor={COLORS.roseGold} />}>

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>{profile?.name?.split(' ')[0] || 'Coach'} 👋</Text>
        </View>
        <TouchableOpacity onPress={confirmSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.clients}</Text>
          <Text style={styles.statLabel}>Active Clients</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: COLORS.success }]}>{stats.logsToday}</Text>
          <Text style={styles.statLabel}>Logs Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: COLORS.roseGold }]}>{stats.logsWeek}</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
        <View style={[styles.statCard, stats.inactive > 0 && { borderColor: COLORS.error }]}>
          <Text style={[styles.statValue, { color: stats.inactive > 0 ? COLORS.error : COLORS.textMuted }]}>
            {stats.inactive}
          </Text>
          <Text style={styles.statLabel}>Inactive 2wks</Text>
        </View>
      </View>

      {/* Inactive alert */}
      {inactiveClients.length > 0 && (
        <View style={styles.inactiveCard}>
          <Text style={styles.inactiveTitle}>⚠️ Clients with no activity in 2 weeks</Text>
          {inactiveClients.map(c => (
            <TouchableOpacity key={c.id} style={styles.inactiveRow}
              onPress={() => navigation.navigate('Clients', {
                screen: 'ClientDetail', params: { client: c }
              })}>
              <Text style={styles.inactiveName}>{c.name}</Text>
              <Text style={styles.inactiveGoal}>{c.goal || 'No goal'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionCard}
          onPress={() => navigation.navigate('Clients', { screen: 'AddClient' })}>
          <Text style={styles.actionEmoji}>➕</Text>
          <Text style={styles.actionText}>Add Client</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard}
          onPress={() => navigation.navigate('Clients')}>
          <Text style={styles.actionEmoji}>🏋️</Text>
          <Text style={styles.actionText}>Log Workout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard}
          onPress={() => navigation.navigate('Templates')}>
          <Text style={styles.actionEmoji}>📋</Text>
          <Text style={styles.actionText}>Programs</Text>
        </TouchableOpacity>
      </View>

      {/* Recent activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {recentLogs.length === 0
        ? <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No workouts logged yet</Text>
          </View>
        : recentLogs.map((log, i) => (
          <View key={i} style={styles.logCard}>
            <View style={styles.logRow}>
              <Text style={styles.logExercise}>{log.exercise_name}</Text>
              <Text style={styles.logWeight}>
                {log.weight_kg ? `${log.weight_kg}kg` : 'BW'}
              </Text>
            </View>
            <Text style={styles.logMeta}>
              {log.profiles?.name} · {log.reps} reps ·{' '}
              {format(new Date(log.logged_at), 'MMM d, h:mm a')}
            </Text>
            {log.is_personal_best && <Text style={styles.prBadge}>🏆 Personal Best!</Text>}
          </View>
        ))
      }

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  greeting: { color: COLORS.textSecondary, fontSize: SIZES.md },
  name: { color: COLORS.white, fontSize: SIZES.xxxl, ...FONTS.heavy },
  signOutBtn: { padding: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FF4B4B33' },
  signOutText: { color: COLORS.error, fontSize: SIZES.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  statCard: { width: '47%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding: 16, borderWidth: 1, borderColor: COLORS.darkBorder, alignItems: 'center' },
  statValue: { fontSize: SIZES.xxxl, ...FONTS.bold, color: COLORS.roseGold },
  statLabel: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4, textAlign: 'center' },
  inactiveCard: { margin: 16, backgroundColor: '#FF4B4B11', borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: '#FF4B4B44' },
  inactiveTitle: { color: COLORS.error, ...FONTS.bold, fontSize: SIZES.sm, marginBottom: 10 },
  inactiveRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#FF4B4B22' },
  inactiveName: { color: COLORS.white, ...FONTS.semibold },
  inactiveGoal: { color: COLORS.textMuted, fontSize: SIZES.sm },
  sectionTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  actionCard: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  actionEmoji: { fontSize: 24, marginBottom: 6 },
  actionText: { color: COLORS.white, fontSize: SIZES.xs, ...FONTS.semibold, textAlign: 'center' },
  logCard: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logExercise: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.semibold },
  logWeight: { color: COLORS.roseGold, fontSize: SIZES.md, ...FONTS.bold },
  logMeta: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 4 },
  prBadge: { color: '#FFE66D', fontSize: SIZES.xs, marginTop: 4 },
  emptyCard: { margin: 16, padding: 32, borderRadius: RADIUS.lg, backgroundColor: COLORS.darkCard, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted },
});