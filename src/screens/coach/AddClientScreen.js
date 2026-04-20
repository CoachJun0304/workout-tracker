import { showAlert, showConfirm } from '../../utils/webAlert';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const SPLITS = ['Push/Pull/Legs','Upper/Lower','Full Body','Bro Split','PHAT','Custom'];
const GOALS  = ['Muscle Gain','Fat Loss','Strength','Athletic','General Fitness'];
const GENDERS = ['Male','Female','Other'];

export default function AddClientScreen({ navigation }) {
  const [form, setForm] = useState({
    name: '', contact: '', age: '', gender: 'Male',
    weight_kg: '', height_cm: '', goal: '', preferred_split: '',
  });
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showAlert('Error', 'Client name is required');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name: form.name.trim(),
          role: 'client',
          contact: form.contact.trim(),
          email: form.contact.includes('@') ? form.contact.trim() : null,
          age: form.age ? parseInt(form.age) : null,
          gender: form.gender,
          weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
          height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
          goal: form.goal,
          preferred_split: form.preferred_split,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        showAlert('Error', error.message);
      } else {
        showAlert('✅ Client Added!',
          `${form.name} has been added successfully.`, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (e) {
      showAlert('Error', e.message);
    }
    setLoading(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.section}>Basic Info</Text>
      <TextInput label="Full Name *" value={form.name}
        onChangeText={v => update('name', v)} style={styles.input} mode="outlined"
        outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white} />
      <TextInput label="Contact (email or phone)" value={form.contact}
        onChangeText={v => update('contact', v)} style={styles.input} mode="outlined"
        outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white} />

      <Text style={styles.section}>Physical Stats</Text>
      <TextInput label="Age" value={form.age}
        onChangeText={v => update('age', v)} style={styles.input} mode="outlined"
        keyboardType="numeric"
        outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white} />

      <Text style={styles.label}>Gender</Text>
      <View style={styles.chipRow}>
        {GENDERS.map(g => (
          <TouchableOpacity key={g}
            style={[styles.chip, form.gender === g && styles.chipActive]}
            onPress={() => update('gender', g)}>
            <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>
              {g}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput label="Weight (kg)" value={form.weight_kg}
        onChangeText={v => update('weight_kg', v)} style={styles.input} mode="outlined"
        keyboardType="numeric"
        outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white} />
      <TextInput label="Height (cm)" value={form.height_cm}
        onChangeText={v => update('height_cm', v)} style={styles.input} mode="outlined"
        keyboardType="numeric"
        outlineColor={COLORS.darkBorder2} activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white} />

      <Text style={styles.section}>Training</Text>
      <Text style={styles.label}>Goal</Text>
      <View style={styles.chipRow}>
        {GOALS.map(g => (
          <TouchableOpacity key={g}
            style={[styles.chip, form.goal === g && styles.chipActive]}
            onPress={() => update('goal', g)}>
            <Text style={[styles.chipText, form.goal === g && styles.chipTextActive]}>
              {g}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Preferred Split</Text>
      <View style={styles.chipRow}>
        {SPLITS.map(s => (
          <TouchableOpacity key={s}
            style={[styles.chip, form.preferred_split === s && styles.chipActive]}
            onPress={() => update('preferred_split', s)}>
            <Text style={[styles.chipText, form.preferred_split === s && styles.chipTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, loading && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={loading}>
        <Text style={styles.saveBtnText}>
          {loading ? 'Adding Client...' : 'Add Client'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const { View } = require('react-native');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 20, paddingBottom: 40 },
  section: {
    color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.bold,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: 20, marginBottom: 10,
  },
  label: {
    color: COLORS.textSecondary, fontSize: SIZES.sm,
    marginBottom: 8, marginTop: 4,
  },
  input: { marginBottom: 12, backgroundColor: COLORS.darkCard2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full, borderWidth: 1,
    borderColor: COLORS.darkBorder2, backgroundColor: COLORS.darkCard,
  },
  chipActive: {
    backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold,
  },
  chipText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  chipTextActive: { color: COLORS.white },
  saveBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
    shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
});