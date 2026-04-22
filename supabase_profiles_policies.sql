-- 1. Abilita RLS su profiles (dovrebbe già esserlo, ma assicuriamoci)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Rimuovi policy esistenti per evitare conflitti durante il test
DROP POLICY IF EXISTS "Gli utenti possono vedere solo i profili del proprio locale" ON public.profiles;
DROP POLICY IF EXISTS "I Super Admin vedono tutto" ON public.profiles;
DROP POLICY IF EXISTS "Solo Admin e Super Admin possono cancellare profili" ON public.profiles;

-- 3. Policy di Visualizzazione
CREATE POLICY "Visualizzazione Profili" ON public.profiles
    FOR SELECT USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 4. Policy di Cancellazione (IMPORTANTE)
CREATE POLICY "Cancellazione Profili" ON public.profiles
    FOR DELETE USING (
        (
            (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' AND 
            role = 'staff' AND 
            venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid())
        ) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 5. Policy di Aggiornamento (Per cambio ruoli)
CREATE POLICY "Aggiornamento Profili" ON public.profiles
    FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );
