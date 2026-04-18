-- LIQUIDSTOCK MANAGER: SUPABASE SCHEMA
-- Copia e incolla questo script nell'SQL Editor del tuo progetto Supabase ed eseguilo.

-- 1. Estensione necessaria per gli UUID (spesso già attiva, ma per sicurezza)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- es. 'Spirits', 'Beer', 'Wine', 'Mixer'
    unit TEXT DEFAULT 'bottle', -- es. 'bottle', 'can', 'keg'
    cost_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(10,2) DEFAULT 0.00,
    min_threshold NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. EVENTS
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT DEFAULT 'open', -- 'open' | 'closed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    is_editable_until TIMESTAMPTZ
);

-- 4. EVENT_STOCKS
CREATE TABLE IF NOT EXISTS public.event_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    initial_qty NUMERIC(10,2) NOT NULL,
    final_qty NUMERIC(10,2),
    consumed NUMERIC(10,2),
    cost_value NUMERIC(10,2),
    rev_value NUMERIC(10,2),
    stock_value_cost NUMERIC(10,2),
    stock_value_sell NUMERIC(10,2)
);

-- 5. REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    total_cost_consumed NUMERIC(10,2),
    total_revenue_est NUMERIC(10,2),
    total_margin NUMERIC(10,2),
    total_stock_value_cost NUMERIC(10,2),
    total_stock_value_sell NUMERIC(10,2),
    details_json JSONB
);

-- 6. RESTOCK LOG
CREATE TABLE IF NOT EXISTS public.restock_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    qty_added NUMERIC(10,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. REPORT EDIT LOG
CREATE TABLE IF NOT EXISTS public.report_edit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
    edited_at TIMESTAMPTZ DEFAULT NOW(),
    edited_by UUID, -- Riferimento asincrono, potrebbe essere auth.users se l'auth è abilitato strict
    field_changed TEXT NOT NULL,
    old_value NUMERIC(10,2),
    new_value NUMERIC(10,2),
    note TEXT,
    snapshot_before JSONB,
    snapshot_after JSONB
);

-- FUNZIONE TRIGGER PER UPDATED_AT (Products)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - Abilitazione generica (per ora open per sviluppo prototipo rapido)
-- ATTENZIONE: per andare in produzione aggiungere policy relative agli user_id!
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow All on Products" ON public.products FOR ALL USING (true);
CREATE POLICY "Allow All on Events" ON public.events FOR ALL USING (true);
CREATE POLICY "Allow All on Event_Stocks" ON public.event_stocks FOR ALL USING (true);
CREATE POLICY "Allow All on Reports" ON public.reports FOR ALL USING (true);
CREATE POLICY "Allow All on Restock" ON public.restock_log FOR ALL USING (true);
CREATE POLICY "Allow All on EditLogs" ON public.report_edit_log FOR ALL USING (true);
