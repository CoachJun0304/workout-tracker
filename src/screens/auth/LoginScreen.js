import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Text as RNText
} from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signIn, signUp } = useAuth();

  async function handleSubmit() {
    setMessage('');
    if (!email.trim()) { setMessage('Email is required'); return; }
    if (!password.trim()) { setMessage('Password is required'); return; }
    if (isSignUp && !name.trim()) { setMessage('Name is required'); return; }
    if (password.length < 6) { setMessage('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const { error } = isSignUp
        ? await signUp(email.trim(), password, name.trim())
        : await signIn(email.trim(), password);

      if (error) {
        setMessage(error.message);
      } else if (isSignUp) {
        setMessage('✅ Account created! Please check your email to confirm, then sign in.');
        setIsSignUp(false);
      }
    } catch (e) {
      setMessage('Connection failed. Check your internet connection.');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <Text style={styles.logo}>💪</Text>
        <Text style={styles.title}>Workout Tracker</Text>
        <Text style={styles.subtitle}>Coach Dashboard</Text>

        <Surface style={styles.card}>
          {isSignUp && (
            <TextInput
              label="Your Name"
              value={name}
              onChangeText={setName}
              style={styles.input}
              mode="outlined"
              autoCapitalize="words"
            />
          )}
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            label="Password (min 6 characters)"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            mode="outlined"
            secureTextEntry
          />

          {message !== '' && (
            <View style={[
              styles.messageBox,
              { backgroundColor: message.includes('✅') ? '#00B89422' : '#D6303122' }
            ]}>
              <Text style={{
                color: message.includes('✅') ? '#00B894' : '#D63031',
                fontSize: 13,
                textAlign: 'center'
              }}>
                {message}
              </Text>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}>
            {loading
              ? (isSignUp ? 'Creating Account...' : 'Signing In...')
              : (isSignUp ? 'Create Account' : 'Sign In')}
          </Button>

          <TouchableOpacity
            onPress={() => { setIsSignUp(!isSignUp); setMessage(''); }}
            style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </Surface>

        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>Connection Test</Text>
          <Button
            compact
            mode="outlined"
            onPress={async () => {
              setMessage('Testing connection...');
              try {
                const { supabase } = require('../../lib/supabase');
                const { data, error } = await supabase
                  .from('profiles')
                  .select('count')
                  .limit(1);
                if (error) {
                  setMessage('Supabase error: ' + error.message);
                } else {
                  setMessage('✅ Connected to Supabase successfully!');
                }
              } catch (e) {
                setMessage('Connection failed: ' + e.message);
              }
            }}>
            Test Supabase Connection
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 64, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 32 },
  card: { padding: 24, borderRadius: 16, backgroundColor: '#1a1a1a', marginBottom: 16 },
  input: { marginBottom: 12, backgroundColor: '#2a2a2a' },
  button: { marginTop: 8, borderRadius: 8 },
  buttonContent: { paddingVertical: 6 },
  switchBtn: { marginTop: 16, alignItems: 'center' },
  switchText: { color: '#6C63FF', fontSize: 14 },
  messageBox: {
    padding: 12, borderRadius: 8, marginBottom: 12,
    borderWidth: 1, borderColor: 'transparent'
  },
  debugBox: {
    padding: 16, borderRadius: 12,
    backgroundColor: '#1a1a1a', alignItems: 'center', gap: 8
  },
  debugTitle: { color: '#888', fontSize: 12, marginBottom: 4 },
});