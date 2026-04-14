import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function ClientWorkoutScreen({ route, navigation }) {
  const { exercises, day, program } = route.params;
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = exercises[currentIdx];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, {
          width: `${((currentIdx + 1) / exercises.length) * 100}%`
        }]} />
      </View>
      <Text style={styles.progressText}>
        Exercise {currentIdx + 1} of {exercises.length}
      </Text>

      {/* Current exercise */}
      <View style={styles.exerciseCard}>
        <View style={styles.muscleTag}>
          <Text style={styles.muscleTagText}>{current.muscle_group}</Text>
        </View>
        <Text style={styles.exerciseName}>{current.exercise_name}</Text>
        <View style={styles.setsRow}>
          <View style={styles.setInfo}>
            <Text style={styles.setInfoNum}>{current.warmup_sets}</Text>
            <Text style={styles.setInfoLabel}>Warm-up Sets</Text>
          </View>
          <View style={styles.setDivider} />
          <View style={styles.setInfo}>
            <Text style={styles.setInfoNum}>{current.working_sets}</Text>
            <Text style={styles.setInfoLabel}>Working Sets</Text>
          </View>
          <View style={styles.setDivider} />
          <View style={styles.setInfo}>
            <Text style={styles.setInfoNum}>{current.reps}</Text>
            <Text style={styles.setInfoLabel}>Reps</Text>
          </View>
        </View>
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentIdx === 0 && styles.navBtnDisabled]}
          onPress={() => setCurrentIdx(i => Math.max(0, i - 1))}
          disabled={currentIdx === 0}>
          <Text style={styles.navBtnText}>‹ Previous</Text>
        </TouchableOpacity>
        {currentIdx < exercises.length - 1
          ? <TouchableOpacity style={styles.nextBtn}
              onPress={() => setCurrentIdx(i => i + 1)}>
              <Text style={styles.nextBtnText}>Next ›</Text>
            </TouchableOpacity>
          : <TouchableOpacity style={styles.nextBtn}
              onPress={() => navigation.navigate('ClientLog', { exercises, day })}>
              <Text style={styles.nextBtnText}>Log Workout ›</Text>
            </TouchableOpacity>
        }
      </View>

      {/* All exercises list */}
      <Text style={styles.allTitle}>All Exercises</Text>
      {exercises.map((ex, i) => (
        <TouchableOpacity key={i}
          style={[styles.listItem, i === currentIdx && styles.listItemActive]}
          onPress={() => setCurrentIdx(i)}>
          <View style={[styles.listNum, i === currentIdx && styles.listNumActive]}>
            <Text style={styles.listNumText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.listName}>{ex.exercise_name}</Text>
            <Text style={styles.listMeta}>
              {ex.working_sets} sets × {ex.reps} reps · {ex.muscle_group}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.logBtn}
        onPress={() => navigation.navigate('ClientLog', { exercises, day })}>
        <Text style={styles.logBtnText}>📝 Log This Workout</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  content: { padding: 20, paddingBottom: 40 },
  progressBar: {
    height: 4, backgroundColor: COLORS.darkCard2,
    borderRadius: 2, marginBottom: 8,
  },
  progressFill: {
    height: 4, backgroundColor: COLORS.roseGold, borderRadius: 2,
  },
  progressText: { color: COLORS.textMuted, fontSize: SIZES.sm, marginBottom: 20 },
  exerciseCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl,
    padding: 24, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.roseGoldMid,
  },
  muscleTag: {
    backgroundColor: COLORS.roseGoldFaint,
    borderRadius: RADIUS.full, paddingHorizontal: 12,
    paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.roseGoldMid,
  },
  muscleTagText: { color: COLORS.roseGold, fontSize: SIZES.sm, ...FONTS.semibold },
  exerciseName: {
    fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 20,
  },
  setsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  setInfo: { alignItems: 'center' },
  setInfoNum: { fontSize: SIZES.xxl, ...FONTS.bold, color: COLORS.roseGold },
  setInfoLabel: { fontSize: SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  setDivider: { width: 1, backgroundColor: COLORS.darkBorder },
  navRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  navBtn: {
    flex: 1, backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: COLORS.white, ...FONTS.semibold },
  nextBtn: {
    flex: 2, backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 14, alignItems: 'center',
  },
  nextBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  allTitle: {
    fontSize: SIZES.md, ...FONTS.bold, color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.md,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  listItemActive: { borderColor: COLORS.roseGold },
  listNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.darkCard2,
    justifyContent: 'center', alignItems: 'center',
  },
  listNumActive: { backgroundColor: COLORS.roseGold },
  listNumText: { color: COLORS.white, fontSize: SIZES.sm, ...FONTS.bold },
  listName: { color: COLORS.white, fontSize: SIZES.md, ...FONTS.semibold },
  listMeta: { color: COLORS.textMuted, fontSize: SIZES.sm, marginTop: 2 },
  logBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
    shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  logBtnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
});