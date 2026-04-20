import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const SPLITS = ['Push/Pull/Legs','Upper/Lower','Full Body','Bro Split','PHAT','Custom'];
const GOALS = ['Muscle Gain','Fat Loss','Strength','Athletic','General Fitness'];
const GENDERS = ['Male','Female','Other'];

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params;
  const [editing, setEditing] = useState(false);
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
  const [loading, setLoading] = useState(false);

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

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
    if (error) { Alert.alert('Error', error.message); return; }
    setEditing(false);
    Alert.alert('✅ Updated!', `${form.name}'s profile has been updated.`);
  }

  const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
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
        <Text style={styles.clientSplit}>{form.preferred_split || 'No split assigned'}</Text>
        <TouchableOpacity style={styles.editToggleBtn} onPress={() => setEditing(!editing)}>
          <Text style={styles.editToggleBtnText}>{editing ? '✕ Cancel Edit' : '✏️ Edit Profile'}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        /* ── EDIT MODE ── */
        <View style={styles.editCard}>
          <Text style={styles.editCardTitle}>Edit Client Profile</Text>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput value={form.name} onChangeText={v => update('name', v)}
            style={styles.input} mode="outlined"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Contact</Text>
          <TextInput value={form.contact} onChangeText={v => update('contact', v)}
            style={styles.input} mode="outlined"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput value={form.age} onChangeText={v => update('age', v)}
            style={styles.input} mode="outlined" keyboardType="numeric"
            outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white} />

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.chipRow}>
            {GENDERS.map(g => (
              <TouchableOpacity key={g}
                style={[styles.chip, form.gender===g && styles.chipActive]}
                onPress={() => update('gender', g)}>
                <Text style={[styles.chipText, form.gender===g && styles.chipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

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

          <Text style={styles.fieldLabel}>Goal</Text>
          <View style={styles.chipRow}>
            {GOALS.map(g => (
              <TouchableOpacity key={g}
                style={[styles.chip, form.goal===g && styles.chipActive]}
                onPress={() => update('goal', g)}>
                <Text style={[styles.chipText, form.goal===g && styles.chipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Preferred Split</Text>
          <View style={styles.chipRow}>
            {SPLITS.map(s => (
              <TouchableOpacity key={s}
                style={[styles.chip, form.preferred_split===s && styles.chipActive]}
                onPress={() => update('preferred_split', s)}>
                <Text style={[styles.chipText, form.preferred_split===s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[styles.saveBtn, loading && { opacity:0.6 }]}
            onPress={handleSave} disabled={loading}>
            <Text style={styles.saveBtnText}>{loading ? 'Saving...' : '✅ Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── VIEW MODE ── */
        <View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Personal Info</Text>
            <InfoRow label="Age" value={client.age} />
            <InfoRow label="Gender" value={form.gender} />
            <InfoRow label="Weight" value={form.weight_kg ? `${form.weight_kg} kg` : null} />
            <InfoRow label="Height" value={form.height_cm ? `${form.height_cm} cm` : null} />
            <InfoRow label="Goal" value={form.goal} />
            <InfoRow label="Contact" value={form.contact} />
            <InfoRow label="Status" value={client.status} />
          </View>

          <Text style={styles.actionsTitle}>Actions</Text>
          <TouchableOpacity style={styles.actionBtn}
            onPress={() => navigation.navigate('LogWorkout', { client })}>
            <Text style={styles.actionBtnEmoji}>🏋️</Text>
            <Text style={styles.actionBtnText}>Log Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: '#00B894' }]}
            onPress={() => navigation.navigate('Progress', { client })}>
            <Text style={styles.actionBtnEmoji}>📈</Text>
            <Text style={styles.actionBtnText}>View Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: '#FDCB6E' }]}
            onPress={() => navigation.navigate('Records', { client })}>
            <Text style={styles.actionBtnEmoji}>🏆</Text>
            <Text style={styles.actionBtnText}>Personal Records</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: COLORS.roseGold }]}
            onPress={() => navigation.navigate('AssignProgram', { client })}>
            <Text style={styles.actionBtnEmoji}>📋</Text>
            <Text style={styles.actionBtnText}>Assign Program</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: '#A78BFA' }]}
            onPress={() => navigation.navigate('CoachHealth', { client })}>
            <Text style={styles.actionBtnEmoji}>🥗</Text>
            <Text style={styles.actionBtnText}>Health & Nutrition</Text>
          </TouchableOpacity>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  content: { padding:16, paddingBottom:40 },
  avatarCard: { alignItems:'center', padding:24, borderRadius: RADIUS.lg, backgroundColor: COLORS.darkCard, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  avatar: { width:80, height:80, borderRadius:40, backgroundColor: COLORS.roseGoldMid, justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarText: { color: COLORS.roseGold, fontSize:36, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.bold },
  clientSplit: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop:4, marginBottom:16 },
  editToggleBtn: { paddingHorizontal:20, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder },
  editToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  infoCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  infoCardTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  infoRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:0.5, borderBottomColor: COLORS.darkBorder },
  infoLabel: { color: COLORS.textMuted, fontSize: SIZES.md },
  infoValue: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.medium },
  actionsTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  actionBtn: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:16, marginBottom:10, borderWidth:1, borderColor: COLORS.darkBorder },
  actionBtnEmoji: { fontSize:22 },
  actionBtnText: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.semibold },
  editCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, borderWidth:1, borderColor: COLORS.darkBorder },
  editCardTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg, marginBottom:16 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:8 },
  input: { marginBottom:8, backgroundColor: COLORS.darkCard2 },
  chipRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:8 },
  chip: { paddingHorizontal:14, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder, backgroundColor: COLORS.darkCard },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginTop:16, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
});