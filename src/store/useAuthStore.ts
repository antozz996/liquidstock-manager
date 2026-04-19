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
      // 1. Prova a recuperare il profilo
      let { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      
      // 2. Se il profilo non esiste, verifichiamo se è il primo utente in assoluto
      if (!profile) {
        console.log("Profilo non trovato, verifico se è il primo sistema...");
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        
        if (count === 0) {
          console.log("Primo utente rilevato! Assegnazione ruolo ADMIN...");
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, role: 'admin' }])
            .select()
            .single();
          
          if (!createError) {
            profile = newProfile;
          }
        }
      }

      set({ user: data.user, role: profile?.role || 'staff', isLoading: false });
    } else {
      set({ isLoading: false });
    }
    
    return { error };
  },

  signUp: async (email, password, role) => {
    console.log("Tentativo di registrazione per:", email, role);
    set({ isLoading: true });
    
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        console.error("Errore Auth SignUp:", error);
        set({ isLoading: false });
        return { error };
      }

      if (data.user) {
        console.log("Utente creato, inserisco profilo...");
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, role }]);
          
        if (!profileError) {
          console.log("Profilo creato con successo!");
          set({ user: data.user, role, isLoading: false });
          return { error: null };
        } else {
          console.error("Errore creazione profilo:", profileError);
          set({ isLoading: false });
          return { error: profileError };
        }
      } else {
        console.warn("Registrazione completata ma nessun utente restituito (richiesto conferma email?).");
        set({ isLoading: false });
        // Se l'utente è creato ma non abbiamo il profilo (perché data.user è nullo o altro), 
        // ritorniamo comunque successo se non c'è errore auth.
        return { error: null };
      }
    } catch (err) {
      console.error("Errore imprevisto nello store:", err);
      set({ isLoading: false });
      return { error: err };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, role: null });
  }
}));
