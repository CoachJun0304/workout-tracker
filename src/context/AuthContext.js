import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(authUserId) {
    try {
      let { data } = await supabase
        .from('profiles').select('*').eq('auth_id', authUserId).single();

      if (!data) {
        const res = await supabase
          .from('profiles').select('*').eq('id', authUserId).single();
        data = res.data;
      }

      if (data) {
        setProfile(data);
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const newProfile = {
            auth_id: userData.user.id,
            name: userData.user.user_metadata?.name || userData.user.email.split('@')[0],
            email: userData.user.email,
            role: userData.user.user_metadata?.role || 'client',
            gender: userData.user.user_metadata?.gender || 'Male',
            status: 'active',
            unit_preference: 'kg',
          };
          const { data: created } = await supabase
            .from('profiles').insert(newProfile).select().single();
          setProfile(created || newProfile);
        }
      }
    } catch (e) {
      console.log('Profile error:', e.message);
    }
    setLoading(false);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email, password, name, role = 'client', gender = 'Male') {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role, gender } }
    });

    if (data?.user && !error) {
      await supabase.from('profiles').upsert({
        auth_id: data.user.id,
        name, email, role, gender,
        status: 'active',
        unit_preference: 'kg',
      }, { onConflict: 'auth_id' });
    }

    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function updateUnitPreference(unit) {
    if (!profile) return;
    const idField = profile.auth_id ? 'auth_id' : 'id';
    const idValue = profile.auth_id || profile.id;
    await supabase.from('profiles').update({ unit_preference: unit }).eq(idField, idValue);
    setProfile(p => ({ ...p, unit_preference: unit }));
  }

  const isCoach = profile?.role === 'coach';
  const isClient = profile?.role === 'client';
  const unit = profile?.unit_preference || 'kg';

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signOut,
      isCoach, isClient, unit,
      updateUnitPreference, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);