import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Text, Surface, Button, Searchbar, FAB, Chip } from 'react-native-paper';
import { supabase } from '../../lib/supabase';

export default function ClientsScreen({ navigation }) {
  const [clients, setClients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchClients(); }, []);
  useEffect(() => {
    setFiltered(clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())));
  }, [search, clients]);

  async function fetchClients() {
    setRefreshing(true);
    const { data } = await supabase.from('profiles')
      .select('*').eq('role', 'client').order('name');
    setClients(data || []);
    setFiltered(data || []);
    setRefreshing(false);
  }

  const renderClient = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('ClientDetail', { client: item })}>
      <Surface style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.clientName}>{item.name}</Text>
            <Text style={styles.clientMeta}>{item.goal || 'No goal set'} · {item.preferred_split || 'No split'}</Text>
            <Text style={styles.clientContact}>{item.contact || item.email}</Text>
          </View>
          <Chip style={{ backgroundColor: item.status === 'active' ? '#00B89422' : '#63636322' }}
            textStyle={{ color: item.status === 'active' ? '#00B894' : '#636363', fontSize: 11 }}>
            {item.status}
          </Chip>
        </View>
        <View style={styles.cardActions}>
          <Button compact icon="dumbbell" onPress={() => navigation.navigate('LogWorkout', { client: item })}>Log</Button>
          <Button compact icon="chart-line" onPress={() => navigation.navigate('Progress', { client: item })}>Progress</Button>
          <Button compact icon="trophy" onPress={() => navigation.navigate('Records', { client: item })}>PRs</Button>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Searchbar placeholder="Search clients..." value={search} onChangeText={setSearch}
        style={styles.search} inputStyle={{ color: '#fff' }} iconColor="#888" />
      <FlatList data={filtered} keyExtractor={i => i.id} renderItem={renderClient}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchClients} tintColor="#6C63FF" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No clients yet</Text>
            <Button mode="contained" onPress={() => navigation.navigate('AddClient')} style={{ marginTop: 12 }}>
              Add First Client
            </Button>
          </View>
        }
      />
      <FAB icon="plus" style={styles.fab} onPress={() => navigation.navigate('AddClient')} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  search: { margin: 16, backgroundColor: '#1a1a1a' },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  card: { marginBottom: 12, borderRadius: 16, backgroundColor: '#1a1a1a', overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6C63FF33', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#6C63FF', fontSize: 20, fontWeight: 'bold' },
  cardInfo: { flex: 1 },
  clientName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  clientMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  clientContact: { color: '#666', fontSize: 11, marginTop: 2 },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingHorizontal: 8 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#888', fontSize: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#6C63FF' },
});