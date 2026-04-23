import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://pxkdpsupcurmtxqlrjrp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4a2Rwc3VwY3VybXR4cWxyanJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTY2MDIsImV4cCI6MjA5MTI3MjYwMn0.vr2QCjdk6vs2pgW-6j1aRLr58KOpmMAdMPsPV5wY7CM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
auth: {
  storage: storage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: Platform.OS === 'web',
},
});