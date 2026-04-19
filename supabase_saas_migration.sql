-- ==========================================
-- LIQUIDSTOCK SAAS MIGRATION SCRIPT
-- ==========================================

-- 1. Crea la tabella dei Locali (Venues)
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    owner_id UUID REFERENCES auth.users(id)
);

-- 2. Crea il tuo primo Locale predefinito (Sede Centrale)
-- Recuperiamo il tuo ID utente (il primo admin) per assegnargli il locale
DO $$
DECLARE
    first_admin_id UUID;
    main_venue_id UUID;
BEGIN
    SELECT id INTO first_admin_id FROM auth.users LIMIT 1;
    
    INSERT INTO public.venues (name, owner_id)
    VALUES ('Sede Centrale', first_admin_id)
    RETURNING id INTO main_venue_id;

    -- 3. Aggiungi venue_id a tutte le tabelle critiche
    -- PROFILI
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);
    UPDATE public.profiles SET venue_id = main_venue_id, role = 'admin' WHERE venue_id IS NULL;

    -- PRODOTTI
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);
    UPDATE public.products SET venue_id = main_venue_id WHERE venue_id IS NULL;

    -- EVENTI
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);
    UPDATE public.events SET venue_id = main_venue_id WHERE venue_id IS NULL;

    -- REPORT
    ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);
    UPDATE public.reports SET venue_id = main_venue_id WHERE venue_id IS NULL;

    -- CONFIGS
    ALTER TABLE public.configs ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);
    UPDATE public.configs SET venue_id = main_venue_id WHERE venue_id IS NULL;
END $$;

-- 4. Aggiorna RLS per l'isolamento Multi-Tenant
-- Nota: Ogni query ora filtrerà automaticamente per venue_id dell'utente loggato

-- PROFILE POLICY
DROP POLICY IF EXISTS "Profili visibili a tutti" ON public.profiles;
CREATE POLICY "Isolamento Profili per Locale" ON public.profiles
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- PRODUCTS POLICY
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
CREATE POLICY "Isolamento Prodotti per Locale" ON public.products
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- EVENTS POLICY
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento Eventi per Locale" ON public.events
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- REPORTS POLICY
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento Report per Locale" ON public.reports
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );
