-- ============================================================
-- AGGIORNAMENTO POLICY RLS PER RUOLO OSSERVATORE
-- ============================================================
-- Questo script assicura che il ruolo 'osservatore' abbia solo
-- accesso in visualizzazione (SELECT) e non possa modificare nulla.

-- 1. Assicuriamoci che le tabelle abbiano RLS attivo
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- 2. Aggiornamento Policy Prodotti
DROP POLICY IF EXISTS "Isolamento Prodotti per Locale" ON public.products;
CREATE POLICY "Visualizzazione Prodotti per Locale" ON public.products
    FOR SELECT USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Prodotti per Locale" ON public.products
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    )
    WITH CHECK (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- 3. Aggiornamento Policy Eventi
DROP POLICY IF EXISTS "Isolamento Eventi per Locale" ON public.events;
CREATE POLICY "Visualizzazione Eventi per Locale" ON public.events
    FOR SELECT USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Eventi per Locale" ON public.events
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    )
    WITH CHECK (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- 4. Aggiornamento Policy Report
DROP POLICY IF EXISTS "Isolamento Report per Locale" ON public.reports;
CREATE POLICY "Visualizzazione Report per Locale" ON public.reports
    FOR SELECT USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Report per Locale" ON public.reports
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- NOTA: Il ruolo 'osservatore' ora può solo eseguire SELECT perché non è incluso nelle policy di modifica (INSERT/UPDATE/DELETE).
