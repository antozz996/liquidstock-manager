-- 1. Tabella delle Sessioni di Carico (Arrivi)
CREATE TABLE IF NOT EXISTS public.restock_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open', -- 'open' | 'closed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);

-- 2. Tabella dei Prodotti Arrivati nella sessione
CREATE TABLE IF NOT EXISTS public.restock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.restock_sessions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 3. Abilita RLS
ALTER TABLE public.restock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_items ENABLE ROW LEVEL SECURITY;

-- 4. Policy di Isolamento per Locale
CREATE POLICY "Isolamento Sessioni Arrivi per Locale" ON public.restock_sessions
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Isolamento Articoli Arrivi per Locale" ON public.restock_items
    FOR ALL USING (
        session_id IN (SELECT id FROM public.restock_sessions)
    );
