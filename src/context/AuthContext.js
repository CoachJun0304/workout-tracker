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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else { setProfile(null); setLoading(false); }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(authUserId) {
    try {
      let { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_id', authUserId)
        .single();

      if (!data) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const v_role = userData.user.user_metadata?.role || 'client';
          const newProfile = {
            auth_id: userData.user.id,
            name: userData.user.user_metadata?.name ||
                  userData.user.email.split('@')[0],
            email: userData.user.email,
            role: v_role,
            approval_status: v_role === 'coach' ? 'pending' : 'approved',
            status: 'active',
          };
          const { data: created } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();
          data = created || newProfile;
        }
      }
      setProfile(data);
    } catch (e) {
      console.log('Profile error:', e.message);
    }
    setLoading(false);
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email, password
    });
    return { error };
  }

  async function signUp(email, password, name, role = 'client') {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role } }
    });
    if (data?.user && !error) {
      await supabase.from('profiles').upsert({
        auth_id: data.user.id,
        name,
        email,
        role,
        approval_status: role === 'coach' ? 'pending' : 'approved',
        status: 'active',
      }, { onConflict: 'auth_id' });
    }
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  const isHeadCoach = profile?.role === 'head_coach';
  const isCoach = profile?.role === 'coach' || profile?.role === 'head_coach';
  const isClient = profile?.role === 'client';
  const isPending = profile?.approval_status === 'pending';
  const isApproved = profile?.approval_status === 'approved';

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signOut, refreshProfile,
      isHeadCoach, isCoach, isClient,
      isPending, isApproved,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);