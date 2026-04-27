-- ============================================================
-- FIX DATABASE: LOG E NUOVO RUOLO OSSERVATORE
-- ============================================================

-- 1. Sistemazione Relazione Activity Log per i join
-- Cambiamo il riferimento di user_id da auth.users a public.profiles 
-- per permettere a PostgREST di caricare il full_name correttamente.
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_user_id_fkey;
ALTER TABLE public.activity_log 
    ADD CONSTRAINT activity_log_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Rimozione eventuali vincoli sul campo 'role' in profiles
-- In alcuni database Supabase potrebbe esserci un vincolo CHECK che limita i ruoli.
-- Assicuriamoci che 'osservatore' sia accettato.
DO $$
BEGIN
    -- Rimuoviamo il vecchio vincolo se esiste (potrebbe chiamarsi in vari modi)
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 3. Aggiornamento della funzione trigger per maggiore robustezza
-- Assicuriamoci che il cast a UUID non fallisca se il dato è sporco.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_venue_id UUID;
BEGIN
    -- Tentativo di conversione sicura del venue_id
    BEGIN
        v_venue_id := (new.raw_user_meta_data->>'venue_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_venue_id := NULL;
    END;

    INSERT INTO public.profiles (id, full_name, role, venue_id)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Nuovo Utente'),
        COALESCE(new.raw_user_meta_data->>'role', 'staff'),
        v_venue_id
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Assicuriamoci che il campo role sia semplice TEXT (senza ENUM o vincoli restrittivi)
ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT;
