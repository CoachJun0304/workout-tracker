import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Alert
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function WorkoutRescheduleScreen({ route, navigation }) {
  const { program, currentDay, currentDate } = route.params;
  const { profile } = useAuth();
  const [status, setStatus] = useState('missed'); // 'missed' | 'moved'
  const [rescheduleDay, setRescheduleDay] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [scheduleChanges, setScheduleChanges] = useState([]);

  useEffect(() => { fetchChanges(); }, []);

  async function fetchChanges() {
    const { data } = await supabase
      .from('workout_schedule_changes')
      .select('*')
      .eq('client_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setScheduleChanges(data || []);
  }

  async function handleSave() {
    setLoading(true);
    const { error } = await supabase.from('workout_schedule_changes').insert({
      client_id: profile.id,
      original_date: currentDate || new Date().toISOString().split('T')[0],
      original_day: currentDay,
      status: status,
      rescheduled_date: status === 'moved' ? rescheduleDate : null,
      rescheduled_day: status === 'moved' ? rescheduleDay : null,
      template_id: program?.template_id || null,
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }

    if (status === 'moved' && rescheduleDay) {
      Alert.alert('✅ Workout Moved!',
        `${currentDay}'s workout has been moved to ${rescheduleDay} (${rescheduleDate || 'date TBD'}).\n\nThe exercises remain the same.`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } else {
      Alert.alert('✅ Marked as Missed',
        `${currentDay}'s workout has been marked as missed.`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    }
  }

  async function deleteChange(id) {
    Alert.alert('Delete', 'Remove this record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('workout_schedule_changes').delete().eq('id', id);
        fetchChanges();
      }}
    ]);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Workout Schedule Change</Text>
        <Text style={styles.headerSub}>
          Original: {currentDay} {currentDate ? `(${currentDate})` : ''}
        </Text>
      </View>

      {/* Status toggle */}
      <Text style={styles.sectionLabel}>What happened?</Text>
      <View style={styles.statusRow}>
        <TouchableOpacity
          style={[styles.statusBtn, status === 'missed' && styles.statusBtnActive]}
          onPress={() => setStatus('missed')}>
          <Text style={styles.statusBtnEmoji}>😔</Text>
          <Text style={[styles.statusBtnText, status==='missed' && styles.statusBtnTextActive]}>
            Missed
          </Text>
          <Text style={styles.statusBtnSub}>Skipped this workout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusBtn, status === 'moved' && styles.statusBtnActive]}
          onPress={() => setStatus('moved')}>
          <Text style={styles.statusBtnEmoji}>📅</Text>
          <Text style={[styles.statusBtnText, status==='moved' && styles.statusBtnTextActive]}>
            Moved
          </Text>
          <Text style={styles.statusBtnSub}>Doing it another day</Text>
        </TouchableOpacity>
      </View>

      {/* If moved — pick new day */}
      {status === 'moved' && (
        <View>
          <Text style={styles.sectionLabel}>Move to which day?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysRow}>
            {DAYS.map(d => (
              <TouchableOpacity key={d}
                style={[styles.dayChip, rescheduleDay===d && styles.dayChipActive]}
                onPress={() => setRescheduleDay(d)}>
                <Text style={[styles.dayChipText, rescheduleDay===d && styles.dayChipTextActive]}>
                  {d.slice(0,3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={rescheduleDate}
            onChangeText={setRescheduleDate}
            style={styles.input}
            mode="outlined"
            placeholder="e.g. 2025-04-21"
            placeholderTextColor={COLORS.textMuted}
            outlineColor={COLORS.darkBorder2}
            activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white}
          />

          {rescheduleDay && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                ℹ️ The exercises from {currentDay} will remain the same on {rescheduleDay}.
                Log your sets as usual when you do the workout.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Notes */}
      <Text style={styles.sectionLabel}>Notes (optional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        style={styles.input}
        mode="outlined"
        placeholder="e.g. Had work emergency, will do Monday's workout on Wednesday"
        placeholderTextColor={COLORS.textMuted}
        outlineColor={COLORS.darkBorder2}
        activeOutlineColor={COLORS.roseGold}
        textColor={COLORS.white}
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        <Text style={styles.saveBtnText}>
          {loading ? 'Saving...' : status === 'moved' ? '📅 Confirm Move' : '📌 Mark as Missed'}
        </Text>
      </TouchableOpacity>

      {/* History */}
      {scheduleChanges.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Schedule Change History</Text>
          {scheduleChanges.map(change => (
            <View key={change.id} style={[styles.changeRow, {
              borderLeftColor: change.status === 'moved' ? COLORS.roseGold : COLORS.error,
            }]}>
              <View style={{ flex:1 }}>
                <Text style={styles.changeTitle}>
                  {change.status === 'moved' ? '📅 Moved' : '😔 Missed'} — {change.original_day}
                </Text>
                <Text style={styles.changeDate}>{change.original_date}</Text>
                {change.status === 'moved' && change.rescheduled_day && (
                  <Text style={styles.changeMoved}>
                    → Moved to {change.rescheduled_day}
                    {change.rescheduled_date ? ` (${change.rescheduled_date})` : ''}
                  </Text>
                )}
                {change.notes && <Text style={styles.changeNotes}>{change.notes}</Text>}
              </View>
              <TouchableOpacity onPress={() => deleteChange(change.id)}>
                <Text style={{ fontSize:16 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.darkBg },
  content: { padding:16, paddingBottom:40 },
  headerCard: { backgroundColor: COLORS.roseGoldDark, borderRadius: RADIUS.lg, padding:16, marginBottom:20 },
  headerTitle: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.xl },
  headerSub: { color:'rgba(255,255,255,0.7)', fontSize: SIZES.sm, marginTop:4 },
  sectionLabel: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.bold, textTransform:'uppercase', letterSpacing:1, marginBottom:10, marginTop:16 },
  statusRow: { flexDirection:'row', gap:12, marginBottom:8 },
  statusBtn: { flex:1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, padding:16, alignItems:'center', borderWidth:1, borderColor: COLORS.darkBorder },
  statusBtnActive: { borderColor: COLORS.roseGold, backgroundColor: COLORS.roseGoldFaint },
  statusBtnEmoji: { fontSize:28, marginBottom:6 },
  statusBtnText: { color: COLORS.textSecondary, ...FONTS.bold, fontSize: SIZES.md, marginBottom:2 },
  statusBtnTextActive: { color: COLORS.roseGold },
  statusBtnSub: { color: COLORS.textMuted, fontSize: SIZES.xs, textAlign:'center' },
  daysRow: { marginBottom:8 },
  dayChip: { paddingHorizontal:16, paddingVertical:8, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, marginRight:8, borderWidth:1, borderColor: COLORS.darkBorder },
  dayChipActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  dayChipText: { color: COLORS.textSecondary, ...FONTS.semibold, fontSize: SIZES.sm },
  dayChipTextActive: { color: COLORS.white },
  input: { marginBottom:8, backgroundColor: COLORS.darkCard2 },
  infoBox: { backgroundColor: COLORS.roseGoldFaint, borderRadius: RADIUS.md, padding:12, borderWidth:1, borderColor: COLORS.roseGoldMid, marginBottom:8 },
  infoText: { color: COLORS.roseGold, fontSize: SIZES.sm },
  saveBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical:16, alignItems:'center', marginTop:16, shadowColor: COLORS.roseGold, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:6 },
  saveBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  changeRow: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md, padding:14, marginBottom:8, borderWidth:1, borderColor: COLORS.darkBorder, borderLeftWidth:3, flexDirection:'row', alignItems:'flex-start' },
  changeTitle: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  changeDate: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop:2 },
  changeMoved: { color: COLORS.roseGold, fontSize: SIZES.sm, marginTop:4 },
   changeNotes: { color: COLORS.textSecondary, fontSize: SIZES.xs, marginTop:4, fontStyle:'italic' },
  rescheduleBtn: { marginTop:10, paddingVertical:8, borderRadius: RADIUS.full, borderWidth:1, borderColor: COLORS.darkBorder, alignItems:'center' },
  rescheduleBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium }, 
});