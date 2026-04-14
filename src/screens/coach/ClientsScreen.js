import React, { useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, TextInput,
} from 'react-native';
import { Text, FAB } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function ClientsScreen({ navigation }) {
  const { profile } = useAuth();
  const [clients, setClients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q)
    ));
  }, [search, clients]);

  async function fetchClients() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('name', { ascending: true });

    if (error) {
      Alert.alert('Error loading clients', error.message);
      setRefreshing(false);
      return;
    }

    const all = data || [];
    const visible = showInactive
      ? all
      : all.filter(c => c.status !== 'inactive');
    setClients(visible);
    setFiltered(visible);
    setRefreshing(false);
  }

  async function deactivateClient(client) {
    Alert.alert(
      'Deactivate Client',
      `Deactivate "${client.name}"?\n\nThey will be hidden from your client list but all their data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive',
          onPress: async () => {
            await supabase.from('profiles')
              .update({ status: 'inactive' })
              .eq('id', client.id);
            fetchClients();
            Alert.alert('Done', `${client.name} has been deactivated.`);
          }
        }
      ]
    );
  }

  async function reactivateClient(client) {
    await supabase.from('profiles')
      .update({ status: 'active' })
      .eq('id', client.id);
    fetchClients();
  }

  function getLastWorkout(client) {
    if (!client.last_workout_at) return 'No workouts logged';
    const d = new Date(client.last_workout_at);
    const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Last workout: Today';
    if (diff === 1) return 'Last workout: Yesterday';
    if (diff < 7) return `Last workout: ${diff} days ago`;
    return `Last workout: ${d.toLocaleDateString()}`;
  }

  const renderClient = ({ item }) => {
    const isInactive = item.status === 'inactive';
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('ClientDetail', { client: item })}
        activeOpacity={0.8}>
        <View style={[styles.card, isInactive && styles.cardInactive]}>
          <View style={styles.cardTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
            </View>
            <View style={styles.cardInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.clientName}>{item.name}</Text>
                <View style={[styles.statusBadge,
                  isInactive
                    ? { backgroundColor: '#FF4B4B22', borderColor: COLORS.error }
                    : { backgroundColor: '#00C89622', borderColor: COLORS.success }
                ]}>
                  <Text style={[styles.statusText,
                    { color: isInactive ? COLORS.error : COLORS.success }]}>
                    {isInactive ? 'Inactive' : 'Active'}
                  </Text>
                </View>
              </View>
              <Text style={styles.clientMeta}>
                {item.goal || 'No goal'} · {item.preferred_split || 'No split'}
              </Text>
              <Text style={styles.lastWorkout}>{getLastWorkout(item)}</Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('LogWorkout', { client: item })}>
              <Text style={styles.actionBtnText}>📝 Log</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('Progress', { client: item })}>
              <Text style={styles.actionBtnText}>📈 Progress</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('CoachHealth', { client: item })}>
              <Text style={styles.actionBtnText}>🥗 Health</Text>
            </TouchableOpacity>
            {isInactive
              ? <TouchableOpacity style={[styles.actionBtn, styles.reactivateBtn]}
                  onPress={() => reactivateClient(item)}>
                  <Text style={[styles.actionBtnText, { color: COLORS.success }]}>
                    ✅ Reactivate
                  </Text>
                </TouchableOpacity>
              : <TouchableOpacity style={[styles.actionBtn, styles.deactivateBtn]}
                  onPress={() => deactivateClient(item)}>
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>
                    🚫 Deactivate
                  </Text>
                </TouchableOpacity>
            }
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="Search clients..."
          placeholderTextColor={COLORS.textMuted}
        />
        <TouchableOpacity
          style={[styles.filterBtn,
            showInactive && { backgroundColor: COLORS.roseGoldMid }]}
          onPress={() => {
            setShowInactive(v => !v);
            setTimeout(() => fetchClients(), 100);
          }}>
          <Text style={styles.filterBtnText}>
            {showInactive ? '👁 All' : '👁 Active'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchClients}
            tintColor={COLORS.roseGold} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>No clients yet</Text>
            <Text style={styles.emptySub}>Tap + to add your first client</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} color={COLORS.white}
        onPress={() => navigation.navigate('AddClient')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  searchRow: {
    flexDirection: 'row', gap: 8,
    padding: 12, paddingBottom: 4,
  },
  searchInput: {
    flex: 1, backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.full, paddingHorizontal: 16,
    paddingVertical: 10, color: COLORS.white,
    fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  filterBtn: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.darkBorder,
    justifyContent: 'center',
  },
  filterBtnText: { color: COLORS.white, fontSize: SIZES.sm },
  list: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.darkBorder,
    marginBottom: 12, overflow: 'hidden',
  },
  cardInactive: { opacity: 0.6, borderColor: COLORS.error + '40' },
  cardTop: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: COLORS.roseGoldMid,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.roseGold, fontSize: 22, ...FONTS.bold },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  clientName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  statusBadge: {
    borderRadius: RADIUS.full, paddingHorizontal: 8,
    paddingVertical: 2, borderWidth: 1,
  },
  statusText: { fontSize: 10, ...FONTS.semibold },
  clientMeta: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginBottom: 2 },
  lastWorkout: { color: COLORS.textMuted, fontSize: SIZES.xs },
  cardActions: {
    flexDirection: 'row', borderTopWidth: 1,
    borderTopColor: COLORS.darkBorder2, flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: 'center', minWidth: '25%',
  },
  actionBtnText: { color: COLORS.textSecondary, fontSize: 11, ...FONTS.medium },
  deactivateBtn: { borderLeftWidth: 1, borderLeftColor: COLORS.darkBorder2 },
  reactivateBtn: { borderLeftWidth: 1, borderLeftColor: COLORS.darkBorder2 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 64, marginBottom: 12 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.md, marginTop: 6 },
  fab: {
    position: 'absolute', right: 16, bottom: 16,
    backgroundColor: COLORS.roseGold,
  },
});