-- ============================================================
-- FIX DATABASE V2: GESTIONE DIPENDENZE POLICY
-- ============================================================

-- 1. Rimuoviamo temporaneamente la policy che blocca l'aggiornamento
DROP POLICY IF EXISTS "Isolamento Log per Locale" ON public.activity_log;

-- 2. Sistemazione Relazione Activity Log
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_user_id_fkey;
ALTER TABLE public.activity_log 
    ADD CONSTRAINT activity_log_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Gestione del Ruolo 'osservatore'
-- Rimuoviamo eventuali vincoli CHECK sulla colonna role
DO $$
BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Se la colonna 'role' è di tipo TEXT, assicuriamoci che non abbia limiti
ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT;

-- 4. Ripristino della Policy
CREATE POLICY "Isolamento Log per Locale" ON public.activity_log
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 5. Rafforzamento del Trigger di creazione utente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_venue_id UUID;
BEGIN
    -- Pulizia e conversione venue_id
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
