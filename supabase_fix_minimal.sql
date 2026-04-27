-- ============================================================
-- FIX DATABASE MINIMAL: SOLO TRIGGER E VINCOLI
-- ============================================================

-- 1. Rimozione vincolo sui ruoli (se esiste)
-- Questo sblocca l'inserimento del ruolo 'osservatore'
DO $$
BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Rafforzamento del Trigger di creazione utente
-- Questa versione evita errori di cast e gestisce i valori nulli
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_venue_id UUID;
BEGIN
    -- Pulizia e conversione venue_id (gestisce stringhe vuote e formati errati)
    BEGIN
        v_venue_id := NULLIF(new.raw_user_meta_data->>'venue_id', '')::uuid;
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

-- 3. Sistemazione FK per i Log (Opzionale ma consigliato per i nomi nel registro)
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_user_id_fkey;
ALTER TABLE public.activity_log 
    ADD CONSTRAINT activity_log_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
