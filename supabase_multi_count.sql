-- ============================================================
-- MULTI-COUNT SYSTEM: SUPPORTO GIACENZE COLLABORATIVE
-- ============================================================

-- 1. Crea la tabella per i conteggi parziali
CREATE TABLE IF NOT EXISTS public.event_final_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_stock_id UUID REFERENCES public.event_stocks(id) ON DELETE CASCADE,
    qty NUMERIC(10,2) NOT NULL,
    operator_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Funzione per ricalcolare la somma totale in event_stocks
CREATE OR REPLACE FUNCTION public.sync_event_stock_total()
RETURNS trigger AS $$
BEGIN
    UPDATE public.event_stocks
    SET final_qty = (
        SELECT COALESCE(SUM(qty), 0)
        FROM public.event_final_counts
        WHERE event_stock_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.event_stock_id ELSE NEW.event_stock_id END)
    )
    WHERE id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.event_stock_id ELSE NEW.event_stock_id END);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger che si attiva ad ogni inserimento/modifica/cancellazione di un conteggio
DROP TRIGGER IF EXISTS trg_sync_final_qty ON public.event_final_counts;
CREATE TRIGGER trg_sync_final_qty
AFTER INSERT OR UPDATE OR DELETE ON public.event_final_counts
FOR EACH ROW EXECUTE FUNCTION public.sync_event_stock_total();

-- 4. Abilita RLS
ALTER TABLE public.event_final_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow All on final_counts" ON public.event_final_counts FOR ALL USING (true);
