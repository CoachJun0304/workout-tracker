import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';

export default function DashboardScreen({ navigation }) {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({ clients: 0, logsToday: 0, logsWeek: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setRefreshing(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    const [{ count: clients }, { count: logsToday }, { count: logsWeek }, { data: recent }] =
      await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client').eq('status', 'active'),
        supabase.from('workout_logs').select('*', { count: 'exact', head: true }).gte('logged_at', today),
        supabase.from('workout_logs').select('*', { count: 'exact', head: true }).gte('logged_at', weekAgo),
        supabase.from('workout_logs').select('*, profiles(name)').order('logged_at', { ascending: false }).limit(5),
      ]);

    setStats({ clients: clients || 0, logsToday: logsToday || 0, logsWeek: logsWeek || 0 });
    setRecentLogs(recent || []);
    setRefreshing(false);
  }

  const StatCard = ({ label, value, color }) => (
    <Surface style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Surface>
  );

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#6C63FF" />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name || 'Coach'} 👋</Text>
        </View>
        <Button onPress={signOut} textColor="#888">Sign Out</Button>
      </View>
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.statsRow}>
        <StatCard label="Active Clients" value={stats.clients} color="#6C63FF" />
        <StatCard label="Logs Today" value={stats.logsToday} color="#00B894" />
        <StatCard label="This Week" value={stats.logsWeek} color="#E17055" />
      </View>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <Button mode="contained" icon="account-plus" style={styles.actionBtn}
          onPress={() => navigation.navigate('Clients', { screen: 'AddClient' })}>
          Add Client
        </Button>
        <Button mode="contained" icon="dumbbell" style={[styles.actionBtn, { backgroundColor: '#00B894' }]}
          onPress={() => navigation.navigate('Clients')}>
          Log Workout
        </Button>
      </View>
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {recentLogs.length === 0
        ? <Surface style={styles.emptyCard}><Text style={styles.emptyText}>No workouts logged yet</Text></Surface>
        : recentLogs.map((log, i) => (
          <Surface key={i} style={styles.logCard}>
            <View style={styles.logRow}>
              <Text style={styles.logExercise}>{log.exercise_name}</Text>
              <Text style={styles.logWeight}>{log.weight_kg ? `${log.weight_kg}kg` : 'BW'}</Text>
            </View>
            <Text style={styles.logMeta}>
              {log.profiles?.name} · {log.reps} reps · {format(new Date(log.logged_at), 'MMM d, h:mm a')}
            </Text>
            {log.is_personal_best && <Text style={styles.prBadge}>🏆 Personal Best!</Text>}
          </Surface>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  greeting: { color: '#888', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  statCard: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a', borderLeftWidth: 3 },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 2 },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  actionBtn: { flex: 1, borderRadius: 8 },
  logCard: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: 12, backgroundColor: '#1a1a1a' },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logExercise: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logWeight: { color: '#6C63FF', fontSize: 15, fontWeight: 'bold' },
  logMeta: { color: '#888', fontSize: 12, marginTop: 4 },
  prBadge: { color: '#FDCB6E', fontSize: 12, marginTop: 4 },
  emptyCard: { margin: 16, padding: 32, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  emptyText: { color: '#888' },
});