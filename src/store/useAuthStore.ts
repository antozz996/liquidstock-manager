import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: 'admin' | 'staff' | 'super_admin' | 'osservatore' | null;
  actualRole: 'admin' | 'staff' | 'super_admin' | 'osservatore' | null;
  venueId: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  registerWithInvite: (token: string, email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  checkUser: () => Promise<void>;
  switchVenue: (venueId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  actualRole: null,
  venueId: null,
  isLoading: true,

  checkUser: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, venue_id, full_name')
        .eq('id', user.id)
        .single();
      const { data: accessibleVenues } = await supabase.rpc('get_my_accessible_venues');
      const allowedVenueIds = new Set((accessibleVenues || []).map((venue: { id: string }) => venue.id));
      const savedVenueId = localStorage.getItem('selectedVenueId');
      const selectedVenueId = savedVenueId && allowedVenueIds.has(savedVenueId)
        ? savedVenueId
        : profile?.venue_id && allowedVenueIds.has(profile.venue_id)
          ? profile.venue_id
          : (accessibleVenues?.[0]?.id ?? null);
      if (selectedVenueId) localStorage.setItem('selectedVenueId', selectedVenueId);
      else localStorage.removeItem('selectedVenueId');
      localStorage.removeItem('selectedRole');
      set({ 
        user, 
        role: profile?.role || 'staff',
        actualRole: profile?.role || 'staff', 
        venueId: selectedVenueId,
        isLoading: false 
      });
    } else {
      set({ user: null, role: null, actualRole: null, venueId: null, isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, venue_id, full_name')
        .eq('id', data.user.id)
        .single();
      const { data: accessibleVenues } = await supabase.rpc('get_my_accessible_venues');
      const allowedVenueIds = new Set((accessibleVenues || []).map((venue: { id: string }) => venue.id));
      const selectedVenueId = profile?.venue_id && allowedVenueIds.has(profile.venue_id)
        ? profile.venue_id
        : (accessibleVenues?.[0]?.id ?? null);

      // Rimuovi eventuali override precedenti per evitare interferenze
      localStorage.removeItem('selectedVenueId');
      localStorage.removeItem('selectedRole');

      set({ 
        user: data.user, 
        role: profile?.role || 'staff', 
        actualRole: profile?.role || 'staff', 
        venueId: selectedVenueId,
        isLoading: false 
      });
    } else {
      set({ isLoading: false });
    }
    
    return { error };
  },

  switchVenue: async (venueId) => {
    const { data } = await supabase.rpc('get_my_accessible_venues');
    if (!(data || []).some((venue: { id: string }) => venue.id === venueId)) return;
    localStorage.setItem('selectedVenueId', venueId);
    set({ venueId });
    window.location.reload(); 
  },

  registerWithInvite: async (token, email, password, fullName) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.functions.invoke('register-with-invite', {
        body: { token, email, password, full_name: fullName },
      });
      set({ isLoading: false });
      return { error };
    } catch (err) {
      set({ isLoading: false });
      return { error: err };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('selectedVenueId');
    localStorage.removeItem('selectedRole');
    set({ user: null, role: null, actualRole: null, venueId: null, isLoading: false });
  }
}));
