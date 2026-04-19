import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: 'admin' | 'staff' | 'super_admin' | null;
  venueId: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, role: 'admin' | 'staff', explicitVenueId?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkUser: () => Promise<void>;
  switchVenue: (venueId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  venueId: null,
  isLoading: true,

  checkUser: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // 1. Recupera il ruolo e il locale dalla tabella profiles
      let { data: profile } = await supabase
        .from('profiles')
        .select('role, venue_id')
        .eq('id', user.id)
        .single();
      
      // 2. Auto-riparazione se il profilo manca
      if (!profile) {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (count === 0) {
          const { data: firstVenue } = await supabase.from('venues').select('id').limit(1).single();
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{ id: user.id, role: 'admin', venue_id: firstVenue?.id }])
            .select()
            .single();
          if (!createError) profile = newProfile;
        }
      }
        
      set({ 
        user, 
        role: profile?.role || 'staff', 
        venueId: profile?.venue_id || null,
        isLoading: false 
      });
    } else {
      set({ user: null, role: null, venueId: null, isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, venue_id')
        .eq('id', data.user.id)
        .single();

      set({ 
        user: data.user, 
        role: profile?.role || 'staff', 
        venueId: profile?.venue_id || null,
        isLoading: false 
      });
    } else {
      set({ isLoading: false });
    }
    
    return { error };
  },

  switchVenue: (venueId) => {
    console.log("Switch locale a:", venueId);
    set({ venueId });
    // Dopo il cambio, ricarichiamo i dati (l'app reagirà allo stato)
    window.location.reload(); 
  },

  signUp: async (email, password, role, explicitVenueId) => {
    console.log("Tentativo di registrazione per:", email, role, explicitVenueId);
    set({ isLoading: true });
    
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        console.error("Errore Auth SignUp:", error);
        set({ isLoading: false });
        return { error };
      }

      if (data.user) {
        // Usa il locale esplicito (onboarding) o quello dello store (invito admin)
        const targetVenueId = explicitVenueId || useAuthStore.getState().venueId;
        
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, role, venue_id: targetVenueId }]);
          
        if (!profileError) {
          set({ user: data.user, role, venueId: targetVenueId, isLoading: false });
          return { error: null };
        } else {
          set({ isLoading: false });
          return { error: profileError };
        }
      }
      return { error: null };
    } catch (err) {
      set({ isLoading: false });
      return { error: err };
    }
  },

  signOut: async () => {
    set({ user: null, role: null, venueId: null, isLoading: false });
    await supabase.auth.signOut();
  }
}));
