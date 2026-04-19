import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: 'admin' | 'staff' | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, role: 'admin' | 'staff') => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  isLoading: true,

  checkUser: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Recupera il ruolo dalla tabella profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      set({ user, role: profile?.role || 'staff', isLoading: false });
    } else {
      set({ user: null, role: null, isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      set({ user: data.user, role: profile?.role || 'staff', isLoading: false });
    } else {
      set({ isLoading: false });
    }
    
    return { error };
  },

  signUp: async (email, password, role) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (data.user) {
      // Crea il profilo associato
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ id: data.user.id, role }]);
        
      if (!profileError) {
        set({ user: data.user, role, isLoading: false });
      } else {
        set({ isLoading: false });
        return { error: profileError };
      }
    } else {
      set({ isLoading: false });
    }
    
    return { error };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, role: null });
  }
}));
