import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SIZES, RADIUS } from '../../theme';

export default function ResetPasswordScreen({ navigation }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // Check if we have a valid session from the reset link
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });

    // Listen for the password recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasSession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset() {
    if (!password.trim()) { setMessage('Enter a new password'); return; }
    if (password.length < 6) { setMessage('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setMessage('Passwords do not match'); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('✅ Password updated! You can now sign in.');
      setTimeout(() => navigation.replace('Login'), 2000);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.title}>🔐 Reset Password</Text>
        <Text style={styles.subtitle}>
          {hasSession
            ? 'Enter your new password below'
            : 'Loading reset link...'}
        </Text>

        {hasSession && (
          <>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              mode="outlined"
              secureTextEntry
              placeholder="Min 6 characters"
              placeholderTextColor={COLORS.textMuted}
              outlineColor={COLORS.darkBorder}
              activeOutlineColor={COLORS.roseGold}
              textColor={COLORS.white} />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              style={styles.input}
              mode="outlined"
              secureTextEntry
              placeholder="Re-enter password"
              placeholderTextColor={COLORS.textMuted}
              outlineColor={COLORS.darkBorder}
              activeOutlineColor={COLORS.roseGold}
              textColor={COLORS.white} />

            {message !== '' && (
              <View style={[styles.messageBox, {
                borderColor: message.includes('✅') ? COLORS.success : COLORS.error,
                backgroundColor: message.includes('✅') ? '#00C89622' : '#FF4B4B22',
              }]}>
                <Text style={{
                  color: message.includes('✅') ? COLORS.success : COLORS.error,
                  fontSize: SIZES.sm
                }}>{message}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.6 }]}
              onPress={handleReset}
              disabled={loading}>
              <Text style={styles.btnText}>
                {loading ? 'Updating...' : 'Update Password'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.backText}>← Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkBg, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: COLORS.darkCard, borderRadius: RADIUS.xl, padding: 24, borderWidth: 1, borderColor: COLORS.darkBorder },
  title: { color: COLORS.white, fontSize: SIZES.xxl, ...FONTS.heavy, marginBottom: 8 },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom: 24 },
  label: { color: COLORS.textSecondary, fontSize: SIZES.xs, ...FONTS.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  input: { marginBottom: 8, backgroundColor: COLORS.darkCard2 },
  messageBox: { padding: 12, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: 16 },
  btn: { backgroundColor: COLORS.roseGold, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', marginBottom: 16, marginTop: 8 },
  btnText: { color: COLORS.white, ...FONTS.bold, fontSize: SIZES.lg },
  backText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: SIZES.sm },
});