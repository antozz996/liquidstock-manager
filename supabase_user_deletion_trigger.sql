-- ============================================================
-- SINCRONIZZAZIONE CANCELLAZIONE UTENTI (AUTH <-> PROFILES)
-- ============================================================
-- Questo script fa sì che quando un profilo viene eliminato dalla 
-- tabella 'public.profiles' (tramite l'app), l'utente venga 
-- rimosso automaticamente anche da 'auth.users' di Supabase.

-- 1. Crea la funzione di gestione (SECURITY DEFINER è necessario per bypassare i permessi RLS su auth)
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger AS $$
BEGIN
  -- Elimina l'utente dalla tabella interna di Supabase Auth
  DELETE FROM auth.users WHERE id = old.id;
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Applica il Trigger alla tabella profiles
DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();

-- NOTA: Assicurati che le tue policy RLS su public.profiles permettano la cancellazione 
-- solo agli amministratori autorizzati.
