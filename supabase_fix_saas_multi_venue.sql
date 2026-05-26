-- ==============================================================================
-- LIQUIDSTOCK MANAGER: FIX MULTI-LOCALE (SaaS)
-- ==============================================================================
-- Copia e incolla questo script nell'SQL Editor di Supabase ed eseguilo.
-- Questo script sblocca il multi-locale (SaaS) per i profili Admin e Staff
-- verificando l'accesso tramite la tabella `venue_access` invece del solo profilo.
-- ==============================================================================

-- 1. Pulizia delle Policy Esistenti
DROP POLICY IF EXISTS "Visualizzazione Prodotti per Locale" ON public.products;
DROP POLICY IF EXISTS "Modifica Prodotti per Locale" ON public.products;
DROP POLICY IF EXISTS "Isolamento Prodotti per Locale" ON public.products;

DROP POLICY IF EXISTS "Visualizzazione Eventi per Locale" ON public.events;
DROP POLICY IF EXISTS "Modifica Eventi per Locale" ON public.events;
DROP POLICY IF EXISTS "Isolamento Eventi per Locale" ON public.events;

DROP POLICY IF EXISTS "Isolamento Event Stocks per Locale" ON public.event_stocks;
DROP POLICY IF EXISTS "Allow All on Event_Stocks" ON public.event_stocks;

DROP POLICY IF EXISTS "Visualizzazione Report per Locale" ON public.reports;
DROP POLICY IF EXISTS "Modifica Report per Locale" ON public.reports;
DROP POLICY IF EXISTS "Isolamento Report per Locale" ON public.reports;

DROP POLICY IF EXISTS "Isolamento Sessioni Arrivi per Locale" ON public.restock_sessions;
DROP POLICY IF EXISTS "Visualizzazione Sessioni Arrivi per Locale" ON public.restock_sessions;
DROP POLICY IF EXISTS "Modifica Sessioni Arrivi per Locale" ON public.restock_sessions;

DROP POLICY IF EXISTS "Isolamento Articoli Arrivi per Locale" ON public.restock_items;

DROP POLICY IF EXISTS "Isolamento Log per Locale" ON public.activity_log;

DROP POLICY IF EXISTS "Visualizzazione Profili" ON public.profiles;
DROP POLICY IF EXISTS "Isolamento Profili per Locale" ON public.profiles;
DROP POLICY IF EXISTS "Aggiornamento Profili" ON public.profiles;
DROP POLICY IF EXISTS "Cancellazione Profili" ON public.profiles;


-- ==============================================================================
-- 2. Creazione Nuove Policy Relazionali (Multi-Locale tramite `venue_access`)
-- ==============================================================================

-- A. PRODOTTI (Visualizzazione a tutti gli autorizzati, Modifica solo ad Admin/Super Admin)
CREATE POLICY "Visualizzazione Prodotti per Locale" ON public.products
    FOR SELECT USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Prodotti per Locale" ON public.products
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')) AND
        (venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
         (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- B. EVENTI (Visualizzazione a tutti, Modifica a Staff/Admin/Super Admin)
CREATE POLICY "Visualizzazione Eventi per Locale" ON public.events
    FOR SELECT USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Eventi per Locale" ON public.events
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
         (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- C. EVENT STOCKS (Giacenze serata - Ereditano la visibilità della tabella eventi)
CREATE POLICY "Isolamento Event Stocks per Locale" ON public.event_stocks
    FOR ALL USING (
        event_id IN (SELECT id FROM public.events)
    );

-- D. REPORT (Visualizzazione a tutti, Modifica solo ad Admin/Super Admin)
CREATE POLICY "Visualizzazione Report per Locale" ON public.reports
    FOR SELECT USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Report per Locale" ON public.reports
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')) AND
        (venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
         (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- E. SESSIONI ARRIVI / RESTOCK (Visualizzazione a tutti, Modifica a Staff/Admin/Super Admin)
CREATE POLICY "Visualizzazione Sessioni Arrivi per Locale" ON public.restock_sessions
    FOR SELECT USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Modifica Sessioni Arrivi per Locale" ON public.restock_sessions
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
         (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin' )
    );

-- F. ARTICOLI ARRIVI / RESTOCK ITEMS (Ereditano la visibilità da restock_sessions)
CREATE POLICY "Isolamento Articoli Arrivi per Locale" ON public.restock_items
    FOR ALL USING (
        session_id IN (SELECT id FROM public.restock_sessions)
    );

-- G. REGISTRO ATTIVITÀ / ACTIVITY LOG (Visualizzazione/Scrittura per locali consentiti)
CREATE POLICY "Isolamento Log per Locale" ON public.activity_log
    FOR ALL USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- H. PROFILI UTENTE
CREATE POLICY "Visualizzazione Profili" ON public.profiles
    FOR SELECT USING (
        venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Aggiornamento Profili" ON public.profiles
    FOR UPDATE USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Cancellazione Profili" ON public.profiles
    FOR DELETE USING (
        (
            (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' AND 
            role = 'staff' AND 
            venue_id IN (SELECT venue_id FROM public.venue_access WHERE user_id = auth.uid())
        ) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );
