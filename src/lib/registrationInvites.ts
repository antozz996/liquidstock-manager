import { supabase } from './supabase';

interface InviteResponse {
  id: string;
  token: string;
  expires_at: string;
}

export async function createStaffInvite(venueId: string, expiresInHours = 24) {
  const { data, error } = await supabase.functions.invoke<InviteResponse>('create-registration-invite', {
    body: { venue_id: venueId, expires_in_hours: expiresInHours },
  });
  if (error || !data?.token) throw error ?? new Error('Impossibile creare l’invito');
  return {
    ...data,
    link: `${window.location.origin}/register?invite=${encodeURIComponent(data.token)}`,
  };
}
