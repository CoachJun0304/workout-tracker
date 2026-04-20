import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, ScrollView, Alert
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

const GENDERS = ['Male', 'Female', 'Other'];

export default function LoginScreen() {
  const [screen, setScreen] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [coachSearch, setCoachSearch] = useState('');
  const [coachResults, setCoachResults] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signIn, signUp } = useAuth();
  const isCoach = screen === 'coach';

  async function searchCoaches(text) {
    setCoachSearch(text);
    if (text.length < 2) { setCoachResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'coach')
      .eq('status', 'active')
      .ilike('name', `%${text}%`)
      .limit(5);
    setCoachResults(data || []);
  }

  async function handleSubmit() {
    setMessage('');
    if (!email.trim()) { setMessage('Email is required'); return; }
    if (!password.trim()) { setMessage('Password is required'); return; }
    if (isSignUp) {
      if (!name.trim()) { setMessage('Name is required'); return; }
      if (password.length < 6) { setMessage('Password must be at least 6 characters'); return; }
      if (password !== confirmPassword) { setMessage('Passwords do not match'); return; }
    }

    setLoading(true);
    try {
      const role = isCoach ? 'coach' : 'client';
      const { error } = isSignUp
        ? await signUp(email.trim(), password, name.trim(), role, gender)
        : await signIn(email.trim(), password);

      if (error) {
        setMessage(error.message);
      } else if (isSignUp) {
        // Link to coach if selected
        if (!isCoach && selectedCoach) {
          const { data: newProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email.trim())
            .single();
          if (newProfile) {
            await supabase.from('profiles')
              .update({ coach_id: selectedCoach.id })
              .eq('id', newProfile.id);
          }
        }
        setMessage('✅ Account created! You can now sign in.');
        setIsSignUp(false);
      }
    } catch (e) {
      setMessage('Connection failed. Check your internet.');
    }
    setLoading(false);
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        const { signOut } = useAuth();
        await signOut();
      }}
    ]);
  }

  if (screen === 'home') {
    return (
      <View style={styles.homeContainer}>
        <View style={styles.homeTop}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>💪</Text>
          </View>
          <Text style={styles.appName}>FitCoach Pro</Text>
          <Text style={styles.appTagline}>Your Personal Training Platform</Text>
        </View>
        <View style={styles.homeBottom}>
          <Text style={styles.chooseText}>I am a...</Text>
          <TouchableOpacity style={styles.roleBtn}
            onPress={() => { setScreen('coach'); setIsSignUp(false); setMessage(''); }}>
            <View style={styles.roleBtnInner}>
              <Text style={styles.roleBtnEmoji}>🏋️</Text>
              <View style={styles.roleBtnText}>
                <Text style={styles.roleBtnTitle}>Coach</Text>
                <Text style={styles.roleBtnSub}>Manage clients and programs</Text>
              </View>
              <Text style={styles.roleBtnArrow}>›</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.roleBtn, styles.roleBtnClient]}
            onPress={() => { setScreen('client'); setIsSignUp(false); setMessage(''); }}>
            <View style={styles.roleBtnInner}>
              <Text style={styles.roleBtnEmoji}>🏃</Text>
              <View style={styles.roleBtnText}>
                <Text style={styles.roleBtnTitle}>Client</Text>
                <Text style={styles.roleBtnSub}>View and log my workouts</Text>
              </View>
              <Text style={styles.roleBtnArrow}>›</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.loginHeader,
          { backgroundColor: isCoach ? COLORS.roseGoldDark : '#1A3A5C' }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('home')}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.loginHeaderEmoji}>{isCoach ? '🏋️' : '🏃'}</Text>
          <Text style={styles.loginHeaderTitle}>{isCoach ? 'Coach' : 'Client'} Login</Text>
          <Text style={styles.loginHeaderSub}>
            {isCoach ? 'Manage your clients and programs' : 'View your workouts and track progress'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isSignUp && styles.toggleBtnActive]}
              onPress={() => { setIsSignUp(false); setMessage(''); }}>
              <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isSignUp && styles.toggleBtnActive]}
              onPress={() => { setIsSignUp(true); setMessage(''); }}>
              <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>
                {isCoach ? 'Register' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>

          {isSignUp && (
            <View>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput value={name} onChangeText={setName}
                style={styles.input} mode="outlined"
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textMuted}
                outlineColor={COLORS.darkBorder2}
                activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white}
                autoCapitalize="words" />

              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.genderRow}>
                {GENDERS.map(g => (
                  <TouchableOpacity key={g}
                    style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                    onPress={() => setGender(g)}>
                    <Text style={[styles.genderBtnText, gender === g && styles.genderBtnTextActive]}>
                      {g === 'Male' ? '♂️ Male' : g === 'Female' ? '♀️ Female' : '⚧ Other'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!isCoach && (
                <View>
                  <Text style={styles.inputLabel}>Find Your Coach (optional)</Text>
                  <TextInput value={coachSearch} onChangeText={searchCoaches}
                    style={styles.input} mode="outlined"
                    placeholder="Search coach by name..."
                    placeholderTextColor={COLORS.textMuted}
                    outlineColor={COLORS.darkBorder2}
                    activeOutlineColor={COLORS.roseGold}
                    textColor={COLORS.white} />
                  {coachResults.map(coach => (
                    <TouchableOpacity key={coach.id}
                      style={[styles.coachResult,
                        selectedCoach?.id === coach.id && styles.coachResultSelected]}
                      onPress={() => {
                        setSelectedCoach(coach);
                        setCoachSearch(coach.name);
                        setCoachResults([]);
                      }}>
                      <Text style={styles.coachResultName}>{coach.name}</Text>
                      <Text style={styles.coachResultEmail}>{coach.email}</Text>
                    </TouchableOpacity>
                  ))}
                  {selectedCoach && (
                    <View style={styles.selectedCoachBadge}>
                      <Text style={styles.selectedCoachText}>
                        ✅ Coach: {selectedCoach.name}
                      </Text>
                      <TouchableOpacity onPress={() => {
                        setSelectedCoach(null);
                        setCoachSearch('');
                      }}>
                        <Text style={styles.removeCoachText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput value={email} onChangeText={setEmail}
            style={styles.input} mode="outlined"
            placeholder="Enter your email"
            placeholderTextColor={COLORS.textMuted}
            outlineColor={COLORS.darkBorder2}
            activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false} />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput value={password} onChangeText={setPassword}
            style={styles.input} mode="outlined"
            placeholder="Min 6 characters"
            placeholderTextColor={COLORS.textMuted}
            outlineColor={COLORS.darkBorder2}
            activeOutlineColor={COLORS.roseGold}
            textColor={COLORS.white}
            secureTextEntry />

          {isSignUp && (
            <View>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput value={confirmPassword} onChangeText={setConfirmPassword}
                style={styles.input} mode="outlined"
                placeholder="Re-enter password"
                placeholderTextColor={COLORS.textMuted}
                outlineColor={COLORS.darkBorder2}
                activeOutlineColor={COLORS.roseGold}
                textColor={COLORS.white}
                secureTextEntry />
            </View>
          )}

          {message !== '' && (
            <View style={[styles.messageBox, {
              backgroundColor: message.includes('✅') ? '#00C89622' : '#FF4B4B22',
              borderColor: message.includes('✅') ? COLORS.success : COLORS.error
            }]}>
              <Text style={{
                color: message.includes('✅') ? COLORS.success : COLORS.error,
                fontSize: 13
              }}>{message}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit} disabled={loading}>
            <Text style={styles.submitBtnText}>
              {loading ? '...' : isSignUp
                ? (isCoach ? 'Create Coach Account' : 'Create Client Account')
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
  homeTop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  logoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.roseGoldMid, borderWidth: 2, borderColor: COLORS.roseGold, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoEmoji: { fontSize: 48 },
  appName: { fontSize: 36, ...FONTS.heavy, color: COLORS.white, letterSpacing: 1, marginBottom: 8 },
  appTagline: { fontSize: SIZES.base, color: COLORS.textSecondary },
  homeBottom: { padding: 24, paddingBottom: 48 },
  chooseText: { fontSize: SIZES.lg, color: COLORS.textSecondary, ...FONTS.medium, marginBottom: 16, textAlign: 'center' },
  roleBtn: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.roseGoldMid, marginBottom: 12 },
  roleBtnClient: { borderColor: '#1A3A5C' },
  roleBtnInner: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  roleBtnEmoji: { fontSize: 32 },
  roleBtnText: { flex: 1 },
  roleBtnTitle: { fontSize: SIZES.xl, ...FONTS.bold, color: COLORS.white, marginBottom: 2 },
  roleBtnSub: { fontSize: SIZES.sm, color: COLORS.textSecondary },
  roleBtnArrow: { fontSize: 28, color: COLORS.roseGold },
  container: { flex: 1, backgroundColor: COLORS.darkBg },
  scrollContent: { flexGrow: 1 },
  loginHeader: { padding: 32, paddingTop: 60, alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start', marginBottom: 16 },
  backText: { color: COLORS.white, fontSize: SIZES.lg, ...FONTS.medium },
  loginHeaderEmoji: { fontSize: 48, marginBottom: 12 },
  loginHeaderTitle: { fontSize: SIZES.xxxl, ...FONTS.heavy, color: COLORS.white, marginBottom: 6 },
  loginHeaderSub: { fontSize: SIZES.md, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  formContainer: { flex: 1, padding: 24, paddingTop: 32 },
  toggleRow: { flexDirection: 'row', backgroundColor: COLORS.darkCard, borderRadius: RADIUS.full, padding: 4, marginBottom: 24 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: COLORS.roseGold },
  toggleText: { fontSize: SIZES.md, ...FONTS.semibold, color: COLORS.textSecondary },
  toggleTextActive: { color: COLORS.white },
  inputLabel: { fontSize: SIZES.sm, ...FONTS.semibold, color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: COLORS.darkCard2, marginBottom: 16 },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  genderBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.darkCard, borderWidth: 1, borderColor: COLORS.darkBorder, alignItems: 'center' },
  genderBtnActive: { backgroundColor: COLORS.roseGold, borderColor: COLORS.roseGold },
  genderBtnText: { color: COLORS.textSecondary, fontSize: SIZES.sm, ...FONTS.medium },
  genderBtnTextActive: { color: COLORS.white },
  coachResult: { backgroundColor: COLORS.darkCard2, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.darkBorder },
  coachResultSelected: { borderColor: COLORS.roseGold },
  coachResultName: { color: COLORS.white, ...FONTS.semibold, fontSize: SIZES.md },
  coachResultEmail: { color: COLORS.textMuted, fontSize: SIZES.xs, marginTop: 2 },
  selectedCoachBadge: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#00C89622', borderRadius: RADIUS.md, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#00C896' },
  selectedCoachText: { color: '#00C896', ...FONTS.semibold, fontSize: SIZES.sm },
  removeCoachText: { color: COLORS.error, fontSize: SIZES.lg },
  messageBox: { padding: 12, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: 16 },
  submitBtn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: COLORS.roseGold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: SIZES.lg, ...FONTS.bold, color: COLORS.white, letterSpacing: 0.5 },
});