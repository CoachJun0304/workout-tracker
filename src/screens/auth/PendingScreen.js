import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function PendingScreen() {
  const { profile, signOut, refreshProfile } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>⏳</Text>
        <Text style={styles.title}>Awaiting Approval</Text>
        <Text style={styles.sub}>
          Hi {profile?.name},{'\n\n'}
          Your coach account is pending approval from the Head Coach.{'\n\n'}
          You will be able to access the app once your account is approved.
        </Text>

        <TouchableOpacity style={styles.refreshBtn} onPress={refreshProfile}>
          <Text style={styles.refreshText}>🔄 Check Approval Status</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.darkBg,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl,
    padding: 32, alignItems: 'center', width: '100%',
    borderWidth: 1, borderColor: COLORS.darkBorder,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: {
    fontSize: SIZES.xxl, ...FONTS.heavy,
    color: COLORS.white, marginBottom: 16,
  },
  sub: {
    fontSize: SIZES.md, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 24, marginBottom: 24,
  },
  refreshBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 14, paddingHorizontal: 28,
    alignItems: 'center', marginBottom: 12, width: '100%',
  },
  refreshText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.md },
  signOutBtn: {
    paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center',
  },
  signOutText: { color: COLORS.textMuted, fontSize: SIZES.md },
});