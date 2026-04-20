import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Platform, TextInput as RNTextInput
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { showAlert, showConfirm } from '../../utils/webAlert';

export default function ClientsScreen({ navigation }) {
  const { profile } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setRefreshing(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .eq('status', 'active')
      .order('name', { ascending: true });
    setClients(data || []);
    setRefreshing(false);
  }

  async function deleteClient(client) {
    showConfirm(
      'Remove Client',
      `Remove ${client.name} from your client list?`,
      async () => {
        await supabase.from('profiles')
          .update({ status: 'inactive' })
          .eq('id', client.id);
        fetchClients();
      },
      null, 'Remove', true
    );
  }

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <RNTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search clients..."
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput} />
        <TouchableOpacity style={styles.addBtn}
          onPress={() => navigation.navigate('AddClient')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchClients} tintColor={COLORS.roseGold} />}
        contentContainerStyle={styles.content}>

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>No clients yet</Text>
            <Text style={styles.emptySub}>Tap + Add to add your first client</Text>
          </View>
        ) : filtered.map(client => (
          <TouchableOpacity key={client.id} style={styles.clientCard}
            onPress={() => navigation.navigate('ClientDetail', { client })}>
            <View style={styles.clientAvatar}>
              <Text style={styles.clientAvatarText}>
                {client.name?.charAt(0) || '?'}
              </Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{client.name}</Text>
              <Text style={styles.clientMeta}>
                {client.goal || 'No goal'} · {client.gender || 'Unknown'}
              </Text>
              {client.contact && (
                <Text style={styles.clientContact}>{client.contact}</Text>
              )}
            </View>
            <View style={styles.clientActions}>
              <TouchableOpacity style={styles.logBtn}
                onPress={() => navigation.navigate('LogWorkout', { client })}>
                <Text style={styles.logBtnText}>Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn}
                onPress={() => deleteClient(client)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  searchBar: { flexDirection: 'row', padding: 16, gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.darkBorder },
  searchInput: { flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.white, fontSize: SIZES.md, borderWidth: 1, borderColor: COLORS.darkBorder },
  addBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.sm },
  content: { padding: 16, paddingBottom: 40 },
  emptyCard: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  emptySub: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 4 },
  clientCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.darkBorder, gap: 12 },
  clientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  clientInfo: { flex: 1 },
  clientName: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  clientMeta: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  clientContact: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  clientActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 6 },
  logBtnText: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.xs },
  deleteBtn: { padding: 6, backgroundColor: '#FF4B4B22', borderRadius: RADIUS.md },
  deleteBtnText: { fontSize: 16 },
});