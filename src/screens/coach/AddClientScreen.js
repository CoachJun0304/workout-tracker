import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, SegmentedButtons } from 'react-native-paper';
import { supabase } from '../../lib/supabase';

const SPLITS = ['Push/Pull/Legs','Upper/Lower','Full Body','Bro Split','PHAT','Custom'];
const GOALS  = ['Muscle Gain','Fat Loss','Strength','Athletic','General Fitness'];

export default function AddClientScreen({ navigation }) {
  const [form, setForm] = useState({
    name: '', contact: '', age: '', gender: 'Male',
    weight_kg: '', height_cm: '', goal: '', preferred_split: '',
  });
  const [loading, setLoading] = useState(false);
  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Error', 'Name is required'); return; }
    setLoading(true);
    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      role: 'client',
      contact: form.contact,
      email: form.contact.includes('@') ? form.contact : null,
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      goal: form.goal,
      preferred_split: form.preferred_split,
      status: 'active',
    });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('✅ Client Added!', `${form.name} has been added.`, [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Basic Info</Text>
      <TextInput label="Full Name *" value={form.name} onChangeText={v => update('name', v)} style={styles.input} mode="outlined" />
      <TextInput label="Contact (email or phone)" value={form.contact} onChangeText={v => update('contact', v)} style={styles.input} mode="outlined" />
      <Text style={styles.section}>Physical Stats</Text>
      <TextInput label="Age" value={form.age} onChangeText={v => update('age', v)} style={styles.input} mode="outlined" keyboardType="numeric" />
      <Text style={styles.label}>Gender</Text>
      <SegmentedButtons value={form.gender} onValueChange={v => update('gender', v)}
        buttons={[{ value: 'Male', label: 'Male' },{ value: 'Female', label: 'Female' },{ value: 'Other', label: 'Other' }]}
        style={styles.segmented} />
      <TextInput label="Weight (kg)" value={form.weight_kg} onChangeText={v => update('weight_kg', v)} style={styles.input} mode="outlined" keyboardType="numeric" />
      <TextInput label="Height (cm)" value={form.height_cm} onChangeText={v => update('height_cm', v)} style={styles.input} mode="outlined" keyboardType="numeric" />
      <Text style={styles.section}>Training</Text>
      <Text style={styles.label}>Goal</Text>
      {GOALS.map(g => (
        <Button key={g} mode={form.goal === g ? 'contained' : 'outlined'} compact
          style={styles.chip} onPress={() => update('goal', g)}>{g}</Button>
      ))}
      <Text style={styles.label}>Preferred Split</Text>
      {SPLITS.map(s => (
        <Button key={s} mode={form.preferred_split === s ? 'contained' : 'outlined'} compact
          style={styles.chip} onPress={() => update('preferred_split', s)}>{s}</Button>
      ))}
      <Button mode="contained" onPress={handleSave} loading={loading}
        style={styles.saveBtn} contentStyle={{ paddingVertical: 6 }}>
        Add Client
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 40 },
  section: { color: '#6C63FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  label: { color: '#888', fontSize: 13, marginBottom: 8, marginTop: 4 },
  input: { marginBottom: 12, backgroundColor: '#1a1a1a' },
  segmented: { marginBottom: 12 },
  chip: { marginBottom: 8, borderRadius: 8 },
  saveBtn: { marginTop: 24, borderRadius: 8 },
});