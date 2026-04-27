import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { showAlert, showConfirm } from '../../utils/webAlert';
import { getCurrentPhase } from '../../data/cycleData';

const SPLITS = ['Push/Pull/Legs','Upper/Lower','Full Body','Bro Split','PHAT','Custom'];
const GOALS = ['Muscle Gain','Fat Loss','Strength','Athletic','General Fitness'];
const GENDERS = ['Male','Female','Other'];

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params || {};
  if (!client) return null;

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cyclePhase, setCyclePhase] = useState(null);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [form, setForm] = useState({
    name: client.name || '',
    contact: client.contact || '',
    age: client.age ? String(client.age) : '',
    gender: client.gender || 'Male',
    weight_kg: client.weight_kg ? String(client.weight_kg) : '',
    height_cm: client.height_cm ? String(client.height_cm) : '',
    goal: client.goal || '',
    preferred_split: client.preferred_split || '',
  });

  useEffect(() => {
    if (client.gender === 'Female') fetchCyclePhase();
  }, []);

  async function fetchCyclePhase() {
    const { data } = await supabase
      .from('menstrual_cycles')
      .select('*')
      .eq('client_id', client.id)
      .order('cycle_start_date', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const phase = getCurrentPhase(data[0].cycle_start_date, data[0].cycle_length);
      setCyclePhase(phase);
    }
  }

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name: form.name.trim(),
      contact: form.contact.trim(),
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      goal: form.goal,
      preferred_split: form.preferred_split,
    }).eq('id', client.id);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }
    setEditing(false);
    showAlert('✅ Updated!', `${form.name}'s profile has been updated.`);
  }

  async function handleDelete() {
    showConfirm(
      'Remove Client',
      `Remove ${client.name}? They can still log in but won't appear in your dashboard.`,
      async () => {
        await supabase.from('profiles')
          .update({ status: 'inactive' }).eq('id', client.id);
        navigation.goBack();
      },
      null, 'Remove', true
    );
  }

  function getIntensityInfo(phase) {
    if (!phase) return null;
    const name = phase.name?.toLowerCase() || '';
    if (name.includes('menstrual')) return {
      label: 'Low Intensity Recommended',
      color: '#FF6B6B',
      emoji: '🔴',
      tip: 'Reduce weights by 20-30%. Focus on recovery and mobility.',
    };
    if (name.includes('follicular')) return {
      label: 'Moderate to High Intensity',
      color: '#4ECDC4',
      emoji: '🟢',
      tip: 'Good time to increase weights. Energy levels rising.',
    };
    if (name.includes('ovulat')) return {
      label: 'Peak Performance Window',
      color: '#FFE66D',
      emoji: '⭐',
      tip: 'Best time for PRs and high intensity. Energy is at its peak.',
    };
    if (name.includes('luteal')) return {
      label: 'Moderate → Reduce Intensity',
      color: '#FF9F43',
      emoji: '🟡',
      tip: 'Start strong but reduce intensity as the week progresses.',
    };
    return null;
  }

  const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );

  const ChipRow = ({ options, field }) => (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <TouchableOpacity key={opt}
          style={[styles.chip, form[field] === opt && styles.chipActive]}
          onPress={() => update(field, opt)}>
          <Text style={[styles.chipText, form[field] === opt && styles.chipTextActive]}>
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const intensityInfo = getIntensityInfo(cyclePhase);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── CYCLE PHASE BANNER ─────────────────────────── */}
      {cyclePhase && intensityInfo && (
        <TouchableOpacity
          style={[styles.cycleBanner, { borderColor: cyclePhase.color }]}
          onPress={() => setShowPhaseModal(true)}>
          <View style={styles.cycleBannerLeft}>
            <Text style={styles.cycleBannerEmoji}>{cyclePhase.emoji}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.cycleBannerTitleRow}>
                <Text style={[styles.cycleBannerPhase, { color: cyclePhase.color }]}>
                  {cyclePhase.name}
                </Text>
                <View style={[styles.intensityBadge,
                  { backgroundColor: intensityInfo.color + '22', borderColor: intensityInfo.color }]}>
                  <Text style={styles.intensityBadgeEmoji}>{intensityInfo.emoji}</Text>
                  <Text style={[styles.intensityBadgeText, { color: intensityInfo.color }]}>
                    {intensityInfo.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.cycleBannerDay}>
                Day {cyclePhase.dayInPhase} of this phase
              </Text>
              <Text style={styles.cycleBannerTip}>{intensityInfo.tip}</Text>
            </View>
          </View>
          <Text style={styles.cycleBannerMore}>View full recommendations →</Text>
        </TouchableOpacity>
      )}

      {/* ── AVATAR ─────────────────────────────────────── */}
      <View style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{form.name.charAt(0)}</Text>
        </View>
        <Text style={styles.clientName}>{form.name}</Text>
        <Text style={styles.clientSplit}>
          {form.preferred_split || form.goal || 'No goal set'}
        </Text>
        <View style={[styles.statusBadge,
          client.status === 'inactive'
            ? { backgroundColor: '#FF4B4B22', borderColor: COLORS.error }
            : { backgroundColor: '#00C89622', borderColor: COLORS.success }]}>
          <Text style={[styles.statusText,
            { color: client.status === 'inactive' ? COLORS.error : COLORS.success }]}>
            {client.status === 'inactive' ? '● Inactive' : '● Active'}
          </Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.editToggleBtn}
            onPress={() => setEditing(!editing)}>
            <Text style={styles.editToggleBtnText}>
              {editing ? '✕ Cancel' : '✏️ Edit Profile'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>🗑️ Remove</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── EDIT FORM ──────────────────────────────────── */}
      {editing ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Edit Client Profile</Text>
          {[
            { label: 'Full Name', field: 'name', type: 'default' },
            { label: 'Contact / Phone', field: 'contact', type: 'default' },
            { label: 'Age', field: 'age', type: 'numeric' },
            { label: 'Weight (kg)', field: 'weight_kg', type: 'numeric' },
            { label: 'Height (cm)', field: 'height_cm', type: 'numeric' },
          ].map(f => (
            <View key={f.field}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput value={form[f.field]} onChangeText={v => update(f.field, v)}
                style={styles.input} mode="outlined" keyboardType={f.type}
                outlineColor={COLORS.darkBorder} activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white} />
            </View>
          ))}
          <Text style={styles.fieldLabel}>Gender</Text>
          <ChipRow options={GENDERS} field="gender" />
          <Text style={styles.fieldLabel}>Goal</Text>
          <ChipRow options={GOALS} field="goal" />
          <Text style={styles.fieldLabel}>Preferred Split</Text>
          <ChipRow options={SPLITS} field="preferred_split" />
          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSave} disabled={loading}>
            <Text style={styles.saveBtnText}>
              {loading ? 'Saving...' : '✅ Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>Profile Info</Text>
          <InfoRow label="Age" value={form.age ? `${form.age} years` : null} />
          <InfoRow label="Gender" value={form.gender} />
          <InfoRow label="Weight" value={form.weight_kg ? `${form.weight_kg} kg` : null} />
          <InfoRow label="Height" value={form.height_cm ? `${form.height_cm} cm` : null} />
          <InfoRow label="Goal" value={form.goal} />
          <InfoRow label="Split" value={form.preferred_split} />
          <InfoRow label="Contact" value={form.contact || client.email} />
        </View>
      )}

      {/* ── ACTIONS ────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Actions</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('LogWorkout', { client })}>
          <Text style={styles.actionIcon}>🏋️</Text>
          <Text style={styles.actionLabel}>Log Workout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('AssignProgram', { client })}>
          <Text style={styles.actionIcon}>📋</Text>
          <Text style={styles.actionLabel}>Assign Program</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('WorkoutHistory', { client })}>
          <Text style={styles.actionIcon}>📅</Text>
          <Text style={styles.actionLabel}>Workout History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('ClientReport', { client })}>
          <Text style={styles.actionIcon}>📊</Text>
          <Text style={styles.actionLabel}>Workout Report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('Progress', { client })}>
          <Text style={styles.actionIcon}>📈</Text>
          <Text style={styles.actionLabel}>Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('Records', { client })}>
          <Text style={styles.actionIcon}>🏆</Text>
          <Text style={styles.actionLabel}>Records</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}
          onPress={() => navigation.navigate('CoachHealth', { client })}>
          <Text style={styles.actionIcon}>🥗</Text>
          <Text style={styles.actionLabel}>Health & Nutrition</Text>
        </TouchableOpacity>
      </View>

      {/* ── PHASE DETAIL MODAL ─────────────────────────── */}
      <Modal visible={showPhaseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {cyclePhase && (
                <View>
                  <Text style={[styles.modalTitle, { color: cyclePhase.color }]}>
                    {cyclePhase.emoji} {cyclePhase.name}
                  </Text>
                  <Text style={styles.modalSub}>
                    Day {cyclePhase.dayInPhase} · Days {cyclePhase.days}
                  </Text>
                  {intensityInfo && (
                    <View style={[styles.intensityFullBadge,
                      { backgroundColor: intensityInfo.color + '22', borderColor: intensityInfo.color }]}>
                      <Text style={[styles.intensityFullLabel, { color: intensityInfo.color }]}>
                        {intensityInfo.emoji} {intensityInfo.label}
                      </Text>
                      <Text style={styles.intensityFullTip}>{intensityInfo.tip}</Text>
                    </View>
                  )}

                  <Text style={styles.modalDesc}>{cyclePhase.description}</Text>

                  <Text style={styles.modalSection}>💪 Workout Recommendations</Text>
                  {cyclePhase.workoutRecommendations?.map((r, i) => (
                    <Text key={i} style={styles.modalItem}>• {r}</Text>
                  ))}

                  <Text style={styles.modalSection}>🥗 Nutrition Tips</Text>
                  {cyclePhase.nutritionTips?.map((r, i) => (
                    <Text key={i} style={styles.modalItem}>• {r}</Text>
                  ))}

                  <Text style={styles.modalSection}>⚖️ Weight Note</Text>
                  <Text style={styles.modalItem}>{cyclePhase.weightNote}</Text>

                  <Text style={styles.modalSection}>🏋️ Coaching Notes</Text>
                  <Text style={styles.modalItem}>
                    • Communicate openly with {client.name} about how she's feeling
                  </Text>
                  <Text style={styles.modalItem}>
                    • Adjust workout intensity on the fly based on her energy levels
                  </Text>
                  <Text style={styles.modalItem}>
                    • Weight fluctuations during this phase are normal — reassure her
                  </Text>
                  <Text style={styles.modalItem}>
                    • Log workout notes to track performance across cycle phases
                  </Text>
                </View>
              )}
              <TouchableOpacity style={[styles.modalCloseBtn, { marginTop: 20 }]}
                onPress={() => setShowPhaseModal(false)}>
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },

  // Cycle banner
  cycleBanner: { borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 2, backgroundColor: COLORS.darkCard },
  cycleBannerLeft: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cycleBannerEmoji: { fontSize: 28 },
  cycleBannerTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  cycleBannerPhase: { fontSize: SIZES.md, ...FONTS.bold },
  intensityBadge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  intensityBadgeEmoji: { fontSize: 10 },
  intensityBadgeText: { fontSize: 9, ...FONTS.bold },
  cycleBannerDay: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 4 },
  cycleBannerTip: { color: COLORS.textSecondary, fontSize: SIZES.xs, lineHeight: 16 },
  cycleBannerMore: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, textAlign: 'right', marginTop: 4 },

  // Avatar
  avatarCard: { alignItems: 'center', padding: 24, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darkBorder },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.roseGoldMid, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: COLORS.roseGold, fontSize: 36, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.bold },
  clientSplit: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop: 4, marginBottom: 10 },
  statusBadge: { borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, marginBottom: 12 },
  statusText: { fontSize: SIZES.xs, ...FONTS.semibold },
  headerBtns: { flexDirection: 'row', gap: 10 },
  editToggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.darkBorder },
  editToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  deleteBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FF4B4B33' },
  deleteBtnText: { color: COLORS.error, fontSize: SIZES.sm, ...FONTS.medium },

  // Info / edit
  infoCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  sectionLabel: { color: COLORS.textMuted, fontSize: SIZES.xs, ...FONTS.bold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: COLORS.darkBorder },
  infoLabel: { color: COLORS.textSecondary, fontSize: SIZES.md },
  infoValue: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.medium },
  editCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.darkBorder },
  editTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg, marginBottom: 16 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 10 },
  input: { marginBottom: 4, backgroundColor: COLORS.darkCard2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.darkBorder, backgroundColor: COLORS.darkCard },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  chipTextActive: { color: COLORS.white },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },

  // Actions grid
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  actionIcon: { fontSize: 28, marginBottom: 6 },
  actionLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold, textAlign: 'center' },

  // Phase modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: SIZES.xxl, ...FONTS.heavy, marginBottom: 4 },
  modalSub: { color: COLORS.textMuted, fontSize: SIZES.xs, marginBottom: 16 },
  intensityFullBadge: { borderRadius: RADIUS.md, padding: 12, borderWidth: 1, marginBottom: 16 },
  intensityFullLabel: { fontSize: SIZES.md, ...FONTS.bold, marginBottom: 4 },
  intensityFullTip: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  modalDesc: { color: COLORS.textSecondary, fontSize: SIZES.sm, lineHeight: 20, marginBottom: 8, fontStyle: 'italic' },
  modalSection: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md, marginTop: 16, marginBottom: 8 },
  modalItem: { color: COLORS.textSecondary, fontSize: SIZES.sm, lineHeight: 22, marginBottom: 4 },
  modalCloseBtn: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  modalCloseBtnText: { color: COLORS.textSecondary, ...FONTS.semibold },
});