import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Platform
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';
import { showAlert, showConfirm } from '../../utils/webAlert';

const SPLITS = ['Push/Pull/Legs','Upper/Lower','Full Body','Bro Split','PHAT','Custom'];
const GOALS = ['Muscle Gain','Fat Loss','Strength','Athletic','General Fitness'];
const GENDERS = ['Male','Female','Other'];

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params || {};
  if (!client) return null;

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
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
      `Remove ${client.name} from your client list? They can still log in but won't appear in your dashboard.`,
      async () => {
        await supabase.from('profiles').update({ status: 'inactive' }).eq('id', client.id);
        navigation.goBack();
      },
      null, 'Remove', true
    );
  }

  const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );

  const ChipRow = ({ options, value, field }) => (
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar */}
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
            : { backgroundColor: '#00C89622', borderColor: COLORS.success }
        ]}>
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

      {/* Edit Form */}
      {editing ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Edit Client Profile</Text>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput value={form.name} onChangeText={v => update('name', v)}
            style={styles.input} mode="outlined"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Contact / Phone</Text>
          <TextInput value={form.contact} onChangeText={v => update('contact', v)}
            style={styles.input} mode="outlined"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput value={form.age} onChangeText={v => update('age', v)}
            style={styles.input} mode="outlined" keyboardType="numeric"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Weight (kg)</Text>
          <TextInput value={form.weight_kg} onChangeText={v => update('weight_kg', v)}
            style={styles.input} mode="outlined" keyboardType="numeric"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Height (cm)</Text>
          <TextInput value={form.height_cm} onChangeText={v => update('height_cm', v)}
            style={styles.input} mode="outlined" keyboardType="numeric"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Gender</Text>
          <ChipRow options={GENDERS} value={form.gender} field="gender" />

          <Text style={styles.fieldLabel}>Goal</Text>
          <ChipRow options={GOALS} value={form.goal} field="goal" />

          <Text style={styles.fieldLabel}>Preferred Split</Text>
          <ChipRow options={SPLITS} value={form.preferred_split} field="preferred_split" />

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

      {/* Action Buttons */}
      <Text style={styles.sectionLabel}>Actions</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity style={styles.actionBtn}
        onPress={() => navigation.navigate('ClientReport', { client })}>
        <Text style={styles.actionIcon}>📊</Text>
        <Text style={styles.actionLabel}>Workout Report</Text>
      </TouchableOpacity>
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

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 16, paddingBottom: 40 },
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
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47%', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.darkBorder },
  actionIcon: { fontSize: 28, marginBottom: 6 },
  actionLabel: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.semibold, textAlign: 'center' },
});