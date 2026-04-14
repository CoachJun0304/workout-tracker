import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function ApproveCoachesScreen() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchCoaches(); }, []);

  async function fetchCoaches() {
    setRefreshing(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'coach')
      .order('created_at', { ascending: false });
    setPending((data || []).filter(c => c.approval_status === 'pending'));
    setApproved((data || []).filter(c => c.approval_status === 'approved'));
    setRefreshing(false);
  }

  async function approveCoach(coach) {
    Alert.alert('Approve Coach',
      `Approve "${coach.name}" as a coach?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve', onPress: async () => {
          await supabase.from('profiles')
            .update({ approval_status: 'approved' })
            .eq('id', coach.id);
          fetchCoaches();
          Alert.alert('✅ Approved!', `${coach.name} can now access the app.`);
        }
      }
    ]);
  }

  async function rejectCoach(coach) {
    Alert.alert('Reject Coach',
      `Reject "${coach.name}"? They will not be able to access the app.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive', onPress: async () => {
          await supabase.from('profiles')
            .update({ approval_status: 'rejected' })
            .eq('id', coach.id);
          fetchCoaches();
        }
      }
    ]);
  }

  async function revokeCoach(coach) {
    Alert.alert('Revoke Access',
      `Revoke "${coach.name}"'s coach access?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive', onPress: async () => {
          await supabase.from('profiles')
            .update({ approval_status: 'pending' })
            .eq('id', coach.id);
          fetchCoaches();
        }
      }
    ]);
  }

  const CoachCard = ({ coach, showApprove }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{coach.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.coachName}>{coach.name}</Text>
          <Text style={styles.coachEmail}>{coach.email}</Text>
          <Text style={styles.coachDate}>
            Registered: {new Date(coach.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge,
          { backgroundColor: showApprove ? '#FFB34722' : '#00C89622' }]}>
          <Text style={[styles.statusText,
            { color: showApprove ? COLORS.warning : COLORS.success }]}>
            {showApprove ? 'Pending' : 'Approved'}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        {showApprove ? (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.success + '22',
                borderColor: COLORS.success }]}
              onPress={() => approveCoach(coach)}>
              <Text style={[styles.actionBtnText, { color: COLORS.success }]}>
                ✅ Approve
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.error + '22',
                borderColor: COLORS.error }]}
              onPress={() => rejectCoach(coach)}>
              <Text style={[styles.actionBtnText, { color: COLORS.error }]}>
                ❌ Reject
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.error + '22',
              borderColor: COLORS.error }]}
            onPress={() => revokeCoach(coach)}>
            <Text style={[styles.actionBtnText, { color: COLORS.error }]}>
              Revoke Access
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={fetchCoaches}
          tintColor={COLORS.roseGold} />
      }>
      <Text style={styles.pageTitle}>Coach Approvals</Text>
      <Text style={styles.pageSub}>
        Manage coach access to FitCoach Pro
      </Text>

      {pending.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Approval</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{pending.length}</Text>
            </View>
          </View>
          {pending.map(c => <CoachCard key={c.id} coach={c} showApprove={true} />)}
        </>
      )}

      {pending.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyText}>No pending approvals</Text>
        </View>
      )}

      {approved.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            Approved Coaches
          </Text>
          {approved.map(c => <CoachCard key={c.id} coach={c} showApprove={false} />)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: {
    fontSize: SIZES.xxxl, ...FONTS.heavy,
    color: COLORS.white, marginBottom: 4,
  },
  pageSub: {
    fontSize: SIZES.sm, color: COLORS.textSecondary, marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 12,
  },
  sectionTitle: {
    fontSize: SIZES.sm, ...FONTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  countBadge: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    width: 22, height: 22, justifyContent: 'center', alignItems: 'center',
  },
  countText: { color: COLORS.white, fontSize: 11, ...FONTS.bold },
  card: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.darkBorder, marginBottom: 12,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.roseGoldMid,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.roseGold, fontSize: 20, ...FONTS.bold },
  coachName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.bold },
  coachEmail: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop: 2 },
  coachDate: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  statusBadge: {
    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusText: { fontSize: 11, ...FONTS.semibold },
  cardActions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  actionBtn: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.full,
    borderWidth: 1, alignItems: 'center',
  },
  actionBtnText: { fontSize: SIZES.sm, ...FONTS.semibold },
  emptyCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 32, alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyText: { color: COLORS.textSecondary, fontSize: SIZES.md },
});