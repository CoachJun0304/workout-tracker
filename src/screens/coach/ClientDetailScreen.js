import { showAlert, showConfirm } from '../../utils/webAlert';
import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params;

  const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );

  const ActionButton = ({ icon, label, color, onPress }) => (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color + '60' }]}
      onPress={onPress}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
        </View>
        <Text style={styles.clientName}>{client.name}</Text>
        <Text style={styles.clientSplit}>
          {client.preferred_split || 'No split assigned'}
        </Text>
        <View style={[styles.statusBadge,
          client.status === 'inactive'
            ? { backgroundColor: '#FF4B4B22', borderColor: COLORS.error }
            : { backgroundColor: '#00C89622', borderColor: COLORS.success }
        ]}>
          <Text style={[styles.statusText,
            { color: client.status === 'inactive' ? COLORS.error : COLORS.success }]}>
            {client.status === 'inactive' ? '● Inactive' : '● Active'}
          </Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <InfoRow label="Age" value={client.age ? `${client.age} years` : null} />
        <InfoRow label="Gender" value={client.gender} />
        <InfoRow label="Weight" value={client.weight_kg ? `${client.weight_kg} kg` : null} />
        <InfoRow label="Height" value={client.height_cm ? `${client.height_cm} cm` : null} />
        <InfoRow label="Goal" value={client.goal} />
        <InfoRow label="Contact" value={client.contact || client.email} />
      </View>

      {/* Actions */}
      <Text style={styles.sectionLabel}>Actions</Text>
      <View style={styles.actionsGrid}>
        <ActionButton icon="📝" label="Log Workout" color={COLORS.roseGold}
          onPress={() => navigation.navigate('LogWorkout', { client })} />
        <ActionButton icon="📋" label="Assign Program" color={COLORS.purple}
          onPress={() => navigation.navigate('AssignProgram', { client })} />
        <ActionButton icon="📈" label="Progress" color={COLORS.success}
          onPress={() => navigation.navigate('Progress', { client })} />
        <ActionButton icon="🏆" label="Records" color={COLORS.warning}
          onPress={() => navigation.navigate('Records', { client })} />
        <ActionButton icon="🥗" label="Health & Nutrition" color='#4ECDC4'
          onPress={() => navigation.navigate('CoachHealth', { client })} />
        <ActionButton icon="⚖️" label="Weight Tracker" color={COLORS.blue}
          onPress={() => navigation.navigate('CoachHealth', { client })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
  avatarCard: {
    alignItems: 'center', padding: 24,
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl,
    marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.roseGoldMid,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { color: COLORS.roseGold, fontSize: 36, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.bold },
  clientSplit: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 4, marginBottom: 10 },
  statusBadge: {
    borderRadius: RADIUS.full, paddingHorizontal: 12,
    paddingVertical: 4, borderWidth: 1,
  },
  statusText: { fontSize: SIZES.xs, ...FONTS.semibold },
  infoCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: SIZES.xs, ...FONTS.bold,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 10, marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 0.5,
    borderBottomColor: COLORS.darkBorder,
  },
  infoLabel: { color: COLORS.textSecondary, fontSize: SIZES.md },
  infoValue: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.medium },
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  actionBtn: {
    width: '47%', backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.lg, padding: 16,
    alignItems: 'center', borderWidth: 1,
  },
  actionIcon: { fontSize: 28, marginBottom: 6 },
  actionLabel: { fontSize: SIZES.sm, ...FONTS.semibold, textAlign: 'center' },
});