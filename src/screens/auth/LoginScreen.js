import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, ScrollView,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function LoginScreen() {
  const [screen, setScreen] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signIn, signUp } = useAuth();

  const role = screen === 'coach' ? 'coach' : 'client';

  async function handleSubmit() {
    setMessage('');
    if (!email.trim()) { setMessage('Email is required'); return; }
    if (!password.trim()) { setMessage('Password is required'); return; }
    if (isSignUp && !name.trim()) { setMessage('Name is required'); return; }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters'); return;
    }
    setLoading(true);
    try {
      const { error } = isSignUp
        ? await signUp(email.trim(), password, name.trim(), role)
        : await signIn(email.trim(), password);
      if (error) {
        setMessage(error.message);
      } else if (isSignUp) {
        setMessage(
          role === 'coach'
            ? '✅ Account created! Awaiting Head Coach approval.'
            : '✅ Account created! You can now sign in.'
        );
        setIsSignUp(false);
      }
    } catch (e) {
      setMessage('Connection failed. Check your internet.');
    }
    setLoading(false);
  }

  // HOME
  if (screen === 'home') {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.homeTop}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>💪</Text>
          </View>
          <Text style={styles.appName}>FitCoach Pro</Text>
          <Text style={styles.tagline}>Your Personal Training Platform</Text>
        </View>
        <View style={styles.homeBottom}>
          <Text style={styles.chooseLabel}>I am a...</Text>
          <TouchableOpacity style={styles.roleCard}
            onPress={() => { setScreen('coach'); setIsSignUp(false); setMessage(''); }}>
            <View style={styles.roleCardInner}>
              <Text style={styles.roleEmoji}>🏋️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>Coach</Text>
                <Text style={styles.roleSub}>Manage clients and programs</Text>
              </View>
              <Text style={styles.roleArrow}>›</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleCard, { borderColor: '#1A3A5C40' }]}
            onPress={() => { setScreen('client'); setIsSignUp(false); setMessage(''); }}>
            <View style={styles.roleCardInner}>
              <Text style={styles.roleEmoji}>🏃</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>Client</Text>
                <Text style={styles.roleSub}>View and log my workouts</Text>
              </View>
              <Text style={styles.roleArrow}>›</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // LOGIN / SIGNUP
  const isCoachScreen = screen === 'coach';
  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.loginHeader,
          { backgroundColor: isCoachScreen ? COLORS.roseGoldDark : '#0F3460' }]}>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.loginEmoji}>{isCoachScreen ? '🏋️' : '🏃'}</Text>
          <Text style={styles.loginTitle}>
            {isCoachScreen ? 'Coach Login' : 'Client Login'}
          </Text>
          <Text style={styles.loginSub}>
            {isCoachScreen
              ? 'New coaches require Head Coach approval'
              : 'View your workouts and track progress'}
          </Text>
        </View>

        <View style={styles.formBox}>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isSignUp && styles.toggleBtnOn]}
              onPress={() => { setIsSignUp(false); setMessage(''); }}>
              <Text style={[styles.toggleText, !isSignUp && styles.toggleTextOn]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isSignUp && styles.toggleBtnOn]}
              onPress={() => { setIsSignUp(true); setMessage(''); }}>
              <Text style={[styles.toggleText, isSignUp && styles.toggleTextOn]}>
                {isCoachScreen ? 'Register as Coach' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>

          {isSignUp && (
            <>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput value={name} onChangeText={setName}
                style={styles.input} mode="outlined"
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textMuted}
                outlineColor={COLORS.darkBorder2}
                activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white}
                autoCapitalize="words" />
            </>
          )}

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput value={email} onChangeText={setEmail}
            style={styles.input} mode="outlined"
            placeholder="Enter your email"
            placeholderTextColor={COLORS.textMuted}
            outlineColor={COLORS.darkBorder2}
            activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white}
            keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput value={password} onChangeText={setPassword}
            style={styles.input} mode="outlined"
            placeholder="Min 6 characters"
            placeholderTextColor={COLORS.textMuted}
            outlineColor={COLORS.darkBorder2}
            activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white}
            secureTextEntry />

          {message !== '' && (
            <View style={[styles.msgBox,
              { backgroundColor: message.includes('✅') ? '#00C89622' : '#FF4B4B22',
                borderColor: message.includes('✅') ? COLORS.success : COLORS.error }]}>
              <Text style={{
                color: message.includes('✅') ? COLORS.success : COLORS.error,
                fontSize: SIZES.sm,
              }}>{message}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit} disabled={loading}>
            <Text style={styles.submitText}>
              {loading ? 'Please wait...'
                : isSignUp
                  ? (isCoachScreen ? 'Register as Coach' : 'Create Account')
                  : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  homeContainer: { flex: 1, backgroundColor: COLORS.darkBg },
  homeTop: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', paddingTop: 80,
  },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.roseGoldMid,
    borderWidth: 2, borderColor: COLORS.roseGold,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  logoEmoji: { fontSize: 48 },
  appName: {
    fontSize: 36, ...FONTS.heavy,
    color: COLORS.white, letterSpacing: 1, marginBottom: 8,
  },
  tagline: { fontSize: SIZES.base, color: COLORS.textSecondary },
  homeBottom: { padding: 24, paddingBottom: 48 },
  chooseLabel: {
    fontSize: SIZES.lg, color: COLORS.textSecondary,
    ...FONTS.medium, marginBottom: 16, textAlign: 'center',
  },
  roleCard: {
    backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.roseGoldMid, marginBottom: 12,
  },
  roleCardInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, gap: 16,
  },
  roleEmoji: { fontSize: 32 },
  roleTitle: { fontSize: SIZES.xl, ...FONTS.bold, color: COLORS.white },
  roleSub: { fontSize: SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  roleArrow: { fontSize: 28, color: COLORS.roseGold },
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  scrollContent: { flexGrow: 1 },
  loginHeader: { padding: 32, paddingTop: 60, alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start', marginBottom: 16 },
  backText: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.medium },
  loginEmoji: { fontSize: 48, marginBottom: 12 },
  loginTitle: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 6 },
  loginSub: {
    fontSize: SIZES.sm, color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  formBox: { flex: 1, padding: 24 },
  toggleRow: {
    flexDirection: 'row', backgroundColor: COLORS.darkCard,
    borderRadius: RADIUS.full, padding: 4, marginBottom: 20,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 10,
    borderRadius: RADIUS.full, alignItems: 'center',
  },
  toggleBtnOn: { backgroundColor: COLORS.roseGold },
  toggleText: { fontSize: SIZES.sm, ...FONTS.semibold, color: COLORS.textSecondary },
  toggleTextOn: { color: COLORS.white },
  fieldLabel: {
    color: COLORS.textSecondary, fontSize: SIZES.xs,
    ...FONTS.semibold, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  input: { backgroundColor: COLORS.darkCard2, marginBottom: 8 },
  msgBox: {
    padding: 12, borderRadius: RADIUS.md,
    borderWidth: 1, marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
    shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  submitText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
});