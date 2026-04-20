import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput as RNTextInput, Platform
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const GENDERS = ['Male', 'Female', 'Other'];
const GOALS = ['Muscle Gain', 'Fat Loss', 'Strength', 'Athletic', 'General Fitness'];

export default function ClientProfileScreen() {
  const { profile, signOut, updateUnitPreference, unit, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: profile?.name || '',
    age: profile?.age ? String(profile.age) : '',
    gender: profile?.gender || 'Male',
    weight_kg: profile?.weight_kg ? String(profile.weight_kg) : '',
    height_cm: profile?.height_cm ? String(profile.height_cm) : '',
    goal: profile?.goal || '',
    contact: profile?.contact || '',
  });
  const [loading, setLoading] = useState(false);
  const [waterToday, setWaterToday] = useState(0);
  const [showMeasureModal, setShowMeasureModal] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [measureForm, setMeasureForm] = useState({
    waist_cm:'', hips_cm:'', chest_cm:'',
    left_arm_cm:'', right_arm_cm:'', notes:''
  });
  const [coachInfo, setCoachInfo] = useState(null);
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (profile) {
      fetchWater();
      fetchMeasurements();
      fetchCoach();
    }
  }, [profile]);

  async function fetchWater() {
    const { data } = await supabase.from('water_logs')
      .select('amount_ml').eq('client_id', profile.id)
      .eq('date', todayStr).single();
    setWaterToday(data?.amount_ml || 0);
  }

  async function fetchMeasurements() {
    const { data } = await supabase.from('body_measurements')
      .select('*').eq('client_id', profile.id)
      .order('date', { ascending: false }).limit(5);
    setMeasurements(data || []);
  }

  async function fetchCoach() {
    if (!profile?.coach_id) return;
    const { data } = await supabase.from('profiles')
      .select('name, email, contact').eq('id', profile.coach_id).single();
    setCoachInfo(data);
  }

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSave() {
    setLoading(true);
    const idField = profile?.auth_id ? 'auth_id' : 'id';
    const idValue = profile?.auth_id || profile?.id;
    const { error } = await supabase.from('profiles').update({
      name: form.name.trim(),
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      goal: form.goal,
      contact: form.contact.trim(),
    }).eq(idField, idValue);
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    await refreshProfile();
    setEditing(false);
    Alert.alert('✅ Profile Updated!');
  }

  async function logWater(ml) {
    const newAmount = Math.max(0, waterToday + ml);
    await supabase.from('water_logs').upsert({
      client_id: profile.id,
      date: todayStr,
      amount_ml: newAmount,
    }, { onConflict: 'client_id,date' });
    setWaterToday(newAmount);
  }

  async function saveMeasurements() {
    setLoading(true);
    await supabase.from('body_measurements').insert({
      client_id: profile.id,
      logged_by: profile.id,
      date: todayStr,
      waist_cm: parseFloat(measureForm.waist_cm) || null,
      hips_cm: parseFloat(measureForm.hips_cm) || null,
      chest_cm: parseFloat(measureForm.chest_cm) || null,
      left_arm_cm: parseFloat(measureForm.left_arm_cm) || null,
      right_arm_cm: parseFloat(measureForm.right_arm_cm) || null,
      notes: measureForm.notes || null,
    });
    setLoading(false);
    setShowMeasureModal(false);
    setMeasureForm({ waist_cm:'', hips_cm:'', chest_cm:'', left_arm_cm:'', right_arm_cm:'', notes:'' });
    fetchMeasurements();
    Alert.alert('✅ Measurements saved!');
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
        <Text style={styles.clientGoal}>{form.goal || 'No goal set'}</Text>
        {coachInfo && (
          <View style={styles.coachBadge}>
            <Text style={styles.coachBadgeText}>🏋️ Coach: {coachInfo.name}</Text>
          </View>
        )}
        <View style={styles.avatarBtns}>
          <TouchableOpacity style={styles.editToggleBtn}
            onPress={() => setEditing(!editing)}>
            <Text style={styles.editToggleBtnText}>
              {editing ? '✕ Cancel' : '✏️ Edit Profile'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unit preference */}
      <View style={styles.unitCard}>
        <Text style={styles.unitLabel}>Weight Unit</Text>
        <View style={styles.unitToggle}>
          <TouchableOpacity
            style={[styles.unitBtn, unit==='kg' && styles.unitBtnActive]}
            onPress={() => updateUnitPreference('kg')}>
            <Text style={[styles.unitBtnText, unit==='kg' && styles.unitBtnTextActive]}>kg</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitBtn, unit==='lbs' && styles.unitBtnActive]}
            onPress={() => updateUnitPreference('lbs')}>
            <Text style={[styles.unitBtnText, unit==='lbs' && styles.unitBtnTextActive]}>lbs</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.unitHint}>
          All weights in progress and logs will auto-convert
        </Text>
      </View>

      {/* Water tracker */}
      <View style={styles.waterCard}>
        <View style={styles.waterHeader}>
          <Text style={styles.waterTitle}>💧 Water Today</Text>
          <Text style={styles.waterAmount}>{(waterToday/1000).toFixed(1)}L</Text>
        </View>
        <View style={styles.waterBtns}>
          {[250, 500, 750].map(ml => (
            <TouchableOpacity key={ml} style={styles.waterBtn} onPress={() => logWater(ml)}>
              <Text style={styles.waterBtnText}>+{ml}ml</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.waterBtn, { borderColor: COLORS.error }]}
            onPress={() => logWater(-250)}>
            <Text style={[styles.waterBtnText, { color: COLORS.error }]}>-250ml</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.waterProgress}>
          <View style={[styles.waterFill, { width: `${Math.min((waterToday/2000)*100, 100)}%` }]} />
        </View>
        <Text style={styles.waterGoal}>Goal: 2000ml / {Math.round((waterToday/2000)*100)}% reached</Text>
      </View>

      {editing ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Edit Your Profile</Text>
          {[
            { label:'Full Name', field:'name', type:'default' },
            { label:'Age', field:'age', type:'numeric' },
            { label:'Weight (kg)', field:'weight_kg', type:'numeric' },
            { label:'Height (cm)', field:'height_cm', type:'numeric' },
            { label:'Contact', field:'contact', type:'email-address' },
          ].map(f => (
            <View key={f.field}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput value={form[f.field]} onChangeText={v => update(f.field, v)}
                style={styles.input} mode="outlined" keyboardType={f.type}
                outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white} />
            </View>
          ))}

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

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity:0.6 }]}
            onPress={handleSave} disabled={loading}>
            <Text style={styles.saveBtnText}>{loading?'Saving...':'✅ Save Profile'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>My Profile</Text>
          <InfoRow label="Age" value={form.age} />
          <InfoRow label="Gender" value={form.gender} />
          <InfoRow label="Weight" value={form.weight_kg?`${form.weight_kg} kg`:null} />
          <InfoRow label="Height" value={form.height_cm?`${form.height_cm} cm`:null} />
          <InfoRow label="Goal" value={form.goal} />
          <InfoRow label="Contact" value={form.contact} />
        </View>
      )}

      {/* Body measurements */}
      <View style={styles.measureCard}>
        <View style={styles.measureHeader}>
          <Text style={styles.measureTitle}>📏 Body Measurements</Text>
          <TouchableOpacity style={styles.measureAddBtn}
            onPress={() => setShowMeasureModal(true)}>
            <Text style={styles.measureAddBtnText}>+ Log</Text>
          </TouchableOpacity>
        </View>
        {measurements.length === 0
          ? <Text style={styles.noMeasure}>No measurements logged yet</Text>
          : measurements.map((m, i) => (
            <View key={i} style={styles.measureRow}>
              <Text style={styles.measureDate}>{m.date}</Text>
              <View style={styles.measureValues}>
                {m.waist_cm && <Text style={styles.measureVal}>Waist: {m.waist_cm}cm</Text>}
                {m.chest_cm && <Text style={styles.measureVal}>Chest: {m.chest_cm}cm</Text>}
                {m.hips_cm && <Text style={styles.measureVal}>Hips: {m.hips_cm}cm</Text>}
                {m.left_arm_cm && <Text style={styles.measureVal}>L.Arm: {m.left_arm_cm}cm</Text>}
                {m.right_arm_cm && <Text style={styles.measureVal}>R.Arm: {m.right_arm_cm}cm</Text>}
              </View>
            </View>
          ))
        }
      </View>

      {form.gender !== 'Female' && (
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>
            💡 If you are female, update your gender above to unlock the 🌸 Cycle Tracker in the Health tab.
          </Text>
        </View>
      )}

      {/* Measurement modal */}
      <Modal visible={showMeasureModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>📏 Log Measurements</Text>
              {[
                { label:'Waist (cm)', field:'waist_cm' },
                { label:'Chest (cm)', field:'chest_cm' },
                { label:'Hips (cm)', field:'hips_cm' },
                { label:'Left Arm (cm)', field:'left_arm_cm' },
                { label:'Right Arm (cm)', field:'right_arm_cm' },
              ].map(f => (
                <View key={f.field}>
                  <Text style={styles.modalLabel}>{f.label}</Text>
                  <RNTextInput value={measureForm[f.field]}
                    onChangeText={v => setMeasureForm(m=>({...m,[f.field]:v}))}
                    style={styles.modalInput} placeholder="0"
                    placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
                </View>
              ))}
              <Text style={styles.modalLabel}>Notes</Text>
              <RNTextInput value={measureForm.notes}
                onChangeText={v => setMeasureForm(m=>({...m,notes:v}))}
                style={styles.modalInput} placeholder="Optional notes..."
                placeholderTextColor={COLORS.textMuted} />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn}
                  onPress={() => setShowMeasureModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn}
                  onPress={saveMeasurements} disabled={loading}>
                  <Text style={styles.modalSaveText}>{loading?'...':'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  content: { padding:16, paddingBottom:40, paddingTop:60 },
  avatarCard: { alignItems:'center', padding:24, borderRadius: RADIUS.lg, backgroundColor: COLORS.darkCard, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  avatar: { width:80, height:80, borderRadius:40, backgroundColor: COLORS.roseGoldMid, justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarText: { color: COLORS.roseGold, fontSize:36, ...FONTS.bold },
  clientName: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.bold },
  clientGoal: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop:4 },
  coachBadge: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.full, paddingHorizontal:12, paddingVertical:4, marginTop:8, borderWidth:1, borderColor: COLORS.roseGoldMid },
  coachBadgeText: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold },
  avatarBtns: { flexDirection:'row', gap:10, marginTop:16 },
  editToggleBtn: { paddingHorizontal:16, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder },
  editToggleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  signOutBtn: { paddingHorizontal:16, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor:'#FF4B4B33' },
  signOutText: { color: COLORS.error, fontSize: SIZES.sm, ...FONTS.medium },
  unitCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  unitLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
  unitToggle: { flexDirection:'row', backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.full, padding:3, marginBottom:8 },
  unitBtn: { flex:1, paddingVertical:10, borderRadius: RADIUS.full, alignItems:'center' },
  unitBtnActive: { backgroundColor: COLORS.roseGold },
  unitBtnText: { color: COLORS.textSecondary, ...FONTS.bold, fontSize: SIZES.md },
  unitBtnTextActive: { color: COLORS.white },
  unitHint: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign:'center' },
  waterCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  waterHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  waterTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  waterAmount: { color:'#60A5FA', ...FONTS.bold, fontSize: SIZES.xl },
  waterBtns: { flexDirection:'row', gap:8, marginBottom:10, flexWrap:'wrap' },
  waterBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor:'#60A5FA', backgroundColor:'#60A5FA22' },
  waterBtnText: { color:'#60A5FA', ...FONTS.semibold, fontSize: SIZES.xs },
  waterProgress: { height:6, backgroundColor: COLORS.darkCard2, borderRadius:3, marginBottom:6 },
  waterFill: { height:6, backgroundColor:'#60A5FA', borderRadius:3 },
  waterGoal: { color: COLORS.textMuted, fontSize: SIZES.xs },
  infoCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  infoCardTitle: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  infoRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:0.5, borderBottomColor: COLORS.darkBorder },
  infoLabel: { color: COLORS.textMuted, fontSize: SIZES.md },
  infoValue: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.medium },
  editCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.darkBorder },
  editTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg, marginBottom:16 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:8 },
  input: { marginBottom:8, backgroundColor: COLORS.darkCard2 },
  chipRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:8 },
  chip: { paddingHorizontal:14, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder, backgroundColor: COLORS.darkCard },
  chipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.sm },
  chipTextActive: { color: COLORS.white },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:14, alignItems:'center', marginTop:16, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  measureCard: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, marginBottom:12, borderWidth:1, borderColor: COLORS.darkBorder },
  measureHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  measureTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  measureAddBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingHorizontal:14, paddingVertical:6 },
  measureAddBtnText: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.sm },
  noMeasure: { color: COLORS.textMuted, fontSize: SIZES.sm },
  measureRow: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:10, marginBottom:6 },
  measureDate: { color: COLORS.roseGold, fontSize: SIZES.xs, ...FONTS.semibold, marginBottom:4 },
  measureValues: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  measureVal: { color: COLORS.textSecondary, fontSize: SIZES.xs },
  tipCard: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, padding:14, borderWidth:1, borderColor: COLORS.roseGoldMid, marginBottom:12 },
  tipText: { color: COLORS.roseGold, fontSize: SIZES.sm, lineHeight:20 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'flex-end' },
  modalCard: { backgroundColor: COLORS.darkCard, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  modalTitle: { color: COLORS.white, ...FONTS.heavy, fontSize: SIZES.xl, marginBottom:16 },
  modalLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, marginTop:4 },
  modalInput: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding:12, color: COLORS.white, fontSize: SIZES.md, borderWidth:1, borderColor: COLORS.darkBorder2, marginBottom:8 },
  modalBtns: { flexDirection:'row', gap:12, marginTop:8 },
  modalCancelBtn: { flex:1, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard2, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  modalCancelText: { color: COLORS.textSecondary, ...FONTS.semibold },
  modalSaveBtn: { flex:2, paddingVertical:14, borderRadius: RADIUS.full, backgroundColor: COLORS.roseGold, alignItems:'center' },
  modalSaveText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
});